/**
 * ★**要る現役頭数は、★数として持たない**（★裁定 Q1・2026-09-20）
 *
 * 【★なぜ】
 *   ★正典 D-007 は「★6 分なら要る頭数 **3,500** で余力 889 頭」と書き、
 *   ★`cycle.ts` の註記もそれを写していました。
 *   🔴 ★**この 3,500 は「キャリア 24 戦」のときの数**です。
 *   ✔ ★`CC-1 ③`（2026-09-19・オーナー承認）で ★**24 → 40 戦**になりました。
 *   → ★★**書き留めた数だけが取り残されました**（★`D-053` / `NM-1` と同じ形）。
 *
 *   ★**だから数で持ちません。★毎回 導きます。** ★そうすれば次に `CAREER_RACE_LIMIT` や
 *   ★`CYCLE_MS` が動いた日に、★**黙って追随します**。
 *
 * 【★算術】
 * ```
 *   1 頭が 1 日に走れる回数 ＝ CAREER_RACE_LIMIT ÷ 現役の日数
 *   要る頭数               ＝ RACES_PER_DAY × 平均出走頭数 ÷ 1 頭が 1 日に走れる回数
 * ```
 *
 * 【⚠️ ★これは算術であって実測ではありません】
 *   ★D-007 自身が「★**最終確認は配備後の周の実測**」と書いています（★**R-28**）。
 *   ★ここが返すのは ★**見積もり**です。★合否の判定に使わないでください。
 *
 * 【⚠️ ★平均出走頭数を既定で持たない理由】
 *   ★正典 §10.4 は「1 レース **8〜18 頭**」としか書いていません。
 *   ★D-007 が使った **13.46** は ★**実測値**であって、8〜18 の中点（13.0）ではありません。
 *   → ★**呼ぶ側が「どこで測った数か」を示して渡してください。**
 *     ★既定値を置くと、★また「出どころの分からない数」が 1 つ増えます。
 */

import { RACES_PER_DAY } from './programme.js';
import { CAREER_RACE_LIMIT, LIFECYCLE_WEEKS, WEEKS_PER_DAY } from './week.js';

/** ★現役でいられる週数（★正典 §7.1: `104〜260` ＝ **156 週**）。★導出値 */
export const CAREER_WEEKS = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;

/** ★現役でいられる実日数（★156 週 ÷ 1 日 6 週 ＝ **26 日**）。★導出値 */
export const CAREER_DAYS = CAREER_WEEKS / WEEKS_PER_DAY;

/**
 * ★**1 頭が 1 日に走る回数**（★キャリアを使い切る前提）。
 *
 * ★24 戦のとき **0.92**（★D-007 の本文の数）／★40 戦のいま **約 1.54**。
 */
export const STARTS_PER_HORSE_PER_DAY = CAREER_RACE_LIMIT / CAREER_DAYS;

/** ★1 日に必要な延べ出走数 */
export function totalStartsPerDay(meanFieldSize: number): number {
  if (!Number.isFinite(meanFieldSize) || meanFieldSize <= 0) {
    throw new Error(
      `pool-size: 平均出走頭数が正の有限値ではありません（meanFieldSize=${meanFieldSize}）。`
        + '★既定値は置いていません — ★どこで測った数かを示して渡してください。',
    );
  }
  return RACES_PER_DAY * meanFieldSize;
}

/**
 * ★**要る現役頭数**（★見積もり・切り上げ）。
 *
 * @param meanFieldSize ★平均出走頭数。★**実測値を渡すこと**（★§10.4 は 8〜18 としか書いていない）
 */
export function requiredActivePool(meanFieldSize: number): number {
  return Math.ceil(totalStartsPerDay(meanFieldSize) / STARTS_PER_HORSE_PER_DAY);
}

/**
 * ★**余力**（★頭数と倍率）。
 *
 * ⚠️ ★率の言い方は ★**「倍率 − 1」に統一**します（★D-007 の決め）。
 *    ★併せて ★**頭数でも書きます** — ★プールを減らすのは初期馬の付与（D-079 ⑧）と
 *    ★購入（D-102）で、★**どちらも頭数で効く**ためです。
 */
export function poolHeadroom(
  actualPool: number,
  meanFieldSize: number,
): { readonly required: number; readonly spare: number; readonly ratioMinusOne: number } {
  const required = requiredActivePool(meanFieldSize);
  return {
    required,
    spare: actualPool - required,
    ratioMinusOne: actualPool / required - 1,
  };
}
