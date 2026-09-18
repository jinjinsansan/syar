/**
 * ★**NPC 種牡馬の式**（★正典 §10.5・1354 行／★**D-102 ③**・**D-107**・**T-11**）
 *
 * 【★正典の文（1354 行・そのまま）】
 *   > NPC 種牡馬の種付料は自動設定: `3,000 + G1勝利数 × 8,000 + 総獲得賞金/20`
 *   > （EP建て・**支払われた EP は焼却** = 重要シンク）
 *
 * 【★なぜ 1 本にまとめるか — ★**同じ式を 2 か所が要ります**】
 *   ★**D-107**: ★プレイヤー種牡馬の種付料は ★**この式で目安**を出し、★上限つきで持ち主が決める
 *   ★**D-102 ③**: ★馬の購入価格も ★**この式**から決める（★**素質を入力に取らない**）
 *   → ★別々に書くと、★**正典の 1 つの式が 2 か所**になります（D-052）。
 *
 * 【🔴 ★なぜ「素質を入力に取らない」ことが効くのか】
 *   ★D-102 ③ は「★**振り直しが成立しないこと**」を要求します。
 *   ★価格が素質から決まると、★**価格を見れば中身が分かり**、★買っては売ってを繰り返して
 *   ★当たりを引く遊びが成立します。
 *   → ★入力は ★**G1 勝利数と総獲得賞金だけ**。★どちらも ★**走った結果**で、★誰にでも見えています。
 *
 * 【⚠️ ★単位が混ざっています（★正典のとおり）】
 *   ★`総獲得賞金` は ★**PP**、★答えは ★**EP** です。★`/20` は ★**規模合わせを兼ねています**。
 *   ★これは正典の式そのままで、★ここで直しません（★直すなら正典の改訂）。
 *   ⚠️ ★**PP → EP の交換路ではありません** — ★誰の PP も動きません（★憲法 2）。
 *      ★「その馬がいくら稼いだか」という ★**実績の数**を価格に使っているだけです。
 */

/** ★基礎額 [EP]（§10.5） */
export const STUD_FEE_BASE_EP = 3_000;
/** ★G1 1 勝あたり [EP]（§10.5） */
export const STUD_FEE_PER_G1_EP = 8_000;
/** ★総獲得賞金の割り算（§10.5）。★`総獲得賞金 [PP] ÷ これ` が EP に足されます */
export const STUD_FEE_EARNINGS_DIVISOR = 20;

/**
 * ★**NPC 種牡馬の式**（§10.5）。
 *
 * @param g1Wins ★G1 の勝利数（★`horses.g1_wins`）
 * @param totalEarningsPP ★総獲得賞金 [PP]（★`race_entries.prize_pp` の和・**PR-1**）
 *
 * ⚠️ ★**負の入力は投げます**（★黙って 0 にすると、★壊れた行が安い馬に化けます・R-27）。
 * ⚠️ ★**整数で返します**（★EP は整数・`bets_amount_range` などと同じ扱い）。
 *    ★端数は ★**切り捨て**ます（★利用者に有利な側）。
 */
export function npcStudFee(g1Wins: number, totalEarningsPP: number): number {
  if (!Number.isInteger(g1Wins) || g1Wins < 0) {
    throw new Error(`npcStudFee: G1 勝利数が不正（${g1Wins}）`);
  }
  if (!Number.isInteger(totalEarningsPP) || totalEarningsPP < 0) {
    throw new Error(`npcStudFee: 総獲得賞金が不正（${totalEarningsPP}）`);
  }
  return STUD_FEE_BASE_EP
    + g1Wins * STUD_FEE_PER_G1_EP
    + Math.floor(totalEarningsPP / STUD_FEE_EARNINGS_DIVISOR);
}
