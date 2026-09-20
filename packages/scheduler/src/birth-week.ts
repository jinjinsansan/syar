/**
 * ★**生まれた週の配り方**（★`SEED-LOCKSTEP` / `POOL-DRAIN` の根・★2026-09-20・**案 B-3** 裁定済み）
 *
 * 【★なぜこのファイルが要るのか】
 *   ✔ ★**実測**（2026-09-20・`evidence/20260920-world-supply/`）: ★プリシード世界の現役 **2,400 頭**は
 *     ★`birth_year` が **3 種類しかありません**（★800 頭 × 3 コホート）。
 *   ✔ ★そして `tools/age-horses.mjs` は ★**全頭に同じ `birth_week`** を書きます。
 *   → ★★**足並みが完全に揃います**:
 *     - ★`defaultMenu` は `ageWeeks % 4` で献立を選ぶので、★**全頭が毎週 同じ献立**を引く
 *     - ★260 週（強制引退）に ★**800 頭が同じ週に到達する** ＝ `POOL-DRAIN` の「2 段の崖」
 *     - ★較正が ★**1 つの位相の標本**になる
 *
 * 【★採った案 — B-3: ★**52 週へ層化して等間隔**】
 *   ★コホート（同じ生まれ年の集団）を **52 週に均等**に散らします。
 *
 *   | 案 | 配り方 | 週の種類 | `% 4` の位相 |
 *   |---|---|---|---|
 *   | B-1 | 年 1 回・コホートごとに同じ週 | 3 | 3/4 ★800 頭ずつ揃う |
 *   | B-2 | 産駒期 10 週に散らす | 30 | 4/4 ★塊は残る |
 *   | ★**B-3** | ★**52 週へ層化** | **156** | **4/4 ほぼ均等** |
 *
 *   → ★800 頭 ÷ 52 週 ＝ ★**毎週 15〜16 頭**。★崖は「直す」のではなく ★**作りません**。
 *
 * 【★なぜ乱数でなく層化か】
 *   ★800 頭を 52 週へ**無作為**に配ると、★週あたり **15.4 ± 3.9 頭**（★CV 25%）で揺れます。
 *   → ★★**散らすのが目的なのに、★揺れを足す理由がありません。**
 *   ★層化なら ★**どの週もちょうど 15 か 16 頭**です。
 *
 * 【🔴 ★決定論（憲法 §1-4）】
 *   ★`tools/seed-world.mjs` は DB の id を `randomUUID()` で振ります。
 *   → ★★**そこから配ると再現しません。** ★**プリシードの id**（`NPC-48-000123`）から配ります
 *     （★あちらは種で決まります）。★順位の付け方は `rankByStableKey` を使ってください。
 *
 * 【⚠️ ★この決めが消える条件 — ★裁定 Q2 で残すよう言われた 1 行】
 *   ★**年齢限定のレース（クラシック等）を将来 入れるなら、★「同期」というコホートが要ります。**
 *   ★そのときは B-3 を見直してください。
 *   ✔ ★**いまは要りません**（★2026-09-20 実測・レビュー側が確認）:
 *     ★`eligibility.ts` の `isEligibleFor` は ★**引数が勝利数だけ**で、
 *     ★出走資格に年齢の条件が **1 つもありません**。→ ★**「同期」はどの機構にも効いていません。**
 */

import { LIFECYCLE_WEEKS } from './week.js';

/**
 * ★**1 年 ＝ 52 週**。
 *
 * ⚠️ ★較正定数ではありません。★暦の事実です。
 * 🔴 ★**しかし番人を置きます** — ★正典 §7.1 の節目（104 週 ＝ 2 歳・260 週 ＝ 5 歳末）は
 *    ★**52 で割り切れること**を前提にしています。★どちらかが動いて割り切れなくなったら、
 *    ★ここの「年 → 週」の換算が黙ってずれます。→ ★`assertYearAligned()` が落とします。
 */
export const WEEKS_PER_YEAR = 52;

/**
 * ★**§7.1 の節目が 1 年の倍数であること**を確かめます（★番人）。
 *
 * ⚠️ ★読み込み時ではなく**呼ばれたとき**に投げます
 *    （★import しただけで落ちると、★関係の無い検査まで巻き添えになります）。
 */
export function assertYearAligned(): void {
  for (const [name, weeks] of [
    ['raceableFrom', LIFECYCLE_WEEKS.raceableFrom],
    ['retireAt', LIFECYCLE_WEEKS.retireAt],
  ] as const) {
    if (weeks % WEEKS_PER_YEAR !== 0) {
      throw new Error(
        `birth-week: LIFECYCLE_WEEKS.${name}（${weeks}）が 1 年（${WEEKS_PER_YEAR} 週）で割り切れません。`
          + '★年齢（歳）から週齢へ換算できません。★§7.1 の節目を動かしたなら、ここの配り方も決め直してください。',
      );
    }
  }
}

/** ★引数が「0 以上の整数」であることを確かめる（★黙って丸めない） */
function requireIndex(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`birth-week: ${what} が 0 以上の整数ではありません（${what}=${value}）`);
  }
}

/**
 * ★**コホート内の順位 → 年の中の位置（0〜51 週）**。
 *
 * ★`floor(52 × rank / cohortSize)`。★`rank` が 0 のとき 0、★`cohortSize - 1` のとき最大 51。
 *
 * ⚠️ ★**`rank` 0 が「その年でいちばん若い」**側です（★`birthWeekOf` が週齢に足すため）。
 */
export function strataOffsetWeeks(rank: number, cohortSize: number): number {
  requireIndex(rank, 'rank');
  requireIndex(cohortSize, 'cohortSize');
  if (cohortSize === 0) throw new Error('birth-week: cohortSize が 0 です');
  if (rank >= cohortSize) {
    throw new Error(`birth-week: rank（${rank}）が cohortSize（${cohortSize}）以上です`);
  }
  return Math.floor((WEEKS_PER_YEAR * rank) / cohortSize);
}

/**
 * ★**週齢**（★歳 ＋ 年の中の位置）。
 *
 * ★例（★コホート 800 頭）:
 * ```
 * 2 歳 → 週齢 104〜155   （★104 ＝ raceableFrom。★いちばん若い馬でちょうど出走可能）
 * 3 歳 → 週齢 156〜207
 * 4 歳 → 週齢 208〜259   （★259 ＝ retireAt − 1。★いちばん年長の馬が引退の 1 週 手前）
 * 5 歳 → 週齢 260〜      （★引退している）
 * ```
 * → ★**歳の境目と §7.1 の節目がちょうど合います**（★端が 1 週もはみ出しません）。
 */
export function ageWeeksOf(ageYears: number, rank: number, cohortSize: number): number {
  assertYearAligned();
  requireIndex(ageYears, 'ageYears');
  return ageYears * WEEKS_PER_YEAR + strataOffsetWeeks(rank, cohortSize);
}

/**
 * ★**生まれた絶対週**。
 *
 * @param referenceWeek ★基準の絶対週（★世界を作る時点の「締まった週」）
 * @param ageYears      ★その時点の歳（★プリシード世界の `最終年 − birthYear`）
 * @param rank          ★コホート内の順位（★0 がいちばん若い）
 * @param cohortSize    ★そのコホートの頭数
 *
 * ⚠️ ★**負の値になりえます**（★祖先は何十年も前に生まれています）。
 *    ★`horses.birth_week` は `bigint` なので入ります。
 */
export function birthWeekOf(
  referenceWeek: number,
  ageYears: number,
  rank: number,
  cohortSize: number,
): number {
  if (!Number.isInteger(referenceWeek)) {
    throw new Error(`birth-week: referenceWeek が整数ではありません（${referenceWeek}）`);
  }
  return referenceWeek - ageWeeksOf(ageYears, rank, cohortSize);
}

/**
 * ★**安定した順位**を付けます（★コホートの中で）。
 *
 * 🔴 ★**`localeCompare` を使いません。** ★あれは実行環境の locale に依るので、
 *    ★**機械が違うと順位が変わりえます**（★憲法 §1-4 の決定論）。
 *    ★ここは **コードポイントの順**（`<`）で並べます。
 *
 * ⚠️ ★**同じキーが 2 つあると投げます** — ★黙って片方を捨てると、
 *    ★**1 頭ぶん順位がずれて、以後 全部ずれます**。
 */
export function rankByStableKey(keys: readonly string[]): Map<string, number> {
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out = new Map<string, number>();
  for (let i = 0; i < sorted.length; i += 1) {
    const key = sorted[i] as string;
    if (out.has(key)) throw new Error(`birth-week: 順位を付けるキーが重複しています（${key}）`);
    out.set(key, i);
  }
  return out;
}

/**
 * 🔴 ★**ゲーム内の「年」は、ここから引きます**（★2026-09-20・裁定 Q-3）。
 *
 * 【★なぜ 1 か所に置くか】
 *   ★`horses.birth_year`（★生まれた年）と ★`bred_this_year`（★今年 配合したか）は、
 *   ★**同じ「年」**を指していなければ噛み合いません。
 *   ⚠️ ★別々に `Math.floor(week / 52)` と書くと、★**片方を直した日にもう片方が黙って古びます**
 *     （★2026-09-20 に 4 回 見た形）。→ ★**両方がここを呼びます**（★**D-052**）。
 *
 * ⚠️ ★これは ★**基準の週からの通し年**です。★実時間の暦ではありません（★1 週 = 実 4 時間）。
 */
export function gameYearOf(week: number): number {
  if (!Number.isInteger(week)) {
    throw new Error(`game-year: 週は整数で渡してください（受け取った値: ${week}）`);
  }
  return Math.floor(week / WEEKS_PER_YEAR);
}

/**
 * ★**その週が、年の変わり目か**（★年次カウンタを 0 に戻す所）。
 *
 * ⚠️ ★`week === 0` も「変わり目」です（★世界の最初の週）。
 *    ★呼ぶ側が「前の週」を持っているなら `gameYearOf` を 2 回 比べるほうが確実です。
 */
export function isGameYearStart(week: number): boolean {
  return gameYearOf(week) * WEEKS_PER_YEAR === week;
}
