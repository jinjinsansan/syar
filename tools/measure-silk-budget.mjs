/**
 * ★アートバイブル §5 の実測 — 「馬体は共通スプライトの色替えで足りるか」
 *
 * 【何を測るか】
 *   > 足りるなら、アセット量は**勝負服のパターン数**で決まります。
 *   > 足りないなら、頭数×パターン数になり、初回ロード予算が桁で変わります。
 *
 *   ★この道具が答えるのは**「勝負服に何画素使えるか」**までです。
 *     「馬体を共通にして違和感が無いか」は**絵を見て決めること**で、
 *     オーナーの判断です。**数字で決められる範囲だけを出します。**
 *
 * 【★勝負服をどう見分けるか】
 *   原画では**勝負服だけが高彩度**（アートバイブル §1 の一行規則）です。
 *   だから「彩度が高い画素」＝勝負服として数えます。
 *   ⚠️ これは**この絵に対して成り立つ前提**で、絵柄が変われば崩れます。
 *      → 下で「彩度の分布」も出して、**閾値が恣意的でないこと**を確かめられるようにします。
 *
 * 実行: node tools/measure-silk-budget.mjs <入力png> [--size 32]
 */
import sharp from 'sharp';

const src = process.argv[2];
if (src === undefined) {
  console.error('使い方: node tools/measure-silk-budget.mjs <入力png> [--size 32]');
  process.exit(2);
}
const sizeIdx = process.argv.indexOf('--size');
const SIZE = sizeIdx >= 0 ? Number(process.argv[sizeIdx + 1]) : 32;

/** RGB → HSV（h は度・s と v は 0〜1） */
const hsvOf = (r, g, b) => {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
};

/**
 * ★**彩度だけで勝負服を見分けようとして失敗しました。**
 *   鹿毛の茶（例 RGB 139,90,60）は彩度 0.57 あり、**馬体を勝負服として数えていました**
 *   （126画素＝不透明部の48%という、明らかに多すぎる値で気づきました）。
 *
 * ★勝負服と馬体を分けるのは**色相**です。
 *   馬体（鹿毛・黒・白）は**橙〜黄（0〜60度）か無彩色**、勝負服は**それ以外**。
 *   ⚠️ これも「この絵に対する前提」です。**栗毛の馬に青い勝負服**なら成り立ちますが、
 *      **赤い勝負服**なら色相が近くなって崩れます。
 *      → だから下で**色相の分布**を出し、読む側が確かめられるようにします。
 */
const isSilk = (r, g, b) => {
  const { h, s } = hsvOf(r, g, b);
  if (s < 0.35) return false;               // 無彩色（白・黒・灰）は馬体・装具
  return !(h <= 60 || h >= 330);            // 橙〜黄（鹿毛・栗毛）を除く
};

const meta = await sharp(src).metadata();
console.log('# ★勝負服の画素予算（アートバイブル §5）');
console.log('');
console.log(`  原画: ${meta.width} × ${meta.height} / ${(meta.size ?? 0).toLocaleString()} バイト`);
console.log(`  縮小: ${SIZE} × ${SIZE}`);
console.log('');

/**
 * ★縮小は **nearest（最近傍）** を使います。
 *   平滑化すると**中間色が生まれ**、ピクセルアートになりません
 *   （アートバイブルは 48〜64色のパレット共有を前提にしています）。
 */
const { data, info } = await sharp(src)
  .resize(SIZE, SIZE, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const px = [];
for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 128) continue; // 透明は数えない
  px.push({ r, g, b, ...hsvOf(r, g, b), silk: isSilk(r, g, b) });
}

console.log(`  不透明な画素: ${px.length} / ${SIZE * SIZE}（${((px.length / (SIZE * SIZE)) * 100).toFixed(0)}%）`);
console.log('');

// ★色相の分布を出す。前提（馬体は橙〜黄・勝負服はそれ以外）が成り立つか、読む側が確かめられるように
console.log('【色相の分布】★馬体は橙〜黄に寄り、勝負服はそこから離れているか');
const HUE_BINS = [[0,60,'橙〜黄（鹿毛・栗毛）'],[60,150,'緑'],[150,210,'青緑'],[210,270,'青'],[270,330,'紫'],[330,360,'赤']];
const chroma = px.filter((p) => p.s >= 0.35);
for (const [lo, hi, label] of HUE_BINS) {
  const n = chroma.filter((p) => p.h >= lo && p.h < hi).length;
  const bar = '#'.repeat(Math.round((n / Math.max(1, chroma.length)) * 40));
  console.log(`  ${String(lo).padStart(3)}〜${String(hi).padStart(3)}度 ${label.padEnd(20)} ${String(n).padStart(4)} ${bar}`);
}
console.log(`  （無彩色 s<0.35: ${px.length - chroma.length} 画素）`);
console.log('');

const silkPx = px.filter((p) => p.silk).length;
console.log('【判定】');
console.log(`  ★勝負服に使える画素: 約 ${silkPx} 画素（32×32 の ${((silkPx / (SIZE * SIZE)) * 100).toFixed(1)}%）`);
if (silkPx < 12) {
  console.log('  ★★少なすぎます。色替えだけでは18頭を見分けられない可能性が高いです');
} else {
  console.log(`  ★色だけで区別するなら、必要なのは「18色が判別できること」です。`);
  console.log(`    ${silkPx} 画素あれば**面としては十分**で、あとは**色の選び方**の問題になります。`);
}
console.log('');
console.log('⚠️ ★この道具は「画素が足りるか」しか答えません。');
console.log('   「馬体を共通にして違和感が無いか」は**絵を見て決めること**です。');
