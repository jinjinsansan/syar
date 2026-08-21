/**
 * ★走行 8 コマ（個別ファイル）を、胴体を基準に揃え直す
 *
 * 【なぜ要るか（2026-08-20 の実害）】
 *   俯瞰の新素材は**1コマずつは合格**だったのに、**動かすとガクガクして走って見えません**でした。
 *   `verify-pose-set.mjs` は接地点 22.0% / 高さ 26.9% と出しており（合格済みは 4.6〜9.6%）、
 *   **道具は正しく警告していました。** 私が「面積は 5% 以内だから」と理屈をつけて無視しました。
 *
 * 【何を揃えるか】
 *   ★**外接矩形は基準にできません。** 脚が伸び縮みするので、矩形は正しく変動します。
 *   代わりに:
 *     ・**大きさ** … 被写体の面積の平方根（面積 ∝ 倍率²）。脚の開閉では面積はほぼ変わらない
 *     ・**位置**   … 被写体の重心。ただし脚の影響を薄めるため**上半分（胴と騎手）だけ**で取る
 *
 * 【★出力は入力と同じ画布・同じ寸法】
 *   描画側は元画像 px の座標系で配置するので、**画布の大きさを変えないこと**。
 *   中身だけを拡大縮小・平行移動して焼き直します。
 *
 * 実行:
 *   node tools/align-pose-set.mjs 'out/gen/horse-jockey-high-diag-v3-pose{NN}-chroma.png' 'out/gen/aligned/{NN}.png'
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const [inPattern, outPattern] = process.argv.slice(2);
if (inPattern === undefined || outPattern === undefined
  || !inPattern.includes('{NN}') || !outPattern.includes('{NN}')) {
  console.error("使い方: node tools/align-pose-set.mjs '<入力。{NN}を含む>' '<出力。{NN}を含む>'");
  process.exit(2);
}
const FRAMES = 8;
const nn = (i) => String(i + 1).padStart(2, '0');

/** キー色（緑）か。透過なら alpha=0 も背景 */
const isBg = (d, i) => d[i + 3] < 16 || (d[i + 1] > 200 && d[i] < 100 && d[i + 2] < 100);

async function measure(path) {
  const im = await loadImage(path);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data;
  let top = im.height, bottom = -1, left = im.width, right = -1, area = 0;
  for (let y = 0; y < im.height; y += 1) {
    for (let xx = 0; xx < im.width; xx += 1) {
      const i = (y * im.width + xx) * 4;
      if (isBg(d, i)) continue;
      area += 1;
      if (y < top) top = y; if (y > bottom) bottom = y;
      if (xx < left) left = xx; if (xx > right) right = xx;
    }
  }
  // ★重心は上半分だけで取る（脚の開閉に引っ張られないように）
  const half = top + (bottom - top) * 0.5;
  let sx = 0, sy = 0, n = 0;
  for (let y = top; y <= half; y += 1) {
    for (let xx = left; xx <= right; xx += 1) {
      const i = (y * im.width + xx) * 4;
      if (isBg(d, i)) continue;
      sx += xx; sy += y; n += 1;
    }
  }
  return { im, w: im.width, h: im.height, top, bottom, left, right, area, cx: sx / n, cy: sy / n };
}

const m = [];
for (let i = 0; i < FRAMES; i += 1) {
  const f = inPattern.replace('{NN}', nn(i));
  if (!existsSync(f)) { console.error(`★ありません: ${f}`); process.exit(1); }
  m.push(await measure(f));
}

// 中央値を基準にする（平均だと外れコマに引きずられる）
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const refArea = med(m.map((s) => s.area));
const refCx = med(m.map((s) => s.cx));
const refCy = med(m.map((s) => s.cy));

console.log('=== 揃え直し ===');
console.log('  コマ  倍率   Δx     Δy');
for (let i = 0; i < FRAMES; i += 1) {
  const s = m[i];
  const scale = Math.sqrt(refArea / s.area);
  const out = createCanvas(s.w, s.h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 重心を中心に拡大縮小し、そのあと基準の重心へ平行移動する
  const dx = refCx - s.cx * scale;
  const dy = refCy - s.cy * scale;
  ctx.setTransform(scale, 0, 0, scale, dx, dy);
  ctx.drawImage(s.im, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const dest = outPattern.replace('{NN}', nn(i));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out.toBuffer('image/png'));
  console.log(`   ${nn(i)}  ${scale.toFixed(3)}  ${dx.toFixed(0).padStart(5)}  ${dy.toFixed(0).padStart(5)}`);
}
console.log('\n★このあと verify-pose-set.mjs で、接地点と寸法のばらつきが下がったことを確かめること');
