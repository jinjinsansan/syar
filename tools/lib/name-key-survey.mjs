/**
 * ★**馬名の正規化キーの下見**（★純関数・PLAN I-3 段 2・`tools/backfill-name-key.mjs` が使う）。
 *
 *   ★DB に触りません。★行（`{ id, name, name_key }`）と正規化の関数を受け取り、★数えるだけです。
 *   ★純関数にした理由: ★staging では重なりが 0 件で、★「重なりがあれば書かずに止まる」番人が
 *   ★**一度も発火していなかった**ため（★発火しない番人は番人ではない・CK-14）。
 *   → ★検査（`apps/cli/test/name-key-survey.test.ts`）が ★重なり・空の名前を作って ★止まることを確かめます。
 *
 * @param {readonly { id: string, name: string, name_key: string | null }[]} rows
 * @param {(name: string) => string} normalize ★`normalizeName`（★正規化を写さない・D-052）
 */
export function surveyNameKeys(rows, normalize) {
  const byKey = new Map();
  let empty = 0;
  let nullKey = 0;
  let wrongKey = 0;
  const toWrite = [];
  for (const r of rows) {
    const k = normalize(r.name);
    if (k.length === 0) empty += 1;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
    if (r.name_key === null) nullKey += 1;
    else if (r.name_key !== k) wrongKey += 1;
    if (r.name_key !== k) toWrite.push([r.id, k]);
  }
  const collisions = [...byKey.values()].filter((n) => n > 1).length;
  return { total: rows.length, empty, nullKey, wrongKey, collisions, toWrite };
}

/** ★書いてよいか（★重なりも空の名前も無いこと）。★`--apply` の手前で使う */
export function blocksBackfill(survey) {
  return survey.collisions > 0 || survey.empty > 0;
}
