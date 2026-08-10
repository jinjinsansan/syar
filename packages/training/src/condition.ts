/**
 * 疲労と調子（正典 §7.4）
 *
 * ```
 * condition (0..5) を毎週再判定:
 *   base = 3 - floor(fatigue / 25) + rand(-1, +1)
 *   condition = clamp(base, 0, 5)
 * ```
 * - 疲労70以上: 調子は最大2止まり
 * - 疲労90以上: 出走時に大幅マイナス（§8.3 fatigueCoef）
 * - **調子・疲労は介入のスタミナゲージ初期値にも影響**（§8b）
 *
 * 【★これが「仕上げが効かない」を防ぐ唯一の経路です】
 *   §8b.2 の初期値は正典に式があり、`race-engine` 側は**既に実装済み**です:
 *     `clamp(50 + ST/20 + (condition-3)*4 - max(0, fatigue-50)/2, 20, 100)`
 *   ★足りないのは**育成で計算した値をレースに渡すこと**だけです。
 *     いま `race-field.ts` は `condition ?? 3` / `fatigue ?? 0` で固定しており、
 *     **繋ぎ忘れると「仕上げの良し悪しが操作の効きに直結する」（§8b.2）が
 *     静かに成立しなくなります**（P1 で V-8 の盲点として出た形）。
 */

import type { Rng } from '@star/sim-engine';

/** 疲労の下限・上限。★正典に上限の規定が無いため 0..100 に置く（照会） */
export const FATIGUE_RANGE = { min: 0, max: 100 } as const;

/** 正典 §7.4: 疲労70以上で調子は最大2止まり。★正典の写し */
export const FATIGUE_CAPS_CONDITION_AT = 70;

/** 正典 §7.4: 疲労70以上のときの調子の上限。★正典の写し */
export const CAPPED_CONDITION_MAX = 2;

/** 正典 §7.4: 疲労90以上で出走時に大幅マイナス（§8.3）。★正典の写し */
export const FATIGUE_RACE_PENALTY_AT = 90;

/** 調子の値域（正典 §7.4: 0..5）。★正典の写し */
export const CONDITION_RANGE = { min: 0, max: 5 } as const;

/** 正典 §7.4 の `floor(fatigue / 25)` の 25。★正典の写し */
export const FATIGUE_PER_CONDITION_STEP = 25;

/** 正典 §7.4 の基準値 3。★正典の写し */
export const CONDITION_BASE = 3;

/** 疲労を加減して値域に収める */
export function applyFatigue(current: number, delta: number): number {
  const v = current + delta;
  if (v < FATIGUE_RANGE.min) return FATIGUE_RANGE.min;
  if (v > FATIGUE_RANGE.max) return FATIGUE_RANGE.max;
  return v;
}

/**
 * 週ごとの調子の再判定（正典 §7.4）。
 *
 * ★`rand(-1, +1)` は**整数**として扱います。`condition` は 0..5 の段階値なので、
 *   実数を足すと段階でなくなり、`conditionCoef` の対応（0..5 → 0.7〜1.3）も崩れます。
 *   ★正典に「整数」とは書かれていないので、照会に上げます。
 */
export function nextCondition(fatigue: number, rng: Rng): number {
  const base =
    CONDITION_BASE - Math.floor(fatigue / FATIGUE_PER_CONDITION_STEP) + rng.int(-1, 1);
  let c = Math.max(CONDITION_RANGE.min, Math.min(CONDITION_RANGE.max, base));
  // ★疲労70以上は上限2（clamp の**後**に効かせる。先に掛けると 3 に戻りうる）
  if (fatigue >= FATIGUE_CAPS_CONDITION_AT) c = Math.min(c, CAPPED_CONDITION_MAX);
  return c;
}

/** 出走時に §8.3 の大幅マイナスを受けるか（正典 §7.4: 疲労90以上） */
export function isRacePenalized(fatigue: number): boolean {
  return fatigue >= FATIGUE_RACE_PENALTY_AT;
}
