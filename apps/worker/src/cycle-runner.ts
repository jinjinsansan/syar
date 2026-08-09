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
  PHASE_OFFSET_MS,
  cycleIndexAt,
  cycleStartMs,
  isOnSale,
  phaseAt,
  racesToPrepare,
  type Phase,
} from '@star/scheduler';
import {
  classOf, conditionsOf, gradeOf, prizeTierOf, purseOf,
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
  /** レースを作る（オッズ算出まで含む） */
  createRace(spec: RaceSpec): Promise<void>;
  /** 確定していない、発走時刻を過ぎたレースの番号 */
  pendingSettlements(nowMs: number): Promise<number[]>;
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
  readonly conditions: RaceConditions;
  /** 出走表（§10.4 の同格帯から組む。D-018） */
  readonly entrants: readonly RaceEntrantSpec[];
  /** オッズ（§9.2 のモンテカルロ実測） */
  readonly odds: readonly OddsSpec[];
}

export interface RaceEntrantSpec {
  readonly horseId: string;
  readonly gate: number;
  readonly weightKg: number;
  readonly strategy: string;
  /** モンテカルロ勝率順位（§9.2）。算出前は undefined */
  readonly popularity?: number | undefined;
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
  /** 実際に作ったレース（既にあったものは含まない） */
  readonly created: readonly number[];
  /** 既にあったので作らなかったレース */
  readonly skipped: readonly number[];
  readonly settled: readonly number[];
  /** ★確定できず開催中止にしたレース（D-037）。★0 でない周は必ず調査対象 */
  readonly cancelled: readonly number[];
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
  build: (cycleIndex: number) => { entrants: readonly RaceEntrantSpec[]; odds: readonly OddsSpec[] },
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
      created: [], skipped: [], settled: [], cancelled: [], lockBusy: true,
    };
  }

  const created: number[] = [];
  const skipped: number[] = [];
  const settled: number[] = [];
  const cancelled: number[] = [];
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
      await store.settleRace(idx);
      settled.push(idx);
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

    // --- 3. 先行生成（§10.2: 2レース先まで） ---
    for (const idx of racesToPrepare(nowMs, epochMs)) {
      // ★ロックを取れていても存在確認する。ロックは同時実行を防ぐだけで、
      //   「前回の自分が既に作った」ことは防げない
      if (await store.raceExists(idx)) {
        skipped.push(idx);
        continue;
      }
      await store.createRace({
        cycleIndex: idx,
        raceClass: classOf(idx),
        grade: gradeOf(idx),
        // ★発走時刻もサイクル番号から決める。再起動しても同じ時刻になる
        scheduledAtMs: cycleStartMs(idx, epochMs) + PHASE_OFFSET_MS.start,
        conditions: conditionsOf(idx, classOf(idx), gradeOf(idx)),
        ...build(idx),
        purse: purseOf(prizeTierOf(classOf(idx), gradeOf(idx))),
        seedCommit: seeds.seedCommit(idx),
        serverSeed: seeds.serverSeed(idx),
      });
      created.push(idx);
    }
  } finally {
    // ★必ず解放する。落ちたままだと次の周が永久にロック待ちになる
    await store.unlock(LOCK_KEY.CYCLE);
  }

  return { nowMs, cycleIndex, phase, onSale, created, skipped, settled, cancelled, lockBusy: false };
}
