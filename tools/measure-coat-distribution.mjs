/**
 * ★**新しい毛色の規則を測る**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §9 条件 ①）
 *
 *   ★分類: **READONLY**（★1 文字も書きません。★DB にも触りません）
 *
 * ★測るもの:
 *   ① ★**分布** … 大きな母集団で、実在の割合（`COAT_WEIGHTS`）にどれだけ近いか
 *   ② ★**隣接の組数** … 12 頭立て・18 頭立ての出走表で、★隣どうしが同じ毛色になる組が何組か
 *      ⚠️ ★2026-08-28 の要望 ② は「隣接を散らす」だった。★新しい規則では保てないので、
 *         ★**どれだけ起きるかを数で出す**（★裁定 §9）。
 *      ★対照: ★古い規則（枠番の表）でも同じ数え方をする（★0 組のはず）。
 *      ★対照: ★7 色を等確率で引いた場合（★実在の割合を無視した場合）も出す。
 *
 * ★使い方: npx tsx tools/measure-coat-distribution.mjs
 */
import { coatOfHorseId, COAT_WEIGHTS } from '../packages/render/src/coat.ts';

/** ★本番の馬 ID と同じ形（★uuid）。★決まった手順で作る（★測定も決定論） */
const idAt = (n) => `0f000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** ★古い規則（★`apps/web/src/app/race/page.tsx` の `COAT_BY_GATE`・★対照のため写し） */
const OLD_BY_GATE = [
  'bay', 'chestnut', 'dark-bay', 'bay', 'grey', 'dark-bay',
  'chestnut', 'seal-brown', 'bay', 'dark-bay', 'bay', 'bay',
  'liver-chestnut', 'bay', 'blue-black', 'chestnut', 'dark-bay', 'bay',
];

const N = 100_000;
const count = new Map();
for (let i = 0; i < N; i += 1) {
  const c = coatOfHorseId(idAt(i));
  count.set(c, (count.get(c) ?? 0) + 1);
}
const total = COAT_WEIGHTS.reduce((s, [, w]) => s + w, 0);

console.log(`# ★毛色の分布（★馬 ${N.toLocaleString()} 頭・★馬 ID から引いた）`);
let worst = 0;
for (const [name, w] of COAT_WEIGHTS) {
  const got = (count.get(name) ?? 0) / N * 100;
  const want = w / total * 100;
  const diff = Math.abs(got - want);
  if (diff > worst) worst = diff;
  console.log(`  ${name.padEnd(15)} 実測 ${got.toFixed(2)}%  / 実在 ${want.toFixed(2)}%  / 差 ${diff.toFixed(2)} 点`);
}
console.log(`  → ★いちばん大きい差: ${worst.toFixed(2)} 点`);

/** ★1 レースぶんの出走表を作る（★馬 ID は連番で取り、★枠順に並べる） */
const fieldOf = (size, offset) => Array.from({ length: size }, (_, i) => coatOfHorseId(idAt(offset + i)));
const adjacentPairs = (coats) => {
  let n = 0;
  for (let i = 1; i < coats.length; i += 1) if (coats[i] === coats[i - 1]) n += 1;
  return n;
};

console.log('\n# ★隣どうしが同じ毛色になる組（★1 レースあたりの平均・★1 万レース）');
for (const size of [12, 18]) {
  let sum = 0;
  let zero = 0;
  for (let r = 0; r < 10_000; r += 1) {
    const p = adjacentPairs(fieldOf(size, r * size));
    sum += p;
    if (p === 0) zero += 1;
  }
  const old = adjacentPairs(OLD_BY_GATE.slice(0, size));
  console.log(`  ${size} 頭立て … 新しい規則 平均 ${(sum / 10_000).toFixed(2)} 組 / 1 組も無いレース ${(zero / 100).toFixed(1)}%`
    + `  ／ ★対照: 古い規則（枠番の表）${old} 組`);
}

console.log('\n# ★対照: ★7 色を等確率で引いたら（★実在の割合を無視した場合）');
{
  let sum = 0;
  const names = COAT_WEIGHTS.map(([c]) => c);
  for (let r = 0; r < 10_000; r += 1) {
    // ★等確率の引き方も決定論にする（★同じ FNV を使い、重みだけ外す）
    const coats = Array.from({ length: 12 }, (_, i) => {
      // ⚠️ ★混ぜる工程まで本番と同じにする（★ここを省くと、対照の方が偶然きれいに散る）
      let h = 0x811c9dc5;
      const t = idAt(r * 12 + i);
      for (let k = 0; k < t.length; k += 1) { h ^= t.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
      return names[(h >>> 0) % names.length];
    });
    sum += adjacentPairs(coats);
  }
  console.log(`  12 頭立て … 平均 ${(sum / 10_000).toFixed(2)} 組`);
}
