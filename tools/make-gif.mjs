/**
 * ★アニメーション GIF を自分で組み立てる
 *
 * 【なぜ自分で書くか】
 *   sharp の GIF 出力で多ページにできず（`pages: 1` のまま）、
 *   ffmpeg も ImageMagick もこの環境にありません。
 *   ★**GIF89a は形式が単純**なので、確実なほうを選びます。
 *
 * 【★確認のために作るものです】
 *   ゲーム本体はスプライトシートを Canvas で描くので、GIF は要りません。
 *   ここで作るのは**オーナーに動きを見ていただくため**だけです。
 *
 * 実行: node tools/make-gif.mjs <出力.gif> <入力1.png> <入力2.png> ... [--delay 9]
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const di = args.indexOf('--delay');
/** 1/100 秒単位 */
const DELAY = di >= 0 ? Number(args[di + 1]) : 9;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--delay');
const [out, ...ins] = files;
if (out === undefined || ins.length === 0) {
  console.error('使い方: node tools/make-gif.mjs <出力.gif> <入力.png...> [--delay 9]');
  process.exit(2);
}

/**
 * ★色を 256 色以下に落とす（GIF の制約）。
 *   ⚠️ 減色でピクセルアートの色が変わると、**見ているものが別物**になります。
 *      → 実際に使われた色数を出して、**落ちていないことを確かめられる**ようにします。
 */
/**
 * ★**減色は黙ってやりません。**
 *   `--quantise` を付けたときだけ、**いちばん近い色に寄せます**。
 *   そして**何画素を寄せたか・最大でどれだけ色が変わったか**を必ず出します。
 *   ⚠️ 「見た目は同じ」ではなく、**数字で示します**。
 */
const QUANTISE = args.includes('--quantise');
let overflow = 0;
let maxShift = 0;

const frames = [];
const palette = new Map(); // 'r,g,b' -> index

/** パレットの中でいちばん近い色（ユークリッド距離） */
function nearest(r, g, b) {
  let best = 0, bestD = Infinity;
  let i = 0;
  for (const key of palette.keys()) {
    const [pr, pg, pb] = key.split(',').map(Number);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
    i += 1;
  }
  if (Math.sqrt(bestD) > maxShift) maxShift = Math.sqrt(bestD);
  return best;
}
for (const f of ins) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = new Uint8Array(info.width * info.height);
  for (let p = 0; p < info.width * info.height; p += 1) {
    const o = p * info.channels;
    const key = `${data[o]},${data[o + 1]},${data[o + 2]}`;
    if (!palette.has(key)) {
      if (palette.size >= 256) {
        if (!QUANTISE) {
          console.error(`★色が 256 を超えました。減色していないので中止します`);
          console.error('  ★減色してよいなら --quantise を付けてください（何色をいくつ落としたか必ず出します）');
          process.exit(1);
        }
        overflow += 1;
        idx[p] = nearest(data[o], data[o + 1], data[o + 2]);
        continue;
      }
      palette.set(key, palette.size);
    }
    idx[p] = palette.get(key);
  }
  frames.push({ w: info.width, h: info.height, idx });
}
const W = frames[0].w;
const H = frames[0].h;
if (frames.some((f) => f.w !== W || f.h !== H)) {
  console.error('★フレームの寸法が揃っていません');
  process.exit(1);
}

/** パレットは 2 のべき乗サイズに切り上げる（GIF の規定） */
let bits = 1;
while (1 << bits < palette.size) bits += 1;
const tableSize = 1 << bits;

const bytes = [];
const push = (...b) => bytes.push(...b);
const u16 = (n) => push(n & 0xff, (n >> 8) & 0xff);

// --- ヘッダ ---
push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
u16(W); u16(H);
push(0xf0 | (bits - 1), 0, 0);           // グローバルカラーテーブルあり
const colors = [...palette.keys()];
for (let i = 0; i < tableSize; i += 1) {
  const [r, g, b] = (colors[i] ?? '0,0,0').split(',').map(Number);
  push(r, g, b);
}
// --- ループ（NETSCAPE 拡張）---
push(0x21, 0xff, 0x0b);
push(...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)));
push(0x03, 0x01, 0x00, 0x00, 0x00);

/** ★LZW 圧縮（GIF の規定）。ここを間違えると壊れた GIF になります */
function lzw(indices, minCode) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict = new Map();
  const reset = () => {
    dict = new Map();
    for (let i = 0; i < clear; i += 1) dict.set(String(i), i);
    size = minCode + 1;
    return clear + 2;
  };
  let next = reset();
  const outBits = [];
  let cur = 0, curLen = 0;
  const emit = (code) => {
    cur |= code << curLen;
    curLen += size;
    while (curLen >= 8) { outBits.push(cur & 0xff); cur >>= 8; curLen -= 8; }
  };
  emit(clear);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const cand = `${prefix},${k}`;
    if (dict.has(cand)) { prefix = cand; continue; }
    emit(dict.get(prefix));
    dict.set(cand, next);
    next += 1;
    if (next > (1 << size) && size < 12) size += 1;
    else if (next >= 4096) { emit(clear); next = reset(); }
    prefix = String(k);
  }
  emit(dict.get(prefix));
  emit(eoi);
  if (curLen > 0) outBits.push(cur & 0xff);
  return outBits;
}

for (const fr of frames) {
  push(0x21, 0xf9, 0x04, 0x04);          // グラフィック制御（前を残さない）
  u16(DELAY);
  push(0x00, 0x00);
  push(0x2c); u16(0); u16(0); u16(W); u16(H); push(0x00);
  const minCode = Math.max(2, bits);
  push(minCode);
  const comp = lzw(Array.from(fr.idx), minCode);
  for (let i = 0; i < comp.length; i += 255) {
    const chunk = comp.slice(i, i + 255);
    push(chunk.length, ...chunk);
  }
  push(0x00);
}
push(0x3b);

writeFileSync(out, Buffer.from(bytes));
console.log(`  ${out}: ${frames.length} フレーム / ${W}×${H} / 色 ${palette.size} / ${bytes.length.toLocaleString()} バイト`);
if (overflow > 0) {
  console.log(`  ★減色しました: ${overflow.toLocaleString()} 画素を近い色に寄せた / 最大のずれ ${maxShift.toFixed(1)}（RGB距離）`);
}

// ★事後条件: 書いたものが本当に多ページの GIF か（自分で確かめる）
const check = await sharp(out).metadata();
console.log(`  ★確認: pages=${check.pages} delay=${(check.delay ?? [])[0]} loop=${check.loop}`);
if ((check.pages ?? 1) !== frames.length) {
  console.error('  ★★ページ数が一致しません。壊れた GIF です');
  process.exit(1);
}
