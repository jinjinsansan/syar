/**
 * 出走表とオッズを作る（正典 §10.4・§9.2）
 *
 * 【★較正済みロジックを再利用する】
 *   出走馬の構成は `apps/cli/src/race-field.ts` の `generateRace` に P1 で較正済みです。
 *   ここで組み直すと出走頭数分布（§10.4）が崩れ、V-4/V-6 に波及します。
 */

import { Rng, deriveRng, type HorseRecord } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { TICKET_KINDS, placeDepth, type TicketKind } from '@star/betting';
import { generateRace, sortPoolByClass } from '../../cli/src/race-field.js';
import { ODDS_MC_TRIALS, buildOddsRows, winningKeys } from './odds.js';
import type { OddsSpec, RaceEntrantSpec } from './cycle-runner.js';

/** ★オッズ算出用のサブストリーム。§9.2 で本番確定とは別系列 */
const STREAM = { FIELD: 61, ODDS: 62 } as const;

export interface BuiltRace {
  readonly entrants: RaceEntrantSpec[];
  readonly odds: OddsSpec[];
  /**
   * ★**オッズを計算したときの条件そのもの**（Q-P3-32 の是正）。
   *   これを DB に保存します。別経路で組み直すと、
   *   「オッズは芝1600m・実際の走行はダート2400m」が再発します。
   */
  readonly conditions: {
    readonly surface: 'turf' | 'dirt';
    readonly distance: number;
    readonly trackCondition: 'good' | 'yielding' | 'soft' | 'bad';
    readonly courseId: string;
  };
}

/**
 * @param seed 開催全体のマスターシード（サイクル番号ではない）
 * @param trials モンテカルロ試行数。テストでは小さくする
 */
export function buildRace(
  pool: readonly HorseRecord[],
  cycleIndex: number,
  seed: number,
  trials: number = ODDS_MC_TRIALS,
  /**
   * ★B-6（D-050）: 出走馬の調子・疲労（§7.4）。渡さなければ従来どおりの仮定値。
   *   ★**確定処理（pg-store.ts の settleRace）と同じ値を渡すこと。**
   *     片方だけ実データにすると、オッズを計算した馬と実際に走る馬が変わります。
   */
  trainingStates?: ReadonlyMap<string, { condition: number; fatigue: number }>,
  /**
   * ★番組表が決めた条件（§10.3・`conditionsOf` の出力）。
   *   渡すと距離と馬場をそれに合わせ、**使った条件を返り値に載せます**。
   */
  programme?: { readonly surface: 'turf' | 'dirt'; readonly distance: number; readonly courseId: string },
): BuiltRace {
  const sorted = sortPoolByClass(pool);
  const race = generateRace(
    sorted, cycleIndex, deriveRng(seed, STREAM.FIELD, cycleIndex),
    undefined, undefined, undefined,
    {
      /**
       * ★能力は **`horses.stats`（週送りが育てた現在値）**を使います
       *   （Q-P3-29 の廃止裁定・Q-P3-35 で投入）。
       *
       * 【何が変わったか】
       *   これまで `toEntrant` が `potential × PLACEHOLDER_UNLOCK`（0.55〜0.85 の再抽選）で
       *   能力を作っていました。**育成ループが無かった時代の仮定**です。
       *   確定側（`pg-store.settleRace`）は `horses.stats` を使っていたので、
       *   **オッズを計算した馬と実際に走る馬の能力が違いました**（実測 2.28倍）。
       *
       * 【前提】
       *   ★`horses.stats` が**訓練後の値**であること。週送りが回っていないと誕生時の値
       *     （potential × 0.28〜0.35）になり、想定より大幅に弱い馬でオッズが付きます。
       *     → 週送りはワーカーに繋がっており、staging では開放率 71.3% を実測しています。
       *   ★`unlock_daily` が毎日分布を記録します。ここがずれたら P1 のゲートを測り直します。
       */
      abilityOf: (h: HorseRecord) => h.stats,
      ...(trainingStates === undefined ? {} : { trainingStateOf: (h: HorseRecord) => trainingStates.get(h.id) }),
      ...(programme === undefined ? {} : { programme: { surface: programme.surface, distance: programme.distance } }),
    },
  );

  // 馬番を 1..n に振る（馬券は馬番で買う）
  const numbered: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
  const depth = placeDepth(numbered.length);

  // --- §9.2 モンテカルロ（★本番確定とは別系列） ---
  const counts = new Map<TicketKind, Map<string, number>>(
    TICKET_KINDS.map((k) => [k, new Map<string, number>()]),
  );
  const rng: Rng = deriveRng(seed, STREAM.ODDS, cycleIndex);
  for (let t = 0; t < trials; t += 1) {
    const sim = resolveRace({
      conditions: race.conditions,
      entrants: numbered,
      seed: rng.nextUint32(),
      balance: DEFAULT_RACE_BALANCE,
    });
    const order = sim.order.map((r) => Number(r.horseId.replace(/^H/, '')));
    for (const kind of TICKET_KINDS) {
      const m = counts.get(kind)!;
      for (const key of winningKeys(kind, order, depth)) m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  // 人気順（§9.2: モンテカルロ勝率順位）
  const winCounts = counts.get('win')!;
  const ranked = [...winCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => Number(k));

  const entrants: RaceEntrantSpec[] = race.entrants.map((e, i) => ({
    // ★DB の horse_id は元の馬の UUID。馬番は gate で表す
    horseId: e.horseId,
    gate: i + 1,
    weightKg: e.weightKg,
    strategy: e.strategy,
    popularity: ranked.indexOf(i + 1) >= 0 ? ranked.indexOf(i + 1) + 1 : undefined,
    /**
     * ★**モンテカルロに渡した出走馬そのもの**を凍結して返す（0016）。
     *
     * 【なぜ要るか】
     *   確定側はこれまで `horses` を**もう一度読んで**いました。
     *   2回読む以上、その間に馬の状態が動けば食い違います。
     *   ★調子・疲労だけの問題ではありません。**能力（`stats`）も週送りで動きます。**
     *     生成は2周先なので、間に週が進めば能力そのものがずれます。
     *   → **オッズを計算した入力を保存し、確定はそれを使う**（読むのは1回だけ）。
     *
     * ★`numbered[i]` は `resolveRace` に実際に渡した値です。
     *   ここで組み直すと「保存したものと計算に使ったものが違う」が起きるので、
     *   **必ず MC に渡した配列から取ること。**
     *   `horseId` だけは馬番に振り替えてあるので、元の UUID に戻します。
     */
    snapshot: { ...numbered[i]!, horseId: e.horseId },
  }));

  return {
    entrants,
    odds: buildOddsRows(counts, trials) as OddsSpec[],
    // ★オッズを計算したときの条件をそのまま返す（Q-P3-32）
    conditions: {
      surface: race.conditions.surface,
      distance: race.conditions.distance,
      trackCondition: race.conditions.trackCondition,
      courseId: programme?.courseId ?? 'C1',
    },
  };
}
