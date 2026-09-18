/**
 * ★**いま赤いと分かっている検査の登録簿**（★RD-2・2026-09-19）
 *   ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §4
 *
 * 【🔴 ★なぜ要るか】
 *   ★報告に「2,226 / 2,227」と書き続けると、★**「いくつ赤か」を人が覚えている状態**になります。
 *   ★2 件目が出たとき、★**3 件目は紛れます**（R-16: いちばん楽に検査を満たす道）。
 *   → ★**赤は数ではなく名前で管理します。** ★ここに載っていない赤が 1 つでも出たら落ちます。
 *
 * 【★載せるときに必ず書くこと】
 *   ★`test`     … ★検査の名前（★ファイル > describe > it を `>` で繋いだもの。★部分一致ではなく**完全一致**）
 *   ★`why`      … ★**なぜ赤いか**（★「調査中」は理由ではありません）
 *   ★`owner`    … ★誰の担当か（★`dev` / `review` / `owner`）
 *   ★`until`    … ★いつまでか（★ISO の日付。★過ぎたら落ちます）
 *
 * 【⚠️ ★緑に戻ったのに載っているのも落とします】
 *   ★登録簿が ★**現実より悲観的**になると、★「この赤は既知」で本当の赤を見逃します。
 *   ★直した人が ★**ここから消す**まで通りません。
 *
 * 【★使い方】
 *   `node tools/verify-known-red.mjs`（★`npm test` を流して照合します）
 */

/**
 * ★**いま赤い検査**。★空 ＝ ★赤が 1 つも無いこと。
 *
 * ⚠️ ★**空にしたくて検査を消す・skip するのは禁止**です。★skip は「赤が無い」ではなく
 *    ★「見ていない」で、★この登録簿より悪い状態です（★R-16）。
 */
export const KNOWN_RED = [
  // 例:
  // {
  //   test: 'packages/render/test/edit-grammar-audit.test.ts > 編集文法の監査 > ⑨ seed 分類を現 HEAD で再確認している',
  //   why: '…',
  //   owner: 'dev',
  //   until: '2026-09-30',
  // },
];

/**
 * ★**この登録簿の外にある赤と、緑に戻った登録**を返す。
 *
 * @param {readonly string[]} failing ★いま落ちている検査の名前（★完全一致の並び）
 * @param {string} todayIso ★今日（★`until` の判定に使う。★`Date.now()` を中で呼ばない・憲法 4）
 * @param {readonly object[]} registry ★登録簿。★既定は実物。
 *   ⚠️ ★**差し替えられる形にしてあります** — ★そうしないと、★登録簿が空の間
 *      ★**4 つの落ち方のうち 3 つを試せません**（★「✅ が別の理由で出ていないか」）。
 */
export function diffAgainstRegistry(failing, todayIso, registry = KNOWN_RED) {
  const known = new Map(registry.map((r) => [r.test, r]));
  const unregistered = failing.filter((t) => !known.has(t));
  const staleGreen = registry.filter((r) => !failing.includes(r.test)).map((r) => r.test);
  const expired = registry.filter((r) => r.until < todayIso).map((r) => `${r.test}（期限 ${r.until}）`);
  const missingFields = registry
    .filter((r) => !r.test || !r.why || !r.owner || !r.until)
    .map((r) => r.test ?? '(名前が無い登録)');
  return { unregistered, staleGreen, expired, missingFields };
}
