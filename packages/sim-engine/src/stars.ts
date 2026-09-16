/**
 * ★**素質を★で見せる**（★GB-4・2026-09-16・正典 §5.5・§12.4・**D-102 ⑥**）
 *
 * 【★なぜエンジン側に 1 か所で置くか】
 *   ★正典は ★**「素質の数値は本人にも見せない。星表示で暗示する」**と定めます（§5.5・用語表 `potential`）。
 *   ★ところが ★**★の算出はどこにも実装がありませんでした**（★画面のデモ値 `stars: 4.5` があるだけ）。
 *   ★馬の購入（D-102 ③）は ★**「★表示が同じ帯から候補を出す」**ことで振り直しを止めるので、
 *   ★**★を出す量と、候補を選ぶ量が同じ**でなければ、★「見た目は同じだが中身が違う」帯ができます。
 *   → ★**ここが唯一の算出**です。★画面・購入・検査は ★この関数だけを引きます（★D-052・R-30）。
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★`potential` を**外に出しません**（★返すのは★だけ）。
 */

import type { AbilityKey, HorseRecord } from './types.js';

/** ★★の段階（0.5 刻み・1〜5・正典 §5.5 の「星表示」） */
export const STAR_MIN = 1;
export const STAR_MAX = 5;
export const STAR_STEP = 0.5;

/** ★能力 5 つ（★`AbilityKey` の並びに依存しないよう明示） */
const ABILITY_KEYS: readonly AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];

/**
 * ★**★の元になる量**（★素質の平均）。
 * ⚠️ ★**この量は外に出しません**（★`starsOf` の中でだけ使う）。★出すと素質の数値が復元できます。
 */
function potentialMean(potential: Readonly<Record<AbilityKey, number>>): number {
  let sum = 0;
  for (const k of ABILITY_KEYS) sum += potential[k];
  return sum / ABILITY_KEYS.length;
}

/**
 * ★**★の帯の境目**（★素質の平均 → ★）。
 *
 * ⚠️ ★較正定数ではなく ★**見せ方の刻み**です。★動かすと ★同じ馬の★の見え方が変わるだけで、
 *    ★能力・着順・成長には入りません。★**帯の幅は、購入の候補（D-102 ③）の「同じ帯」の定義でもあります。**
 * ★境目は ★正典 §5 の能力の値域（0〜1000）を ★1〜5★ の 9 段（0.5 刻み）に割ったものです。
 */
export const STAR_THRESHOLDS: readonly number[] = [
  // ★1.0★ 未満は無い（★下限は 1.0★）。以下は「この値以上なら次の段」
  420, 470, 520, 570, 620, 670, 720, 800,
];

/**
 * ★**素質 → ★**（★1.0〜5.0・0.5 刻み）。
 * ⚠️ ★返すのは★だけです。★素質の数値も、素質開放率も返しません（§5.5・§12.4）。
 */
export function starsOfPotential(potential: Readonly<Record<AbilityKey, number>>): number {
  const mean = potentialMean(potential);
  let step = 0;
  for (const t of STAR_THRESHOLDS) {
    if (mean >= t) step += 1;
  }
  return Math.min(STAR_MAX, STAR_MIN + step * STAR_STEP);
}

/** ★馬から★を出す（★`potential` を持つ記録の入口） */
export function starsOf(horse: Pick<HorseRecord, 'potential'>): number {
  return starsOfPotential(horse.potential);
}

/**
 * ★**同じ★の帯か**（★D-102 ③「★表示が同じ帯から出す」）。
 * ⚠️ ★**★が同じであること**が帯の定義です（★中の素質がいくら違っても、見えるものは同じ）。
 */
export function sameStarBand(a: Pick<HorseRecord, 'potential'>, b: Pick<HorseRecord, 'potential'>): boolean {
  return starsOf(a) === starsOf(b);
}
