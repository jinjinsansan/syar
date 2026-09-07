/**
 * ★納品スプライトを揃え直す — ★**5 層に「同じ」変換を掛ける**
 *
 * 【⚠️ ★なぜ要るか — ★納品の不適合その 2】
 *   ★発注書 §3 は ★**接地線・中心・大きさを全コマで統一**を指定しています。
 *   ★修復後に実測すると:
 *   　★接地点のばらつき **20.2%** ／ ★大きさのばらつき **16.4%**
 *   　★（★発注書の目安は **4.6〜9.6%**。★過去に合格した素材の帯）
 *   → ★このままだと ★**走ると馬が伸び縮みして跳ねます**。
 *
 * 【★揃え方（★`tools/align-pose-set.mjs` と同じ考え方・R-30）】
 *   ⚠️ ★**外接矩形は基準にできません。** ★脚が伸び縮みするので矩形は**正しく**変動します。
 *   → ★**大きさ** … 被写体の面積の平方根（★面積 ∝ 倍率²。脚の開閉では面積がほぼ変わらない）
 *   → ★**位置**   … 被写体の重心。★ただし**上半分（胴と騎手）だけ**で取る
 *
 * 【⚠️ ★5 層に同じ変換を掛けること】
 *   ★層ごとに別々に揃えると、★**体と鬣と騎手がバラバラに動きます**。
 *   ★変換は `coat` から 1 つ求めて、★5 層すべてに同じものを適用します。
 *
 * ★実行: node tools/align-delivered-sprites.mjs <入力フォルダ> <出力フォルダ>
 */
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const SRC = process.argv[2] ?? 'tmp/horse3a/fixed';
const OUT = process.argv[3] ?? 'tmp/horse3a/aligned';
const LAYERS = ['coat', 'mane', 'silk', 'cap', 'tack'];
const FRAMES = 8;
const nn = (i) => String(i + 1).padStart(2, '0');
/** ★接地線（★発注書 §3 / sevendays の実測） */
const FEET = 0.920;

mkdirSync(OUT, { recursive: true });

/** ★被写体（★アルファがある画素）を測る */
async function measure(file) {
  const im = await loadImage(file);
  const c = createCanvas(im.width, im.height);
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, im.width, im.height).data;
  let top = im.height; let bottom = -1; let left = im.width; let right = -1; let area = 0;
  for (let y = 0; y < im.height; y += 1) {
    for (let x = 0; x < im.width; x += 1) {
      if (d[(y * im.width + x) * 4 + 3] < 16) continue;
      area += 1;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  /** ★重心は**上半分だけ**（★脚の開閉に引っ張られないように） */
  const half = top + (bottom - top) * 0.5;
  let sx = 0; let sy = 0; let n = 0;
  for (let y = top; y <= half; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (d[(y * im.width + x) * 4 + 3] < 16) continue;
      sx += x; sy += y; n += 1;
    }
  }
  return { w: im.width, h: im.height, area, top, bottom, cx: sx / n, cy: sy / n };
}

const m = [];
for (let i = 0; i < FRAMES; i += 1) {
  m.push(await measure(path.join(SRC, `${nn(i)}_coat.png`)));
}
const meanArea = m.reduce((s, x) => s + x.area, 0) / FRAMES;
const meanCx = m.reduce((s, x) => s + x.cx, 0) / FRAMES;
const meanCy = m.reduce((s, x) => s + x.cy, 0) / FRAMES;
const W = m[0].w;
const H = m[0].h;

console.log('★コマごとの補正（★coat から求め、5 層すべてに同じものを掛けます）');
const xf = [];
for (let i = 0; i < FRAMES; i += 1) {
  const s = Math.sqrt(meanArea / m[i].area);
  /** ★重心を平均へ寄せる（★倍率を掛けたあとの位置で合わせる） */
  const dx = meanCx - m[i].cx * s;
  const dy = meanCy - m[i].cy * s;
  xf.push({ s, dx, dy });
  console.log(`  ${nn(i)}  倍率 ${s.toFixed(4)}  横 ${dx.toFixed(1)}px  縦 ${dy.toFixed(1)}px`);
}

for (let i = 0; i < FRAMES; i += 1) {
  const { s, dx, dy } = xf[i];
  for (const layer of LAYERS) {
    const file = path.join(SRC, `${nn(i)}_${layer}.png`);
    const im = await loadImage(file);
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(s, 0, 0, s, dx, dy);
    g.drawImage(im, 0, 0);
    writeFileSync(path.join(OUT, `${nn(i)}_${layer}.png`), c.toBuffer('image/png'));
  }
}
console.log(`★${FRAMES} コマ × ${LAYERS.length} 層 を揃えました → ${OUT}`);
console.log(`⚠️ ★接地線 ${FEET} への合わせ込みは、★揃えたあとに実測して別便で行います`);
