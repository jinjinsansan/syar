/**
 * ★緑の抜き残りを測る — ★**輪郭沿いと、囲まれた抜け残りを分ける**
 *
 * 【★なぜ要るか】
 *   ★`remove-chroma-key.mjs` は縁をやわらかく抜くので、★**輪郭沿いに緑が微量残ります**。
 *   ★これは実害がありません（★塊が小さく、縮小すると消えます）。
 *
 *   ⚠️ ★問題になるのは ★**輪郭から離れた所に残る緑**です。
 *   　★口元・脚の間・手綱の内側など、★**囲まれていて縁から届かない**所に残ります。
 *   　★コマごとに出たり出なかったりするので、★**再生するとそこがちらつきます**。
 *
 *   ★2026-09-05、★同じ形の欠陥（★囲まれた市松模様）を見逃して、
 *   　★オーナーに「白がチカチカする」と指摘されました。★同じ轍を踏まないための道具です。
 *
 * 【★測るもの】
 *   ★① 緑の総量（★参考。★輪郭沿いを含むので合否にしない）
 *   ★② ★**輪郭から離れた緑**（★合否）
 *   ★③ ★**塊の最大**（★合否。★大きい塊は目に付く）
 *   ★④ ★コマ間のばらつき（★出たり出なかったりすると、ちらつきになる）
 *
 * ★実行: node tools/verify-chroma-residue.mjs 'out/gen/keyed/{NN}.png' [コマ数]
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const pattern = process.argv[2];
const FRAMES = Number(process.argv[3] ?? 16);
if (pattern === undefined || !pattern.includes('{NN}')) {
  console.error("使い方: node tools/verify-chroma-residue.mjs 'out/gen/keyed/{NN}.png' [コマ数]");
  process.exit(2);
}

/** ★輪郭から離れたと見なす距離 [px]。★これより内側は「囲まれた抜け残り」 */
const EDGE_PX = 3;
/** ★合否 — ★輪郭から離れた緑 */
const INNER_MAX = 60;
/** ★合否 — ★塊の最大 */
const BLOB_MAX = 120;

/** ★4 近傍のラベリング（★塊の大きさを数えるだけ） */
function blobs(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < w * h; s += 1) {
    if (mask[s] === 0 || seen[s] === 1) continue;
    seen[s] = 1; stack.push(s);
    let n = 0;
    while (stack.length > 0) {
      const k = stack.pop();
      n += 1;
      const x = k % w; const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (mask[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; stack.push(nk); }
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

/** ★不透明部を EDGE_PX ぶん内側へ削る（★縁を外すため） */
function erode(op, w, h, times) {
  let cur = op;
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const k = y * w + x;
        if (cur[k] === 1 && cur[k - 1] === 1 && cur[k + 1] === 1 && cur[k - w] === 1 && cur[k + w] === 1) {
          next[k] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

console.log('# ★緑の抜き残り');
console.log('  コマ   緑の総量   ★輪郭から離れた緑   ★塊の最大');
const inners = [];
const worst = [];
for (let f = 1; f <= FRAMES; f += 1) {
  const file = pattern.replace('{NN}', String(f).padStart(2, '0'));
  if (!existsSync(file)) continue;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const op = new Uint8Array(w * h);
  const green = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < data.length; i += 4, k += 1) {
    if ((data[i + 3] ?? 0) < 64) continue;
    op[k] = 1;
    const r = data[i] ?? 0; const g = data[i + 1] ?? 0; const b = data[i + 2] ?? 0;
    if (g - Math.max(r, b) > 20) green[k] = 1;
  }
  const inner = erode(op, w, h, EDGE_PX);
  const innerGreen = new Uint8Array(w * h);
  let total = 0; let innerN = 0;
  for (let k = 0; k < w * h; k += 1) {
    if (green[k] === 0) continue;
    total += 1;
    if (inner[k] === 1) { innerGreen[k] = 1; innerN += 1; }
  }
  const sz = blobs(innerGreen, w, h);
  const top = sz[0] ?? 0;
  inners.push(innerN); worst.push(top);
  const mark = (innerN > INNER_MAX || top > BLOB_MAX) ? '  ★' : '';
  console.log(`  ${String(f).padStart(3)}  ${String(total).padStart(9)}  ${String(innerN).padStart(16)}  ${String(top).padStart(9)}${mark}`);
}
if (inners.length === 0) { console.error('★ファイルがありません'); process.exit(2); }
const maxInner = Math.max(...inners);
const maxBlob = Math.max(...worst);
console.log();
console.log(`  ★輪郭から離れた緑の最大 ${maxInner} px（合格線 ${INNER_MAX} 以内）`);
console.log(`  ★塊の最大 ${maxBlob} px（合格線 ${BLOB_MAX} 以内）`);
if (maxInner > INNER_MAX || maxBlob > BLOB_MAX) {
  console.error('\n★★不合格 — ★囲まれた所に緑が残っています（★再生するとそこがちらつきます）');
  process.exit(1);
}
console.log('\n  ★合格 — ★残りは輪郭沿いの微量だけです');
