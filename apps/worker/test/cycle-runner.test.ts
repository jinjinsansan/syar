/**
 * A-2「強制終了して再起動しても二重生成・二重払戻が起きない」を**壊して確かめる**。
 *
 * ★正常系が動くことは A-1 で分かります。ここは異常系だけを起こします。
 */

import { describe, expect, it } from 'vitest';
import { CYCLE_MS } from '@star/scheduler';
import { LOCK_KEY, runCycle, type CycleStore, type RaceSpec } from '../src/cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from '../src/env.js';

const EPOCH = 1_700_000_000_000;

/** テスト用の seed 源。★決定論（同じサイクルからは同じ値） */
/** テスト用の出走表・オッズ（中身は問わない。runCycle は素通しするだけ） */
const BUILD = () => ({ entrants: [], odds: [] });

const SEEDS = {
  serverSeed: (i: number) => `seed-${i}`,
  seedCommit: (i: number) => `commit-${i}`,
};

/** ★通報の記録。既定を「何もしない」にしないため、テストでも明示する */
const ALERTS: { cycleIndex: number; refundedBets: number; refundedEp: number }[] = [];
const ALERT = (a: { cycleIndex: number; refundedBets: number; refundedEp: number }): void => {
  ALERTS.push(a);
};

/** 記録つきの偽ストア。**同じレースが2回作られたら記録に残る** */
function makeStore(nowMs: number) {
  const races = new Set<number>();
  const createLog: number[] = [];
  const settleLog: number[] = [];
  const cancelLog: number[] = [];
  /** ★処理された順序をそのまま記録する（D-038 の順序を検査するため） */
  const order: string[] = [];
  let overdue: number[] = [];
  let locked = false;
  const store: CycleStore & {
    createLog: number[];
    settleLog: number[];
    cancelLog: number[];
    order: string[];
    races: Set<number>;
    setOverdue: (xs: number[]) => void;
  } = {
    races,
    createLog,
    settleLog,
    cancelLog,
    order,
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
    raceExists: async (i: number) => races.has(i),
    createRace: async (s: RaceSpec) => {
      order.push('create');
      createLog.push(s.cycleIndex);
      races.add(s.cycleIndex);
    },
    pendingSettlements: async () => [],
    settleRace: async (i: number) => {
      order.push('settle');
      settleLog.push(i);
    },
    overdueRaces: async () => overdue,
    cancelRace: async (i: number) => {
      order.push('cancel');
      cancelLog.push(i);
      overdue = overdue.filter((x) => x !== i); // 中止済みはもう返らない（冪等）
      return { refundedBets: 3, refundedEp: 3000 };
    },
  };
  return store;
}

describe('★A-2 冪等性（壊して確かめる）', () => {
  it('★同じ時刻で何度回しても、レースは一度しか作られない', async () => {
    const now = EPOCH + 4 * 60_000;
    const store = makeStore(now);
    for (let i = 0; i < 10; i += 1) await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    // 10周しても作成は最初の1回ぶんだけ（先行2レース）
    expect(store.createLog).toEqual([1, 2]);
    expect(new Set(store.createLog).size).toBe(store.createLog.length);
  });

  it('★「再起動」しても作り直さない（ストアは残り、プロセスだけ落ちた想定）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    const before = [...store.createLog];
    // プロセスが落ちて上がり直しても、runCycle をもう一度呼ぶだけ
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(store.createLog).toEqual(before);
  });

  it('★ロックが取れないときは何もせず戻る（例外にしない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    store.tryLock = async () => false;
    const out = await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(out.lockBusy).toBe(true);
    expect(out.created).toEqual([]);
    // ★例外にすると再起動ループになり A-1（24時間稼働）が壊れる
  });

  it('★処理中に例外が出てもロックを解放する（次の周が永久待ちにならない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    let unlocked = false;
    store.unlock = async () => {
      unlocked = true;
    };
    store.createRace = async () => {
      throw new Error('生成失敗');
    };
    await expect(runCycle(store, EPOCH, SEEDS, BUILD, ALERT)).rejects.toThrow('生成失敗');
    expect(unlocked).toBe(true);
  });

  it('★時刻が進めば新しいレースだけを作る（既存は作り直さない）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(store.createLog).toEqual([1, 2]);
    store.serverNowMs = async () => EPOCH + CYCLE_MS + 4 * 60_000;
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    // 次のサイクルでは 3 だけが増える（2 は既存）
    expect(store.createLog).toEqual([1, 2, 3]);
  });

  it('★ワーカーの時計を使わない（serverNowMs だけを見る）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    const out = await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(out.nowMs).toBe(EPOCH + 4 * 60_000);
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
    const store = makeStore(EPOCH + 4 * 60_000);
    store.setOverdue([99]);
    // 確定すべきレースがある状態にする
    store.pendingSettlements = async () => [7];
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    // ★「生成より前に確定がある」ではなく**並びそのもの**を見る。
    //   前者だと生成が0本の周でも通ってしまい、順序を検査したことになりません。
    expect(store.order).toEqual(['settle', 'cancel', 'create', 'create']);
  });

  it('★確定が先なので、生成に時間がかかっても確定は待たされない', async () => {
    // 生成1本に相当する時間を測る代わりに、生成の中で確定済みかを確認する
    const store = makeStore(EPOCH + 4 * 60_000);
    store.pendingSettlements = async () => [7];
    let settledWhenCreating = false;
    const build = () => {
      settledWhenCreating = store.settleLog.length > 0;
      return { entrants: [], odds: [] };
    };
    await runCycle(store, EPOCH, SEEDS, build, ALERT);
    expect(settledWhenCreating).toBe(true);
  });
});

describe('★D-037 確定できないレースを期限で中止し EP を返す', () => {
  it('★期限切れのレースを中止し、通報する', async () => {
    ALERTS.length = 0;
    const store = makeStore(EPOCH + 4 * 60_000);
    store.setOverdue([11, 12]);
    const out = await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(out.cancelled).toEqual([11, 12]);
    expect(store.cancelLog).toEqual([11, 12]);
    // ★黙って返還しない。通報が無ければ原因が調査されない（D-037）
    expect(ALERTS.map((a) => a.cycleIndex)).toEqual([11, 12]);
    expect(ALERTS[0]!.refundedEp).toBe(3000);
  });

  it('★期限内なら中止しない（境界の両側・R-2）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    store.setOverdue([]); // まだ期限に達していない
    const out = await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(out.cancelled).toEqual([]);
    expect(store.cancelLog).toEqual([]);
  });

  it('★二度回しても二重に返還しない（冪等）', async () => {
    const store = makeStore(EPOCH + 4 * 60_000);
    store.setOverdue([21]);
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    await runCycle(store, EPOCH, SEEDS, BUILD, ALERT);
    expect(store.cancelLog).toEqual([21]);
  });
});
