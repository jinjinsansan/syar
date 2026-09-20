/**
 * レースの確定（正典 §8.6・§8.7）
 *
 * 【★確定の乱数は §8.6 の定義に従う】
 *   `final_seed = HMAC(server_seed, race_id + client_entropy)` で、
 *   `client_entropy` は**出走馬IDのソート済みハッシュ**（§8.6・I-ENTROPY-SORT）。
 *   これにより、`seed_reveal` を公開すれば**誰でも着順を再計算できます**。
 *   ワーカーが勝手な乱数を使うと、公開しても検証できません。
 *
 * 【★結果の事後差し替えをしない（§8.6・§10.2）】
 *   一度確定した着順は書き換えません。確定は `status='scheduled'` の行だけを対象にし、
 *   既に settled なら 0行更新で終わります（二重確定・二重払戻の防止）。
 */

import {
  DEFAULT_RACE_BALANCE,
  clientEntropy,
  deriveFinalSeed,
  finalSeedToRngSeed,
  resolveRace,
  type HashProvider,
  type RaceConditions,
  type RaceEntrant,
} from '@star/race-engine';

export interface SettleInput {
  /** ★raceId は conditions が持つ（§8.6 の final_seed 導出に使う）。二重に持たない */
  readonly conditions: RaceConditions;
  readonly entrants: readonly RaceEntrant[];
  readonly serverSeed: string;
}

export interface SettleResult {
  /** 着順（1着から）。`horseId` は出走表の馬番 */
  readonly order: readonly { horseId: string; finishPosition: number; timeSec: number }[];
  /** 公開する値（§8.6） */
  readonly seedReveal: string;
  readonly finalSeed: string;
  /**
   * 🔴 ★**範囲外の介入倍率が来て、★クランプした記録**（★O-3・2026-09-20 に足しました）。
   *
   * 【★なぜ足したか — ★ここが捨てていた場所です】
   *   ✔ ★`packages/race-engine/src/race.ts:254` は「★クランプは黙って行わず記録する
   *     （★**不正の兆候かもしれない**ため）」と書き、★`:342` で返しています。
   *   🔴 ★しかし ★**この包み（`settleRace`）が、★戻り値を組み立てるときに落として**いました。
   *     → ★`race_entries.cap_violations` 列（`0001_init.sql:204`）は ★**空のまま**。
   *   → ★★**作って、返して、★受け取る手前で捨てていた。**
   *
   * ⚠️ ★**空配列が普通です**（★介入が無ければ何も起きません）。
   */
  readonly capViolations: readonly { horseId: string; received: number; applied: number }[];
}

/**
 * 着順を計算する。**同じ入力からは必ず同じ着順**（検証可能性の要）。
 */
export function settleRace(input: SettleInput, hash: HashProvider): SettleResult {
  if (input.entrants.length === 0) throw new Error('settleRace: 出走馬が0頭');
  const entropy = clientEntropy(input.entrants.map((e) => e.horseId), hash);
  const finalSeed = deriveFinalSeed(input.serverSeed, input.conditions.raceId, entropy, hash);
  const result = resolveRace({
    conditions: input.conditions,
    entrants: input.entrants,
    seed: finalSeedToRngSeed(finalSeed),
    balance: DEFAULT_RACE_BALANCE,
  });
  return {
    order: result.order.map((r, i) => ({
      horseId: r.horseId,
      finishPosition: i + 1,
      timeSec: r.timeSec,
    })),
    // ★reveal は server_seed そのもの。検証者は sha256(reveal) == commit を確かめる
    seedReveal: input.serverSeed,
    finalSeed,
    // 🔴 ★エンジンが返したものを、★そのまま通します（★落とさない）
    capViolations: result.capViolations,
  };
}
