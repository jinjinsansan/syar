/**
 * ゲームループ1周（正典 §10.2 / 合格基準 A-1・A-2）
 *
 * 【A-2 の設計 — 「二重に作らない」を3層で担保する】
 *   1. **サイクル番号**は時刻だけから決まる（`@star/scheduler`）。
 *      再起動しても同じ時刻からは同じ番号が出る
 *   2. **advisory lock** で同時実行を1つに絞る。デプロイ中に2プロセスが重なっても
 *      片方は何もせずに戻る
 *   3. **存在確認してから作る**。ロックを取れても、既に作られていれば作らない
 *
 *   ★1つでは足りません。1だけだと同時実行で二重に作れます。2だけだとロックが
 *     切れた隙に二重に作れます。3だけだと確認と作成の間に割り込まれます。
 *     **3層が揃って初めて「二重に作らない」と言えます。**
 *
 * 【時刻】
 *   ゲーム内時刻の真実は **Postgres の `now()` のみ**（§14）。
 *   ワーカーの時計は使いません。`Date.now()` をこのファイルで呼びません。
 */

import {
  MAX_FILLS_PER_CYCLE,
  PHASE_OFFSET_MS,
  cycleIndexAt,
  cycleStartMs,
  entryDeadlineMs,
  isOnSale,
  phaseAt,
  racesToAnnounce,
  weekIndexAt,
  type Phase,
} from '@star/scheduler';
import {
  classOf, gradeOf, prizeTierOf, purseOf,
  type FrozenCourseRecord,
  type RaceConditions,
} from '@star/scheduler';

/** DB 操作の注入口。テストで差し替えられるようにし、SQL をここに書かない */
export interface CycleStore {
  /** Postgres の now()（ミリ秒）。★ワーカーの時計を使わない */
  serverNowMs(): Promise<number>;
  /** advisory lock を試みる。取れなければ false（待たない） */
  tryLock(key: number): Promise<boolean>;
  unlock(key: number): Promise<void>;
  /** そのサイクル番号のレースが既に存在するか */
  raceExists(cycleIndex: number): Promise<boolean>;
  /** レースを作る（オッズ算出まで含む）。★= 公示 → 組成 を続けて行う */
  createRace(spec: RaceSpec): Promise<void>;
  /**
   * ★**公示**（★2026-09-19・**D-117** ①）。★`races` の行だけ作る（`status = 'announced'`）。
   *   ★出走表もオッズもまだありません。★ここから登録（`enter_race`）を受け付けます。
   */
  announceRace(spec: AnnounceSpec): Promise<void>;
  /** ★組成を待っているレースの番号（`status = 'announced'`）。★小さい順 */
  announcedRaces(): Promise<number[]>;
  /**
   * ★**公示のとき書いた条件**（★D-117）。★組成はこれを読み直します。
   *   ⚠️ ★引き直さないこと（D-052）。★特に `courseFrozen` は**公示の時点の凍結**です。
   *   ★その番号のレースが無い／公示済みでなければ `null`。
   */
  announcedConditions(cycleIndex: number): Promise<AnnouncedRace | null>;
  /**
   * ★**登録された馬**（★D-117 ②・**DS-2**）。★`race_entries` に既に行がある馬の id。
   *   ★組成は**この馬を必ず出走表に入れます**（★登録したのに走れないことがない）。
   */
  registeredHorses(cycleIndex: number): Promise<readonly string[]>;
  /**
   * ★**組成**（★D-117 ②）。★出走表とオッズを入れ、★`status` を `scheduled` にします。
   *   ★登録済みの行は**更新**し（`jockey_frozen`・`client_token` を保つ）、★残りを挿入します。
   */
  fillRace(cycleIndex: number, spec: FillSpec): Promise<void>;
  /** 確定していない、発走時刻を過ぎたレースの番号 */
  pendingSettlements(nowMs: number): Promise<number[]>;
  /**
   * 🔴 ★**発走の前に引退していた馬を取消にする**（★**DS-5 ④**・正典 **D-111 ③⑥**・2026-09-19）。
   *
   *   ★組成 → 発走（12 分）に引退した馬は ★**凍結を持っているので誰も拾いません**
   *   （★`entry-freeze` も D-111 ④ も「凍結が**無い**」を見るため）。
   *   → ★**確定の直前にもう 1 度 見ます。**
   *
   * ⚠️ ★**「いま引退しているか」ではありません** — ★確定は発走より後に走るので、
   *    ★それだと ★**走った馬の結果まで消します**。★実装は発走時刻の週で切ります。
   * ★`skipped` … ★週が出せず見送ったとき（★黙って見送らない・R-16）。
   */
  scratchRetiredBeforeStart(
    cycleIndex: number,
  ): Promise<{ scratched: number; refundedEp: number; skipped: boolean }>;
  settleRace(cycleIndex: number): Promise<void>;
  /**
   * ★確定できないまま `CANCEL_AFTER_START_MS` を過ぎたレースの番号（D-037）。
   *   `pendingSettlements` と違い、**もう確定を待たない**ものを返します。
   */
  overdueRaces(nowMs: number): Promise<number[]>;
  /** ★開催中止にして全ベットを EP で返還する（D-037・§9.1）。冪等 */
  cancelRace(cycleIndex: number): Promise<{ refundedBets: number; refundedEp: number }>;
}

export interface RaceSpec {
  readonly cycleIndex: number;
  readonly raceClass: ReturnType<typeof classOf>;
  readonly grade: ReturnType<typeof gradeOf>;
  /** 発走時刻（サイクル番号から決まる。★ワーカーの時計を使わない） */
  readonly scheduledAtMs: number;
  /**
   * ★**登録の締切**（★2026-09-19・**ED-1**）。★publish より前。
   * ⚠️ ★**SQL に時間の式を書かないため**にここから渡します（D-052・D-103 ④）。
   */
  readonly entryDeadlineAtMs: number;
  /**
   * ★**ゲーム内の何週めか**（★2026-09-19・**UI-4**）。★世界時計と同じ `weekIndexAt()` で決めます。
   * ⚠️ ★SQL にも画面にも週の式を書かないため、★ここから渡します（D-052・D-103 ④）。
   */
  readonly gameWeek: number;
  /** §8.6 のコミット。発走前に公開する */
  readonly seedCommit: string;
  /**
   * §8.6 の server_seed。**生成時に DB へ保存する**。
   * ★プロセスの秘密から毎回導出する形だと、再起動で秘密が変わり
   *   コミット済みのレースの reveal を出せなくなります（Provably Fair が成立しない）。
   */
  readonly serverSeed: string;
  /** 賞金総額（§11.1）。★PP の主な発行源（§9.3） */
  readonly purse: number;
  /** ★§10.3/§10.4 の条件。サイクル番号だけから決まる（乱数で決めると commit 後に変わる） */
  /**
   * ★オッズを計算したときの条件（Q-P3-32）。**馬場状態も含みます。**
   *   `RaceConditions`（番組表の出力）は馬場状態を持たないので、ここで足します。
   */
  readonly conditions: RaceConditions & {
    readonly trackCondition: 'good' | 'yielding' | 'soft' | 'bad';
    /** ★オッズを計算した走路の形（★2026-09-15・`races.course_frozen`）。★確定はこれを読む */
    readonly courseFrozen: FrozenCourseRecord;
  };
  /** 出走表（§10.4 の同格帯から組む。D-018） */
  readonly entrants: readonly RaceEntrantSpec[];
  /** オッズ（§9.2 のモンテカルロ実測） */
  readonly odds: readonly OddsSpec[];
}

/**
 * ★**公示で書くもの**（★2026-09-19・**D-117** ①）。
 *   ★`RaceSpec` から出走表とオッズを抜いたものです。
 * ⚠️ ★**抜いたのであって、別に定義していません** — ★項目が増えたら両方に入ります（D-052）。
 */
export type AnnounceSpec = Omit<RaceSpec, 'entrants' | 'odds'>;

/** ★**公示のとき書いた条件**（★D-117 ②が読み直す） */
export interface AnnouncedRace {
  readonly cycleIndex: number;
  readonly conditions: RaceSpec['conditions'];
}

/** ★**組成で書くもの**（★2026-09-19・**D-117** ②） */
export interface FillSpec {
  readonly entrants: readonly RaceEntrantSpec[];
  readonly odds: readonly OddsSpec[];
  /**
   * ★**すでに `race_entries` に行がある馬**（★プレイヤーが登録した馬）。
   *   ★この馬は**挿入ではなく更新**します（★`jockey_frozen` と `client_token` を消さない）。
   * ⚠️ ★`entrants` に必ず含まれていること — ★含まれていなければ `fillRace` が投げます。
   */
  readonly registered: readonly string[];
}

export interface RaceEntrantSpec {
  readonly horseId: string;
  readonly gate: number;
  readonly weightKg: number;
  readonly strategy: string;
  /** モンテカルロ勝率順位（§9.2）。算出前は undefined */
  readonly popularity?: number | undefined;
  /**
   * ★オッズ計算に使った出走馬そのもの（0016）。確定はこれを使い、`horses` を読み直しません。
   *   ★型を `RaceEntrant` に固定していないのは、この層が race-engine に依存しないためです。
   *     中身は `RaceEntrant` で、`settleRace` が復元します。
   */
  readonly snapshot?: Readonly<Record<string, unknown>> | undefined;
}

export interface OddsSpec {
  readonly betType: string;
  readonly selection: readonly number[];
  readonly probability: number;
  readonly odds: number;
  readonly capped: boolean;
}

/** §8.6 の seed を作る。ハッシュとプロセス秘密は呼び出し側から注入する */
export interface SeedSource {
  serverSeed(cycleIndex: number): string;
  seedCommit(cycleIndex: number): string;
}

/** advisory lock のキー。★用途ごとに固定値。他の用途と衝突させない */
export const LOCK_KEY = { CYCLE: 0x5741_0001 } as const;

export interface CycleOutcome {
  readonly nowMs: number;
  readonly cycleIndex: number;
  readonly phase: Phase;
  readonly onSale: boolean;
  /**
   * ★**組成まで終わったレース**（★2026-09-19・**D-117** ②）。
   *   ⚠️ ★旧名 `created`。★D-117 で生成が 2 段になったので、★**どちらの段か**を名前で言います。
   */
  readonly filled: readonly number[];
  /** ★**公示したレース**（★D-117 ①・★既にあったものは含まない） */
  readonly announced: readonly number[];
  /**
   * ★**締切を過ぎているのに、この周では組成しなかったレース**（★**DS-8**）。
   *   ★`MAX_FILLS_PER_CYCLE` に当たった分です。★**0 でない周が続いたら遅れています**。
   */
  readonly fillDeferred: readonly number[];
  /**
   * ★**発売開始までに組成が終わらず、中止にしたレース**（★**DS-6/DS-7**）。
   *   ★馬券は 1 枚も売れていません（`place_bet` は `scheduled` だけ）。
   *   ★返すのは**登録料と騎手の料金**です。★0 でない周は必ず調査対象。
   */
  readonly fillFailed: readonly number[];
  /** 既にあったので作らなかったレース */
  readonly skipped: readonly number[];
  readonly settled: readonly number[];
  /**
   * ★**発走の前に引退していて取消にした頭数**（★**DS-5 ④**・D-111 ③⑥）。
   *   ⚠️ ★**0 でない周は、その馬を含む馬券が §9.1 で返っています。★黙って通さないこと。**
   */
  readonly scratchedBeforeStart: number;
  /**
   * ★**週が出せず、発走前の引退確認を見送ったレースの番号**（★DS-5 ④・R-16）。
   *   🔴 ★**0 でない周は、引退した馬が走りえます。** ★`epochMs` が渡っていません。
   */
  readonly retireCheckSkipped: readonly number[];
  /** ★確定できず開催中止にしたレース（D-037）。★0 でない周は必ず調査対象 */
  readonly cancelled: readonly number[];
  /**
   * ★**組成が発売開始の後に終わったレースと、その遅れ [ms]**（★発売の時間がそのぶん短くなった・2026-09-23）。
   *   ★0 件でない周は ★周の全体が伸びている印（★手順書 ⑥ で秒数を報告する）。
   */
  readonly salesLate: readonly { readonly cycleIndex: number; readonly lateMs: number }[];
  /** ロックが取れずに何もしなかった */
  readonly lockBusy: boolean;
}

/**
 * 1周ぶんの処理。**何度呼んでも同じ結果になる**（冪等）。
 *
 * ⚠️ 例外を投げるのは「続けると壊れる」場合だけ。
 *    ロックが取れないのは正常系なので `lockBusy` で返します
 *    （例外にすると再起動ループになり、A-1 の24時間稼働が壊れます）。
 */
export async function runCycle(
  store: CycleStore,
  epochMs: number,
  seeds: SeedSource,
  /**
   * ★**公示の条件を決める**（★2026-09-19・**D-117** ①）。
   *   ★番組表（`conditionsOf`）＋ ★馬場状態（`announceConditions`）。★出走馬は見ません。
   * ⚠️ ★**乱数を引くのはここ 1 回だけ**です。★組成は行から読み直します（D-052）。
   */
  announce: (cycleIndex: number) => RaceSpec['conditions'],
  /**
   * ★**出走表とオッズを作る**（★2026-09-19・**D-117** ②）。
   *
   * @param conditions ★**公示の行から読んだ条件**（★引き直さない・R-30）
   * @param registered ★**登録済みの馬**（★必ず出走表に入れること・DS-2）
   */
  build: (
    cycleIndex: number,
    conditions: RaceSpec['conditions'],
    registered: readonly string[],
  ) => Promise<{
    readonly entrants: readonly RaceEntrantSpec[];
    readonly odds: readonly OddsSpec[];
    /**
     * ★**抽選に外れた馬**（★正典 §10.4 の完全抽選・**LT-1〜LT-4**）。
     *   ★登録が 18 頭を超えたときだけ空でなくなります。
     * ⚠️ ★返金と理由の通知は ★**`build` の側が済ませています**（★D-111 ③⑤ の経路）。
     *    ★ここは「出走しない」ことを `fillRace` に伝えるだけです。
     */
    readonly excluded: readonly string[];
  }>,
  /**
   * ★開催中止が起きたときの通報（正典 D-037）。
   *   **既定を「何もしない」にしません。** 黙って返還されると原因が調査されないので、
   *   呼ぶ側が通報先を明示する必要があります（省略できない引数にしてあります）。
   */
  onAlert: (a: { cycleIndex: number; refundedBets: number; refundedEp: number }) => void,
): Promise<CycleOutcome> {
  const nowMs = await store.serverNowMs();
  const cycleIndex = cycleIndexAt(nowMs, epochMs);
  const phase = phaseAt(nowMs, epochMs);
  const onSale = isOnSale(nowMs, epochMs);

  const locked = await store.tryLock(LOCK_KEY.CYCLE);
  if (!locked) {
    return {
      nowMs, cycleIndex, phase, onSale,
      filled: [], announced: [], fillDeferred: [], fillFailed: [],
      skipped: [], settled: [], cancelled: [], lockBusy: true,
      scratchedBeforeStart: 0, retireCheckSkipped: [], salesLate: [],
    };
  }

  const filled: number[] = [];
  const announced: number[] = [];
  const fillDeferred: number[] = [];
  const fillFailed: number[] = [];
  const skipped: number[] = [];
  const settled: number[] = [];
  /** ★DS-5 ④: 発走の前に引退していて取消にした頭数と、見送ったレース */
  let scratchedBeforeStart = 0;
  const retireCheckSkipped: number[] = [];
  const cancelled: number[] = [];
  const salesLate: { cycleIndex: number; lateMs: number }[] = [];
  try {
    // --- 1. 確定と払戻（★生成より先に。正典 D-038） ---
    //
    // ★余裕の小さい仕事を先に処理する。
    //   確定の期限は**サイクル境界ちょうど**で、生成の引き金も同じ境界です。
    //   生成を先にすると、生成にかかった時間だけ確定が遅れます
    //   （D-035 で M=3,896,104 になり、生成は1本あたり約138秒）。
    //   生成は2周先まで作るので **1200秒の余裕**がありますが、
    //   確定は**客が結果を待っている**処理で余裕がありません。
    //
    // ★入れ替えても A-2 は壊れません（両方とも冪等で、互いの出力に依存しない）。
    //   本番コードは `horses` を一度も更新しないので、
    //   生成が確定の結果を読むことはありません（確認済み）。
    //   ⚠️ §7 の成長や §10.3 のクラス昇級を入れて確定が馬の状態を書くようになったら、
    //      この順序は**速度ではなく正しさ**の問題になります。そのときに読み直すこと。
    for (const idx of await store.pendingSettlements(nowMs)) {
      try {
        /**
         * 🔴 ★**確定の前に、発走前の引退をもう 1 度 見ます**（★**DS-5 ④**・D-111 ③⑥）。
         *
         * ★組成の前の取消（`main.ts`）が塞ぐのは ★**登録 → 組成**までです。
         * ★**組成 → 発走**に引退した馬は凍結を持っているので、★誰も拾いません。
         *
         * ⚠️ ★**確定と同じトランザクションにしません。** ★`settleRace` は自分で `commit` します
         *    （★入れ子の取引はありません — ★内側の `commit` が外側ごと確定させます）。
         *    ★取消は冪等なので、★確定が落ちても二重には返しません。
         * ⚠️ ★**失敗したら確定に進みません**（★引退した馬を走らせない）。
         */
        const ret = await store.scratchRetiredBeforeStart(idx);
        if (ret.skipped) retireCheckSkipped.push(idx);
        scratchedBeforeStart += ret.scratched;
        await store.settleRace(idx);
        settled.push(idx);
      } catch (e) {
        /**
         * ★凍結（0016）が無いレースは**確定せず開催中止**にします（D-056）。
         *
         *   旧経路（`horses` を読み直す）に落とすのが D-055 で閉じた欠陥そのものなので、
         *   フォールバックを持ちません。**中止なら返還・冪等・アラートが既にあります。**
         *   ★ここで握り潰すと「静かに劣化」に戻るので、**中止アラートに必ず載せます**。
         *
         *   ⚠️ 名前で判定します（`instanceof` は層をまたぐと束ね方次第で外れます）。
         *
         * ★**走路の凍結があるのに不正**（`InvalidFrozenCourseError`・2026-09-15・指示書 VW §5-2）も同じ扱いです。
         *   ★読めない形で確定すると、★オッズを付けた模型と違う模型で着順を出すことになります。
         */
        if (e instanceof Error && (e.name === 'UnfrozenRaceError' || e.name === 'InvalidFrozenCourseError')) {
          const r = await store.cancelRace(idx);
          cancelled.push(idx);
          onAlert({ cycleIndex: idx, refundedBets: r.refundedBets, refundedEp: r.refundedEp });
          continue;
        }
        throw e;
      }
    }

    // --- 2. 期限切れの開催中止と返還（正典 D-037・§9.1） ---
    //
    // ★S型（レースは生成され、馬券が売れ、そのあと確定できない）の受け皿です。
    //   これが無いと `bets` が pending のまま**永久に残り**、客の EP も PP も動きません。
    //   ★呼び出し元はここです。以前は `cancelRace` を検証スクリプトしか
    //     呼んでおらず、**機能もテストもあるのに本番の経路だけが繋がっていません**でした。
    for (const idx of await store.overdueRaces(nowMs)) {
      const r = await store.cancelRace(idx);
      cancelled.push(idx);
      // ★黙って返還しない。静かに返すと原因が調査されないまま繰り返します（D-037）
      onAlert({ cycleIndex: idx, refundedBets: r.refundedBets, refundedEp: r.refundedEp });
    }

    // --- 3. ★公示（★D-117 ①・§10.2）---
    //
    // ★`ANNOUNCE_AHEAD_RACES` 先まで、★**枠と条件だけ**の行を作ります。
    //   ★ここから `enter_race` が登録を受け付けます（★窓は 12 分）。
    //   ★出走表もオッズもまだ無いので、★1 本あたりの費用はほぼゼロです。
    for (const idx of racesToAnnounce(nowMs, epochMs)) {
      // ★ロックを取れていても存在確認する。ロックは同時実行を防ぐだけで、
      //   「前回の自分が既に作った」ことは防げない
      if (await store.raceExists(idx)) {
        skipped.push(idx);
        continue;
      }
      await store.announceRace({
        cycleIndex: idx,
        raceClass: classOf(idx),
        grade: gradeOf(idx),
        // ★発走時刻もサイクル番号から決める。再起動しても同じ時刻になる
        scheduledAtMs: cycleStartMs(idx, epochMs) + PHASE_OFFSET_MS.start,
        /**
         * ★**登録の締切**（★2026-09-19・**D-117**）。
         *   🔴 ★旧は `cycleStart + publish`（★ED-1・`0041`）でした。★それだと締切から
         *     ★発売開始まで **30 秒**しかなく、★オッズ（70〜98 秒）が入りません。
         *   ★今は ★**`entryDeadlineMs()` の 1 か所**が決めます（★`cycleStart(N-2)`）。
         *   ★締切から発売開始まで ★**13 分**あります。
         */
        entryDeadlineAtMs: entryDeadlineMs(idx, epochMs),
        /**
         * ★**ゲーム内の何週めか**（★2026-09-19・**UI-4**・移行 `0046`）。
         *   ★`/records` の戦績は「◯週」を出しますが、★**画面は週を導けません** —
         *   ★開催の起点（`epochMs`）と 1 週の長さを渡すと ★**画面が時計を持ちます**
         *   （★UI1-10 で `world_state` を作ったときと同じ判断）。
         * ⚠️ 🔴 ★**`cycleIndex / CYCLES_PER_WEEK` で割らないこと。**
         *   ★世界時計（`main.ts`）は ★**時刻から**週を決めています。★2 通りの導き方を置くと、
         *   ★ずれたときにどちらが正か言えません（D-052）。★**同じ `weekIndexAt()` を使います。**
         */
        gameWeek: weekIndexAt(cycleStartMs(idx, epochMs) + PHASE_OFFSET_MS.start, epochMs),
        /**
         * ★**公示の時点で条件を決め、行に書きます**（★D-117）。
         *   ★`races.track_condition` は not null なので、★ここで 1 つ決まります。
         *   ★組成は**この行を読み直します** — ★引き直しません（D-052・R-30）。
         */
        conditions: announce(idx),
        purse: purseOf(prizeTierOf(classOf(idx), gradeOf(idx))),
        seedCommit: seeds.seedCommit(idx),
        serverSeed: seeds.serverSeed(idx),
      });
      announced.push(idx);
    }

    // --- 4. ★組成（★D-117 ②・**DS-6/7/8/9**）---
    //
    // ★締切を過ぎた公示から順に、★登録馬 ＋ NPC で出走表を作り、★オッズを付けます。
    // ★ここで初めて `scheduled` になり、★発売できる状態になります。
    for (const idx of await store.announcedRaces()) {
      /**
       * ★**締切前は触りません**（★登録を受け付けている最中）。
       * ⚠️ ★時刻の判定は ★**ここ（TS）だけ**です。★`announcedRaces()` は絞りません（D-052）。
       */
      if (nowMs < entryDeadlineMs(idx, epochMs)) continue;

      /**
       * ★**発売開始までに組成が終わらなかった**（★**DS-6/DS-7**）。
       *
       * ★DS-6: ★売りません。★これは自動的に守られています —
       *   ★`place_bet` は `scheduled` だけを受けるので、★組成前のレースは 1 枚も売れません。
       * ★DS-7: ★**中止にして、登録料と騎手の料金を返します**（★D-111 ③⑤ の経路）。
       *   ★馬券は無いので `refundedBets` は 0 です。
       *
       * ⚠️ ★**組成より先に判定します。** ★後ろに置くと、★間に合わないレースに
       *    ★`MAX_FILLS_PER_CYCLE` を 1 枠使ってから捨てることになります。
       */
      if (nowMs >= cycleStartMs(idx, epochMs) + PHASE_OFFSET_MS.salesOpen) {
        const r = await store.cancelRace(idx);
        fillFailed.push(idx);
        // ★黙って中止にしない（D-037 と同じ形）
        onAlert({ cycleIndex: idx, refundedBets: r.refundedBets, refundedEp: r.refundedEp });
        continue;
      }

      /**
       * ★**1 周で組成する本数の上限**（★**DS-9**）。
       *   ★超えた分は `fillDeferred` に載せて ★**次の周に回します**（★DS-8 で数えられる）。
       * ⚠️ ★`break` ではなく続けます — ★後ろにいる「もう間に合わない」レースを
       *    ★この周で中止にする必要があるからです（★上の DS-6/7）。
       */
      if (filled.length >= MAX_FILLS_PER_CYCLE) {
        fillDeferred.push(idx);
        continue;
      }

      /**
       * ★**公示の行から条件を読みます**（★引き直さない・D-052・R-30）。
       *   ★null は「その番号が `announced` でなくなった」＝ 他のプロセスが組成した、です。
       */
      const announcedRace = await store.announcedConditions(idx);
      if (announcedRace === null) continue;

      /** ★**登録した馬は必ず入れます**（★**DS-2**）。★`fillRace` が入っているか確かめます */
      const registered = await store.registeredHorses(idx);
      /**
       * ⚠️ ★**`await` します**（★2026-09-19・D-117 DS-2）。★組成は ★**登録した馬の行を読む**必要があり、
       *    ★それは `pool`（NPC だけ）に入っていないからです。★呼ぶ側が DB を引きます。
       */
      const built = await build(idx, announcedRace.conditions, registered);
      await store.fillRace(idx, {
        entrants: built.entrants,
        odds: built.odds,
        /**
         * ★**抽選に外れた馬を外します**（★§10.4・LT-1）。
         *   ★外れた馬は `build` の側で取消・返金済みなので、★出走表に入っていません。
         *   ★ここで引かないと `fillRace` が「登録したのに出走表にない」で投げます。
         */
        registered: registered.filter((h) => !built.excluded.includes(h)),
      });
      filled.push(idx);
      /**
       * ★**発売が遅れて始まったか**（★2026-09-23・裁定 `REVIEW_PROD_DEPLOY_ORDER_20260922.md` §7）。
       *   ★「いまの時刻」はループの最初に読んでいるので、★発売開始の直前に始めた組成は ★**発売開始の後に終わりうる**。
       *   ★そのぶん発売の時間が短くなる。★DB に組成の終わった時刻の列が無いので、★ここで DB の時計を読み直して測る（★表示だけ）。
       */
      const lateMs = (await store.serverNowMs()) - (cycleStartMs(idx, epochMs) + PHASE_OFFSET_MS.salesOpen);
      if (lateMs > 0) salesLate.push({ cycleIndex: idx, lateMs });
    }
  } finally {
    // ★必ず解放する。落ちたままだと次の周が永久にロック待ちになる
    await store.unlock(LOCK_KEY.CYCLE);
  }

  return {
    nowMs, cycleIndex, phase, onSale,
    filled, announced, fillDeferred, fillFailed,
    skipped, settled, cancelled, lockBusy: false,
    scratchedBeforeStart, retireCheckSkipped, salesLate,
  };
}
