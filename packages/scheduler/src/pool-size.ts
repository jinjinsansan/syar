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
import { WEEKS_PER_YEAR } from './birth-week.js';

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

/**
 * ★**同時に必要な繁殖牝馬の頭数**（★2026-09-20・`BROODMARE-POOL-NOT-REFILLED`）。
 *
 * 【🔴 ★なぜ導出するか — ★数を書かない】
 *   ★いまの世界は繁殖牝馬 **800 頭**です。★これは ★**プリシードが決めた数**で、
 *   ★製品側に出どころがありませんでした。
 *   ✔ ★算術で置き直すと ★**偶然ではありません**:
 *     ★現役 2,400 ÷ 現役年数 3 年 ＝ ★**毎年 800 頭 引退 → 800 頭 生まれる必要**
 *     ★1 頭の牝馬は ★**年 1 回**（★`canMate` の「年 1 回のみ受胎」）
 *     → ★★**同時に必要な繁殖牝馬 ＝ 年に要る産駒数 ＝ 800**
 *   → ★★**書かずに導きます。** ★`CC-1` のような改訂が来ても ★**自動で追随**します
 *     （★`D-007` の 3,500 が的のまま残った轍を踏まない）。
 *
 * ⚠️ ★**現役年数**は `CAREER_WEEKS`（★出走可 → 引退）から引きます。★暦ではありません。
 */
export function requiredBroodmares(meanFieldSize: number): number {
  const careerYears = CAREER_WEEKS / WEEKS_PER_YEAR;
  return Math.ceil(requiredActivePool(meanFieldSize) / careerYears);
}

/**
 * ★**毎年 入れ替える繁殖牝馬の頭数**。
 *
 *   ★1 頭は生涯 `MARE_LIFETIME_FOALS` 頭しか産めません（★§6.7）。
 *   → ★★**毎年 `必要頭数 ÷ 生涯上限` だけ、★新しい牝馬に入れ替わります。**
 *
 * ⚠️ ★**生涯上限はここに書きません** — ★`@star/sim-engine` の `BalanceConfig` が持っています。
 *    ★呼ぶ側が渡してください（★この packages は依存ゼロです）。
 */
export function annualBroodmareReplacement(
  meanFieldSize: number,
  mareLifetimeFoals: number,
): number {
  if (!Number.isInteger(mareLifetimeFoals) || mareLifetimeFoals <= 0) {
    throw new Error(`pool-size: 生涯産駒数が正の整数ではありません（${mareLifetimeFoals}）`);
  }
  return Math.ceil(requiredBroodmares(meanFieldSize) / mareLifetimeFoals);
}

/**
 * ⚠️ 🔴 ★**種牡馬の頭数（200）は、★導出できませんでした**（★2026-09-20・★正直に書きます）。
 *
 *   ★繁殖牝馬は ★**「年に要る産駒数」から一意に決まります**（★1 頭 年 1 産）。
 *   ★種牡馬は違います: ★1 頭が年 `STALLION_BASE_COVERINGS`（20）回 付けられるので、
 *   ★**必要最小は 800 ÷ 20 ＝ 40 頭**です。★★200 はその 5 倍。
 *   → ★★**この 5 倍は「足りるか」ではなく「★系統が潰れないか」で決まる数**です（★D-025 / D-026）。
 *     ★実測でも、★使われた種牡馬は年 40 頭でした（★`mate-choice.ts` の註記）。
 *   → ★★**有効系統数から決まる数なので、★頭数の算術では導けません。**
 *     ★導出できないものを、★無理に式にしません。
 */
export function minimumStallions(meanFieldSize: number, coveringsPerStallion: number): number {
  if (!Number.isInteger(coveringsPerStallion) || coveringsPerStallion <= 0) {
    throw new Error(`pool-size: 年間種付上限が正の整数ではありません（${coveringsPerStallion}）`);
  }
  return Math.ceil(requiredBroodmares(meanFieldSize) / coveringsPerStallion);
}
