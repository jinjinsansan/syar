/**
 * ★**未検査の馬名を、禁止名の判定で 2 つに分ける**（★純関数・`tools/recheck-name-blocklist.mjs` が使う）。
 *
 *   ★DB に触りません。★行（`{ id, name_key }`）と判定（`name_key` → 禁止なら true）を受け取り、分けるだけです。
 *   ★純関数にした理由: ★本物の NG リストはまだ無く、★「当たったら書かない」番人を ★DB 無しで発火させて確かめるため。
 *
 * @param {readonly { id: string, name_key: string | null }[]} rows
 * @param {(normalized: string) => boolean} blocked
 * @returns {{ hits: { id: string }[], clean: { id: string }[] }}
 */
export function partitionByBlocklist(rows, blocked) {
  const hits = [];
  const clean = [];
  for (const r of rows) {
    // ★name_key が空の行は ★判定できないので ★書かない側（★hits と同じく残す）に入れない — ★どちらにも入れず呼ぶ側が数える
    if (r.name_key === null) continue;
    if (blocked(r.name_key)) hits.push({ id: r.id });
    else clean.push({ id: r.id });
  }
  return { hits, clean };
}

/**
 * ★**当たった行に書く印**（★レビュー側の推奨・裁定 `REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md` §6）。
 *   ★未検査（null）とも、★当たらなかった行（★リストの版そのもの）とも ★区別できる値にします。
 *   ★「どの版で当たったか」も残るので、★リストが改まったときに ★当たりだけを選んで検査し直せます。
 * @param {string} version ★リストの版（★`loadNameBlocklist` の `version`）
 * @returns {string}
 */
export function hitMarkOf(version) {
  if (typeof version !== 'string' || version.length === 0) throw new Error('★リストの版がありません（★印を作れません）');
  return `hit:${version}`;
}

/**
 * ★その印が「当たり」か。
 * @param {string | null} mark ★`name_checked_with` の値
 * @returns {boolean}
 */
export function isHitMark(mark) {
  return typeof mark === 'string' && mark.startsWith('hit:');
}
