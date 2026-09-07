/**
 * ★納品スプライトを**剛体を基準に**揃え直す（★2026-09-05）
 *
 * 【⚠️ ★なぜ `align-delivered-sprites.mjs` ではだめだったか — ★前提が成り立ちません】
 *   ★あちらは ★**倍率 = √(平均面積 / そのコマの面積)** で揃えます。
 *   ★前提は「★脚の開閉では面積がほぼ変わらない」でした。★この素材では成り立ちません:
 *
 *     ★被写体の面積 … ★**6,577 ↔ 12,736（約 2 倍）**
 *
 *   ★実際に掛けた結果、★**悪化しました**（★オーナー実見「飛んでいる感じ・連続していない」の最中）:
 *
 *     ★高さのばらつき  ★16.3% → ★**19.8%**   ／ ★倍率の幅 ★0.856〜1.186（★39%）
 *
 *   → ★面積は**脚が伸びると増える**ので、★伸びたコマを**縮めて**しまいます。
 *
 * 【★何を基準にするか — ★**変わってはいけないもの**を測ります】
 *   ★騎手のヘルメットは ★**剛体**です。★走っても伸び縮みしません。
 *   → ★`cap` 層の**いちばん上から 20 行**（★あご紐が入らない範囲）の面積を測り、
 *     ★その平方根で倍率を決めます。
 *
 *   ★実測（★再納品版 `horse_3A_reissue_final` を修復したもの）:
 *
 *     | | 揃える前 | 揃えたあと |
 *     |---|---|---|
 *     | ★接地点のばらつき | ★14.9% | ★**0.5%** |
 *     | ★被写体高のばらつき | ★16.3% | ★**12.6%** |
 *     | ★倍率の幅 | — | ★0.976〜1.042（★6.7%）|
 *
 *   ★（★参考・合格済み: `winner-v2` 接地 4.6%/高さ 6.1% ／ `side-v7` 接地 9.6%/高さ 9.5%）
 *
 * 【⚠️ ★これでも直りきりません — ★描き直しが要る所】
 *   ★揃えたあとでも、★**ヘルメットの幅は 12.8% 振れます**（★揃える前 16.2%）。
 *   ★倍率を合わせても残るということは、★**コマごとに形そのものが違う**ということです。
 *   → ★この 8 枚は ★**1 体を回して描いたものではなく、8 枚を別々に描いたもの**です。
 *     ★そこはデータ処理では直せません。★再納品で直すこと。
 *
 * 【⚠️ ★5 層に同じ変換を掛けること】
 *   ★層ごとに別々に揃えると、★**体と鬣と騎手がバラバラに動きます**（★`align-delivered-sprites` と同じ）。
 *
 * ★実行: node tools/align-sprites-by-rigid.mjs <入力フォルダ> <出力フォルダ>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const SRC = process.argv[2] ?? 'tmp/horse3a_v2/fixed';
const OUT = process.argv[3] ?? 'tmp/horse3a_v2/rigid';
const LAYERS = ['coat', 'mane', 'silk', 'cap', 'tack'];
const FRAMES = 8;
/** ★剛体として測る範囲（★帽子の天辺から下へ。★あご紐を含めない） */
const DOME_ROWS = 20;
const nn = (i) => String(i + 1).padStart(2, '0');

mkdirSync(OUT, { recursive: true });

async function pixelsOf(file) {
  const im = await loadImage(file);
  const c = createCanvas(im.width, im.height);
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  return { w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height).data };
}

/** ★帽子の天辺から `DOME_ROWS` 行ぶんの面積（★剛体） */
function domeArea({ w, h, d }) {
  let top = -1;
  for (let y = 0; y < h && top < 0; y += 1) {
    for (let x = 0; x < w; x += 1) if (d[(y * w + x) * 4 + 3] >= 64) { top = y; break; }
  }
  if (top < 0) return 0;
  let n = 0;
  for (let y = top; y < Math.min(h, top + DOME_ROWS); y += 1) {
    for (let x = 0; x < w; x += 1) if (d[(y * w + x) * 4 + 3] >= 64) n += 1;
  }
  return n;
}

/** ★被写体の下端（★接地線を揃えるため） */
function bottomOf({ w, h, d }) {
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = 0; x < w; x += 1) if (d[(y * w + x) * 4 + 3] >= 32) return y;
  }
  return h - 1;
}

const domes = [];
const bottoms = [];
let W = 512; let H = 512;
for (let i = 0; i < FRAMES; i += 1) {
  const cap = await pixelsOf(path.join(SRC, `${nn(i)}_cap.png`));
  const coat = await pixelsOf(path.join(SRC, `${nn(i)}_coat.png`));
  W = coat.w; H = coat.h;
  domes.push(domeArea(cap));
  bottoms.push(bottomOf(coat));
}
const meanDome = domes.reduce((a, b) => a + b, 0) / FRAMES;
const meanBottom = bottoms.reduce((a, b) => a + b, 0) / FRAMES;

console.log('★コマごとの補正（★剛体＝ヘルメットの天辺から求め、5 層すべてに同じものを掛けます）');
for (let i = 0; i < FRAMES; i += 1) {
  const s = Math.sqrt(meanDome / Math.max(1, domes[i]));
  /** ★倍率を掛けたあと、★下端を共通の線へ寄せる */
  const dy = meanBottom - bottoms[i] * s;
  console.log(`  ${nn(i)}  帽子の面積 ${String(domes[i]).padStart(4)}  倍率 ${s.toFixed(4)}  下端 ${bottoms[i]}  縦 ${dy >= 0 ? '+' : ''}${dy.toFixed(1)}px`);
  for (const layer of LAYERS) {
    const im = await loadImage(path.join(SRC, `${nn(i)}_${layer}.png`));
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(s, 0, 0, s, 0, dy);
    g.drawImage(im, 0, 0);
    writeFileSync(path.join(OUT, `${nn(i)}_${layer}.png`), c.toBuffer('image/png'));
  }
}
console.log(`★${FRAMES} コマ × ${LAYERS.length} 層 を揃えました → ${OUT}`);
console.log('⚠️ ★倍率を合わせても形の違いは残ります。★`node tools/verify-pose-set.mjs "<out>/{NN}_coat.png"` で確かめること');
