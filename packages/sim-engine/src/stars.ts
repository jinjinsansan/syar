/**
 * ★**素質の段（帯）**（★GB-4・2026-09-16 → ★**2026-09-18・D-114 で全面改訂**・正典 §5.5・§12.4・D-079・D-102）
 *
 * 【★2026-09-18 に「見せ方」から「内部の帯」に変わりました】
 *   ★旧: ★`potential` を ★**★1〜5（半星あり）＝ 9 段**に丸めて ★**画面に出す**（§5.5・§12.4）。
 *   ★新: ★**24 段を内部に持ち、プレイヤーには一切見せない**（**D-114 ①②③**）。
 *        ★プレイヤーが強さを推し量る手がかりは ★**オッズと戦績だけ**です。
 *
 * 【★この層の約束】
 *   ★**段の算出はここ 1 か所だけ**です（D-114 ①・D-052）。★他所で段を計算しません。
 *   ★依存ゼロ・純粋関数。★`potential` を**外に出しません**（★返すのは段番号だけ）。
 *   ⚠️ ★**段を画面・API・ビューに渡す口を作らないこと**が D-114 ② です。
 *      ★この層は「段を出す」だけで、★**誰に渡してよいかは呼ぶ側の責任**です
 *      （★構文木で見る検査: `apps/cli/test/no-potential-in-web.test.ts`）。
 */

import type { AbilityKey, HorseRecord } from './types.js';

/** ★段の数（★**D-114 ①「`STAR_THRESHOLDS` を 24 段に差し替える」**の写し） */
export const STAR_STEPS = 24;

/** ★段の下端（★これ未満はすべて段 0）。★旧 9 段の下端をそのまま使います */
export const STAR_BAND_FROM = 420;
/** ★1 段ぶんの素質の幅（★開発側が置いた刻み・`STAR_THRESHOLDS` の註記） */
export const STAR_BAND_WIDTH = 20;

/**
 * ★**段の境目**（★素質の平均 → 段番号）。★**23 本 ＝ 24 段**（D-114 ①）。
 *
 * 【★刻みの決め方（★正典に書かれていないので、開発側が置きました）】
 *   ★D-114 は「24 段に差し替える」とだけ定め、★**境目の規則は書いていません。**
 *   → ★**420 から 20 刻み**（420, 440, …, 860）にしました。★根拠:
 *     ① ★**下端 420 は旧 9 段の下端そのまま**（★正典 §5 の値域から引いた値を、24 段化で動かさない）
 *     ② ★**幅 20 は均等**（★旧 9 段は 50 × 6 ＋ 80 と不均一で、★細かくするときに不均一を保つ根拠がありません）
 *     ③ ★上端 860 は ★**実測の最大 824 の外側**（★素質の平均の分布・2026-09-18）
 *   ⚠️ ★**外からは観測できません**（D-114 ② で段を見せないため）。★**帯の粒度だけが変わります。**
 *
 * ⚠️ ★較正定数ではありません（★能力・着順・成長に入りません）。
 *    ★ただし ★**初期馬の付与（D-079）と在庫の下限監視（D-079 ⑧）の「帯」の定義**です。
 */
export const STAR_THRESHOLDS: readonly number[] = Array.from(
  { length: STAR_STEPS - 1 },
  (_unused, i) => STAR_BAND_FROM + i * STAR_BAND_WIDTH,
);

/** ★能力 5 つ（★`AbilityKey` の並びに依存しないよう明示） */
const ABILITY_KEYS: readonly AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];

/**
 * ★**段の元になる量**（★素質の平均）。
 * ⚠️ ★**この量は外に出しません**（★`bandOfPotential` の中でだけ使う）。★出すと素質の数値が復元できます。
 */
function potentialMean(potential: Readonly<Record<AbilityKey, number>>): number {
  let sum = 0;
  for (const k of ABILITY_KEYS) sum += potential[k];
  return sum / ABILITY_KEYS.length;
}

/**
 * ★**素質 → 段番号**（★**0 〜 `STAR_STEPS - 1`**・★D-114 ①）。
 *
 * ⚠️ ★**2026-09-18 から、この値は画面・API・ビューに出しません**（D-114 ②）。
 *    ★**内部の帯としてだけ**使います（D-114 ③）:
 *      ★初期馬の付与（D-079）／★NPC 在庫の下限監視（D-079 ⑧）／★NPC 出品の品揃え（T-11 まで）。
 * ⚠️ ★**整数です。** ★旧 `starsOfPotential` は 0.5 刻みの小数を返していましたが、
 *    ★24 段では 1 段が 4 ÷ 23 ≈ 0.174 となり、★**小数の等値比較で帯を判定すると静かに外れます**。
 *    ★帯の一致は ★**段番号の等値**で見ます。
 */
export function bandOfPotential(potential: Readonly<Record<AbilityKey, number>>): number {
  const mean = potentialMean(potential);
  let band = 0;
  for (const t of STAR_THRESHOLDS) {
    if (mean >= t) band += 1;
  }
  return band;
}

/** ★馬から段を出す（★`potential` を持つ記録の入口） */
export function bandOf(horse: Pick<HorseRecord, 'potential'>): number {
  return bandOfPotential(horse.potential);
}

/**
 * ★**同じ帯か**（★D-079 ②・D-102 ③）。
 * ⚠️ ★**段が同じであること**が帯の定義です（★中の素質がいくら違っても、外から見える差はありません）。
 */
export function sameBand(a: Pick<HorseRecord, 'potential'>, b: Pick<HorseRecord, 'potential'>): boolean {
  return bandOf(a) === bandOf(b);
}

/**
 * ★**段 → 1.0〜5.0 の目盛**。
 *
 * 🔴 ★**T-11 までの繋ぎです。★新しい呼び出しを増やさないでください。**
 *   ★いま使っているのは ★**NPC 出品の値付け 1 か所だけ**です（`@star/scheduler` の `priceOfStars`）。
 *   ★**D-102 ③（2026-09-18 改訂・T-11）で、価格は §10.5 の NPC 種牡馬の式**
 *   〔3,000 ＋ G1 勝利数 × 8,000 ＋ 総獲得賞金 ÷ 20〕**から決め、素質を入力に取らなくなります。**
 *   → ★**そのとき、この関数は消えます。**
 *
 * 【★なぜ 1.0〜5.0 を残しているか】
 *   ★`priceOfStars(x) = max(3000, round(x × 2000))` が目盛を読むので、
 *   ★**段番号（0〜23）をそのまま渡すと馬の価格が最大 4.8 倍になります。**
 *   ★T-10 は「見せ方と帯」の便で ★**着順にも経済にも効かせない**と決まっているため（便の順 §6・4）、
 *   ★**目盛を保って価格の水準を動かしません。**
 */
export const STAR_MIN = 1;
export const STAR_MAX = 5;
/** ★1 段ぶんの目盛の幅（★導出値。★24 段なら 4 ÷ 23 ≈ 0.174） */
export const STAR_STEP = (STAR_MAX - STAR_MIN) / (STAR_STEPS - 1);

export function starScaleOfBand(band: number): number {
  if (!Number.isInteger(band) || band < 0 || band >= STAR_STEPS) {
    throw new Error(`段は 0〜${STAR_STEPS - 1} の整数です: ${band}`);
  }
  return STAR_MIN + band * STAR_STEP;
}
