/**
 * ★**地面タイルに焼き込まれた「横縞」を平す**（★2026-09-11・★案 A）
 *
 * 【★なぜ要るか】★オーナー評:
 *   ★「★芝の目は ★**馬が走る方向と垂直**に、★逆方向へ動かないといけない。
 *   ★しかし動画では ★**馬が走る方向と水平**に動いている」
 *
 * 【★測った事実】★芝の目は ★**2 系統**あります:
 *   ★① `mow-stripes.ts` … ★走路を**横切る**帯（★向きの考え方は正しい）
 *   ★② `world-turf.png` … ★タイルに ★**焼き込まれた横縞**（★実測 0°・★行ごとの明暗 28.9 階調）
 *
 *   ⚠️ ★地面タイルは ★**カメラの軸**に貼られます（★`u`＝カメラの右／`v`＝カメラの前・
 *      ★`world-textured.ts` の走査線ごとの貼り方）。
 *   → ★**② は走路がどちらを向いていても、常に画面の水平**に走ります。
 *     ★コーナーでも直線でも ★**馬の進む向きと平行**のままです。
 *
 * 【★この道具がすること】
 *   ★行ごとの明るさの偏り（＝横縞）だけを引きます。★粒・色・彩度は触りません。
 *   ★出力 `world-turf-flat.png`。★画面では `?grain=flat` で読み込みます（★既定は変えません）。
 *
 * ⚠️ ★元のタイルは ★**上書きしません**。★戻す操作は「パラメータを外す」だけです。
 *
 * ★実行: node tools/bake-turf-flat.mjs
 */
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('apps/web/public/art/parallax/backstretch-side-v1');
const SRC = path.join(DIR, 'world-turf.png');
const DEST = path.join(DIR, 'world-turf-flat.png');

const img = await loadImage(SRC);
const W = img.width, H = img.height;
const c = createCanvas(W, H);
const g = c.getContext('2d');
g.drawImage(img, 0, 0);
const im = g.getImageData(0, 0, W, H);
const d = im.data;

/** ★行ごとの平均の明るさ（★この偏りが横縞そのもの） */
const rowMean = [];
for (let y = 0; y < H; y += 1) {
  let s = 0;
  for (let x = 0; x < W; x += 1) {
    const p = (y * W + x) * 4;
    s += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
  }
  rowMean.push(s / W);
}
const all = rowMean.reduce((a, b) => a + b, 0) / H;
const dev = rowMean.map((m) => m - all);
const swing = Math.max(...dev) - Math.min(...dev);

/**
 * ⚠️ ★**タイルの上下の端は縫い目**です。★行ごとに違う量を引くと段差が出ます。
 *    ★偏りは元から周期的（タイルは縦に繰り返す）なので、★そのまま引けば縫い目も揃います。
 */
for (let y = 0; y < H; y += 1) {
  const k = dev[y];
  for (let x = 0; x < W; x += 1) {
    const p = (y * W + x) * 4;
    for (let ch = 0; ch < 3; ch += 1) {
      d[p + ch] = Math.max(0, Math.min(255, d[p + ch] - k));
    }
  }
}
g.putImageData(im, 0, 0);
writeFileSync(DEST, c.toBuffer('image/png'));

console.log(`★元 ${path.basename(SRC)} ${W}×${H}`);
console.log(`★引いた横縞の振れ幅 ${swing.toFixed(1)} 階調`);
console.log(`★出力 ${DEST}`);
console.log('★向きの確認: node tmp/_grain-angle.mjs でタイル単体の目の向きを測れます');
