/**
 * A-2「強制終了して再起動しても二重生成・二重払戻が起きない」を**壊して確かめる**。
 *
 * ★正常系が動くことは A-1 で分かります。ここは異常系だけを起こします。
 */

import { describe, expect, it } from 'vitest';
import { CYCLE_MS, frozenCourseOf } from '@star/scheduler';
import { LOCK_KEY, runCycle, type CycleStore, type RaceSpec } from '../src/cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from '../src/env.js';

/**
 * ★空の出走表。Q-P3-32 で `build` の戻り値に `conditions` が加わったので、
 *   ここでも返します。**A-2 は生成の冪等性を見るので中身は問いません。**
 */
const CONDITIONS = {
  surface: 'turf' as const, distance: 1600, courseId: 'star-park',
  trackCondition: 'good' as const,
  courseFrozen: frozenCourseOf('star-park'),
};
const EMPTY_BUILD = { entrants: [], odds: [], excluded: [] };

const EPOCH = 1_700_000_000_000;

/**
 * ★**サイクル 0 の中の時刻**（★発売中の相）。
 *
 * ★以前は `EPOCH + 4 * 60_000` を直に書いていましたが、★**「4 分」はサイクルが 10 分だった頃の値**で、
 *   ★D-007 改訂（3 分）では**サイクル 1 に入ってしまい**、★`racesToPrepare` の期待が [1,2] から [2,3] にずれました。
 * → ★**サイクル長から取ります**（★10 分なら 4:00・3 分なら 1:12。★どちらも発売中の相）。
 */
const IN_FIRST_CYCLE = EPOCH + Math.floor(CYCLE_MS * 0.4);

/** テスト用の seed 源。★決定論（同じサイクルからは同じ値） */
/** テスト用の出走表・オッズ（中身は問わない。runCycle は素通しするだけ） */
const BUILD = async () => (EMPTY_BUILD);
/** ★公示の条件（★D-117 ①）。★乱数は引かない — ★中身は問わない */
const ANNOUNCE = () => CONDITIONS;

const SEEDS = {
  serverSeed: (i: number) => `seed-${i}`,
  seedCommit: (i: number) => `commit-${i}`,
};

/** ★通報の記録。既定を「何もしない」にしないため、テストでも明示する */
const ALERTS: { cycleIndex: number; refundedBets: number; refundedEp: number }[] = [];
const ALERT = (a: { cycleIndex: number; refundedBets: number; refundedEp: number }): void => {
  ALERTS.push(a);
};

/**
 * 記録つきの偽ストア。**同じレースが2回作られたら記録に残る**
 *
 * ★2026-09-19・**D-117**: ★生成が ★**公示（announce）→ 組成（fill）** の 2 段になりました。
 *   ★`announceLog` / `fillLog` を別に取ります（★どちらの段で二重になったかを言えるように）。
 */
function makeStore(nowMs: number) {
  /** ★公示済み（★`status = 'announced'`） */
  const announcedSet = new Set<number>();
  /** ★組成済み（★`status = 'scheduled'`） */
  const races = new Set<number>();
  const announceLog: number[] = [];
  const fillLog: number[] = [];
  const settleLog: number[] = [];
  const cancelLog: number[] = [];
  /** ★DS-5 ④: 発走前の引退確認を呼んだ番号と、その時取消になる頭数 */
  const retireCheckLog: number[] = [];
  const retired = new Map<number, number>();
  let retireSkip = false;
  /** ★処理された順序をそのまま記録する（D-038 の順序を検査するため） */
  const order: string[] = [];
  let overdue: number[] = [];
  let locked = false;
  /** ★`registeredHorses` が返すもの（★DS-2 の検査で差し替える） */
  const registered = new Map<number, readonly string[]>();
  const store: CycleStore & {
    announceLog: number[];
    fillLog: number[];
    settleLog: number[];
    cancelLog: number[];
    order: string[];
    races: Set<number>;
    announcedSet: Set<number>;
    registered: Map<number, readonly string[]>;
    retireCheckLog: number[];
    retired: Map<number, number>;
    setRetireSkip: (v: boolean) => void;
    setOverdue: (xs: number[]) => void;
  } = {
    races,
    announcedSet,
    registered,
    announceLog,
    fillLog,
    settleLog,
    cancelLog,
    order,
    retireCheckLog,
    retired,
    setRetireSkip: (v: boolean) => {
      retireSkip = v;
    },
    setOverdue: (xs: number[]) => {
      overdue = xs;
    },
    serverNowMs: async () => nowMs,
    tryLock: async () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    unlock: async () => {
      locked = false;
    },
    // ★公示だけでも「もう在る」。★`racesToAnnounce` が飛ばす条件はこちら
    raceExists: async (i: number) => races.has(i) || announcedSet.has(i),
    createRace: async (s: RaceSpec) => {
      await store.announceRace(s);
      await store.fillRace(s.cycleIndex, { entrants: s.entrants, odds: s.odds, registered: [] });
    },
    announceRace: async (s) => {
      order.push('announce');
      announceLog.push(s.cycleIndex);
      announcedSet.add(s.cycleIndex);
    },
    announcedRaces: async () => [...announcedSet].sort((a, b) => a - b),
    announcedConditions: async (i: number) =>
      announcedSet.has(i) ? { cycleIndex: i, conditions: CONDITIONS } : null,
    registeredHorses: async (i: number) => registered.get(i) ?? [],
    fillRace: async (i: number, spec) => {
      order.push('fill');
      // ★`fillRace` の約束: ★登録した馬が出走表に無ければ投げる（★DS-2）
      const missing = spec.registered.filter((h) => !spec.entrants.some((e) => e.horseId === h));
      if (missing.length > 0) throw new Error(`登録済みの ${missing.length} 頭が出走表にありません`);
      fillLog.push(i);
      announcedSet.delete(i);
      races.add(i);
    },
    pendingSettlements: async () => [],
    /**
     * ★**本物の述語を写します**（★**FK-5**・DS-5 ④）。
     *   ★本物（`pg-store.ts`）は `status = 'scheduled'` のレースだけを見、
     *   ★**確定済みのレースには何もしません**（★払戻の後に結果を消さない）。
     *   ★`retired` に入っている番号だけを 1 頭取消にします。
     */
    scratchRetiredBeforeStart: async (i: number) => {
      order.push('retire-check');
      retireCheckLog.push(i);
      if (!races.has(i)) return { scratched: 0, refundedEp: 0, skipped: false };
      const n = retired.get(i) ?? 0;
      return { scratched: n, refundedEp: n * 500, skipped: retireSkip };
    },
    settleRace: async (i: number) => {
      order.push('settle');
      settleLog.push(i);
    },
    overdueRaces: async () => overdue,
    /**
     * 🔴 ★**本物の述語を写します**（★2026-09-19・**FK-3**）。
     *   ★本物（`cancel.ts`）は `where cycle_index = $1 and status in ('scheduled','announced')` で、
     *   ★**どちらでもない番号には 0 行**です。★無条件に成功を返す偽物は、
     *   ★**本物が `'scheduled'` だけを見ていた欠陥を素通し**しました（★実際に素通しした）。
     */
    cancelRace: async (i: number) => {
      /**
       * ⚠️ ★`pendingSettlements` が返す番号も ★**本物では `status = 'scheduled'`** です
       *    （★そういう条件で引いているので）。★だから中止できます。
       *    ★検査が `pendingSettlements` を差し替えるので、★ここでも同じ扱いにします。
       */
      const pending = await store.pendingSettlements(0);
      const known = races.has(i) || announcedSet.has(i) || overdue.includes(i) || pending.includes(i);
      if (!known) return { refundedBets: 0, refundedEp: 0 };
      order.push('cancel');
      cancelLog.push(i);
      overdue = overdue.filter((x) => x !== i); // 中止済みはもう返らない（冪等）
      races.delete(i);
      // ★D-117: ★組成が間に合わず中止したレースは、もう公示でもない
      announcedSet.delete(i);
      return { refundedBets: 3, refundedEp: 3000 };
    },
  };
  return store;
}

describe('★A-2 冪等性（壊して確かめる）', () => {
  it('★同じ時刻で何度回しても、レースは一度しか作られない', async () => {
    const now = IN_FIRST_CYCLE;
    const store = makeStore(now);
    for (let i = 0; i < 10; i += 1) await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    // 10周しても作成は最初の1回ぶんだけ（先行2レース）
    expect(store.fillLog).toEqual([1, 2]);
    expect(new Set(store.fillLog).size).toBe(store.fillLog.length);
  });

  it('★「再起動」しても作り直さない（ストアは残り、プロセスだけ落ちた想定）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    const before = [...store.fillLog];
    // プロセスが落ちて上がり直しても、runCycle をもう一度呼ぶだけ
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(store.fillLog).toEqual(before);
  });

  it('★ロックが取れないときは何もせず戻る（例外にしない）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.tryLock = async () => false;
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.lockBusy).toBe(true);
    expect(out.filled).toEqual([]);
    // ★例外にすると再起動ループになり A-1（24時間稼働）が壊れる
  });

  it('★処理中に例外が出てもロックを解放する（次の周が永久待ちにならない）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    let unlocked = false;
    store.unlock = async () => {
      unlocked = true;
    };
    // ★D-117: ★`runCycle` は `createRace` を呼びません。★組成で落とします
    store.fillRace = async () => {
      throw new Error('生成失敗');
    };
    await expect(runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT)).rejects.toThrow('生成失敗');
    expect(unlocked).toBe(true);
  });

  it('★時刻が進めば新しいレースだけを作る（既存は作り直さない）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(store.fillLog).toEqual([1, 2]);
    store.serverNowMs = async () => IN_FIRST_CYCLE + CYCLE_MS;
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    // 次のサイクルでは 3 だけが増える（2 は既存）
    expect(store.fillLog).toEqual([1, 2, 3]);
  });

  it('★ワーカーの時計を使わない（serverNowMs だけを見る）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.nowMs).toBe(IN_FIRST_CYCLE);
    expect(out.cycleIndex).toBe(0);
  });

  it('advisory lock のキーは固定値（用途ごとに衝突させない）', () => {
    expect(LOCK_KEY.CYCLE).toBe(0x5741_0001);
  });
});

describe('★A-7 環境ガード', () => {
  it('★宣言と DB が一致しなければ起動失敗', () => {
    expect(() => assertEnvironmentMatches('staging', 'production')).toThrow(/一致しません/);
    expect(() => assertEnvironmentMatches('production', 'staging')).toThrow(/一致しません/);
  });

  it('★DB に宣言が無ければ起動失敗（不明なら止める）', () => {
    expect(() => assertEnvironmentMatches('production', null)).toThrow(/確認できない/);
  });

  it('一致していれば通る', () => {
    expect(() => assertEnvironmentMatches('production', 'production')).not.toThrow();
  });

  it('★必須の環境変数が欠けていれば起動失敗（空文字も欠落扱い）', () => {
    expect(() => loadConfig({})).toThrow(/STAR_ENV/);
    expect(() => loadConfig({ STAR_ENV: '  ' })).toThrow(/STAR_ENV/);
    expect(() => loadConfig({ STAR_ENV: 'prod' })).toThrow(/不正/);
  });

  it('★起点が ISO8601 でなければ起動失敗', () => {
    expect(() =>
      loadConfig({
        STAR_ENV: 'development',
        STAR_EPOCH_ISO: 'いつか',
        DATABASE_URL: 'x',
        SUPABASE_URL: 'x',
        SUPABASE_SERVICE_ROLE_KEY: 'x',
      }),
    ).toThrow(/ISO8601/);
  });
});


describe('★D-038 確定を生成より先に処理する', () => {
  it('★確定 → 中止 → 生成 の順で処理される', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.setOverdue([99]);
    // 確定すべきレースがある状態にする
    store.pendingSettlements = async () => [7];
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    // ★「生成より前に確定がある」ではなく**並びそのもの**を見る。
    //   前者だと生成が0本の周でも通ってしまい、順序を検査したことになりません。
    /**
     * ★2026-09-19・**D-117**: ★生成が ★**公示 ×4 → 組成 ×2** に割れました。
     *   ★`announce` が 4 本なのは `ANNOUNCE_AHEAD_RACES = 4`、
     *   ★`fill` が 2 本なのは `MAX_FILLS_PER_CYCLE = 2`（★DS-9）。
     * ⚠️ ★**確定と中止が先にある**ことは変わりません（D-038）。
     *
     * ★2026-09-19・**DS-5 ④**: ★確定の前に `retire-check` が 1 本 入りました。
     *   🔴 ★**確定の前でなければ意味がありません** — ★後に置くと
     *   ★引退した馬が走ってから取消になります。★並びそのもので固定します。
     */
    expect(store.order).toEqual([
      'retire-check', 'settle', 'cancel',
      'announce', 'announce', 'announce', 'announce',
      'fill', 'fill',
    ]);
  });

  it('★確定が先なので、生成に時間がかかっても確定は待たされない', async () => {
    // 生成1本に相当する時間を測る代わりに、生成の中で確定済みかを確認する
    const store = makeStore(IN_FIRST_CYCLE);
    store.pendingSettlements = async () => [7];
    let settledWhenCreating = false;
    const build = async () => {
      settledWhenCreating = store.settleLog.length > 0;
      return EMPTY_BUILD;
    };
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, build, ALERT);
    expect(settledWhenCreating).toBe(true);
  });
});

describe('★DS-5 ④ 発走の前に引退していた馬を、確定の前に取消にする', () => {
  /**
   * 🔴 ★**組成 → 発走（12 分）の窓**です（★D-111 ③⑥）。
   *   ★その馬は凍結を持っているので、★`entry-freeze` も D-111 ④ も拾いません。
   *
   * ⚠️ ★ここで見るのは **配線**だけです。★**どの馬を取消にするかの判断（発走時刻の週）**は
   *    ★`tools/verify-ds5-before-start-scratch.mjs` が ★**実 DB** で見ます（★FK-5）。
   */
  it('🔴 ★確定の**前**に引退を見る（★順序が逆なら、引退した馬が走ってから取消になる）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.races.add(7);
    store.pendingSettlements = async () => [7];
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    const i = store.order.indexOf('retire-check');
    const j = store.order.indexOf('settle');
    expect(i, '★引退の確認が呼ばれていない').toBeGreaterThanOrEqual(0);
    expect(i, '★確定の後に見ている').toBeLessThan(j);
  });

  it('★取消にした頭数が周の結果に出る（★黙って通さない・D-111 ⑤）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.races.add(7);
    store.retired.set(7, 2);
    store.pendingSettlements = async () => [7];
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.scratchedBeforeStart).toBe(2);
    expect(out.settled).toEqual([7]);
  });

  it('★対照: 引退が 0 頭なら 0 と出る（★上の検査が空振りでない）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.races.add(7);
    store.pendingSettlements = async () => [7];
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.scratchedBeforeStart).toBe(0);
    expect(out.retireCheckSkipped).toEqual([]);
  });

  it('🔴 ★見送ったときは番号が残る（★`epochMs` が無い周を黙って通さない・R-16）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.races.add(7);
    store.setRetireSkip(true);
    store.pendingSettlements = async () => [7];
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.retireCheckSkipped).toEqual([7]);
  });

  it('🔴 ★引退の確認が投げたら、確定に進まない（★引退した馬を走らせない）', async () => {
    ALERTS.length = 0;
    const store = makeStore(IN_FIRST_CYCLE);
    store.races.add(7);
    store.pendingSettlements = async () => [7];
    store.scratchRetiredBeforeStart = async () => { throw new Error('取消に失敗'); };
    await expect(runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT)).rejects.toThrow('取消に失敗');
    expect(store.settleLog, '★取消が落ちたのに確定している').toEqual([]);
  });
});

describe('★D-056 凍結が無いレースは確定せず中止する', () => {
  /**
   * ★旧経路（`horses` を読み直す）に落とすのが D-055 で閉じた欠陥そのものなので、
   *   フォールバックを持たず**中止に載せます**。ここで検査するのは:
   *     ① 確定済みに数えない（結果を出してしまわない）
   *     ② 中止に載る（返還される）
   *     ③ ★アラートに出る（黙って劣化しない）
   *     ④ ★対照: 凍結があれば普通に確定する（①〜③が空振りでない）
   */
  const unfrozen = (cycleIndex: number): Error => {
    const e = new Error(`cycle=${cycleIndex} の出走馬に凍結がありません`);
    e.name = 'UnfrozenRaceError';
    return e;
  };

  it('★凍結が無ければ確定せず、中止して通報する', async () => {
    ALERTS.length = 0;
    const store = makeStore(IN_FIRST_CYCLE);
    store.pendingSettlements = async () => [21];
    store.settleRace = async (i: number) => { throw unfrozen(i); };
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.settled).toEqual([]);          // ① 結果を出していない
    expect(out.cancelled).toEqual([21]);      // ② 中止に載った
    expect(store.cancelLog).toEqual([21]);
    expect(ALERTS.map((a) => a.cycleIndex)).toEqual([21]); // ③ 黙っていない
  });

  it('★対照: 凍結があれば普通に確定する（上の検査が空振りでない）', async () => {
    ALERTS.length = 0;
    const store = makeStore(IN_FIRST_CYCLE);
    store.pendingSettlements = async () => [21];
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.settled).toEqual([21]);
    expect(out.cancelled).toEqual([]);
    expect(ALERTS).toEqual([]);
  });

  /**
   * ★**走路の凍結が不正**（★2026-09-15・指示書 VW §5-2）も同じ経路（中止・返還・通報）に載る。
   *   ★名前で判定しているので、★名前を変えるとここが落ちます。
   */
  it('★走路の凍結が不正なら確定せず、中止して通報する', async () => {
    ALERTS.length = 0;
    const store = makeStore(IN_FIRST_CYCLE);
    store.pendingSettlements = async () => [23];
    store.settleRace = async (i: number) => {
      const e = new Error(`cycle=${i}: 走路の凍結が不正です`);
      e.name = 'InvalidFrozenCourseError';
      throw e;
    };
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.settled).toEqual([]);
    expect(out.cancelled).toEqual([23]);
    expect(ALERTS.map((a) => a.cycleIndex)).toEqual([23]);
  });

  it('★凍結と無関係な失敗は握り潰さない（中止に化けさせない）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.pendingSettlements = async () => [22];
    store.settleRace = async () => { throw new Error('DB が落ちた'); };
    await expect(runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT)).rejects.toThrow('DB が落ちた');
    // ★中止に載せてしまうと、DB 障害が「開催中止」として静かに返還され続けます
    expect(store.cancelLog).toEqual([]);
  });
});

describe('★D-037 確定できないレースを期限で中止し EP を返す', () => {
  it('★期限切れのレースを中止し、通報する', async () => {
    ALERTS.length = 0;
    const store = makeStore(IN_FIRST_CYCLE);
    store.setOverdue([11, 12]);
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.cancelled).toEqual([11, 12]);
    expect(store.cancelLog).toEqual([11, 12]);
    // ★黙って返還しない。通報が無ければ原因が調査されない（D-037）
    expect(ALERTS.map((a) => a.cycleIndex)).toEqual([11, 12]);
    expect(ALERTS[0]!.refundedEp).toBe(3000);
  });

  it('★期限内なら中止しない（境界の両側・R-2）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.setOverdue([]); // まだ期限に達していない
    const out = await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(out.cancelled).toEqual([]);
    expect(store.cancelLog).toEqual([]);
  });

  it('★二度回しても二重に返還しない（冪等）', async () => {
    const store = makeStore(IN_FIRST_CYCLE);
    store.setOverdue([21]);
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    await runCycle(store, EPOCH, SEEDS, ANNOUNCE, BUILD, ALERT);
    expect(store.cancelLog).toEqual([21]);
  });
});
