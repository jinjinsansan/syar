/**
 * ★参考映像の**静止画**から、構図の数字を取る
 *
 * 【なぜ要るか】
 *   ★こちらは「レースがレースに見える」を何度も外しました。
 *   ★**目測でなく数字にします。** 特に知りたいのは:
 *     ① ★**馬は画面の何%の幅で描かれているか**（こちらは大きすぎる疑い）
 *     ② ★**走路の帯は画面の何%か**（＝俯角の手がかり）
 *     ③ 実況帯・情報表示が画面の何%を占めるか
 *
 * 【★憲法】競馬中継の**画角・尺・構図は業界共通の作法**（D-060）。
 *   ⚠️ この道具は**幾何と割合だけ**を数字にします。★**絵も文字も写しません。**
 *
 * 使い方: node tools/measure-race-still.mjs <画像...> 
 */
import sharp from 'sharp';
import path from 'node:path';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) { console.error('使い方: node tools/measure-race-still.mjs <画像...>'); process.exit(2); }

/** 行が「黒帯」か（スマホの余白・タイトル） */
const isDarkRow = (row) => row < 0.10;

for (const f of files) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const lum = new Float64Array(H);
  const green = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let l = 0, g = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      l += (r + gg + b) / 3;
      if (gg > r + 10 && gg > b + 10) g++;
    }
    lum[y] = l / W / 255;
    green[y] = g / W;
  }
  /** ★ゲーム画面 = 黒帯に挟まれた、いちばん厚い明るい帯 */
  let best = [0, -1], cur = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && !isDarkRow(lum[y]);
    if (on && cur < 0) cur = y;
    if (!on && cur >= 0) { if (y - cur > best[1] - best[0]) best = [cur, y - 1]; cur = -1; }
  }
  const [gy0, gy1] = best;
  const GH = gy1 - gy0 + 1;

  /** ★走路（緑）の帯 */
  let tBest = [0, -1], tCur = -1;
  for (let y = gy0; y <= gy1 + 1; y++) {
    const on = y <= gy1 && green[y] > 0.35;
    if (on && tCur < 0) tCur = y;
    if (!on && tCur >= 0) { if (y - tCur > tBest[1] - tBest[0]) tBest = [tCur, y - 1]; tCur = -1; }
  }
  const turf = tBest[1] - tBest[0] + 1;

  /**
   * ★**馬らしい塊**を数える。
   *   走路の帯の中で「緑でない」画素の連結成分を、横幅で拾います。
   *   ⚠️ 影・ラチ・標識も拾うので、★**幅と高さの比で絞り込みます**（横長すぎるものは捨てる）。
   */
  const y0 = tBest[0], y1 = tBest[1];
  const mask = new Uint8Array(W * (y1 - y0 + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      const isGreen = gg > r + 10 && gg > b + 10;
      mask[(y - y0) * W + x] = isGreen ? 0 : 1;
    }
  }
  const MH = y1 - y0 + 1;
  const seen = new Uint8Array(mask.length);
  const blobs = [];
  const stack = new Int32Array(mask.length);
  for (let i0 = 0; i0 < mask.length; i0++) {
    if (seen[i0] || !mask[i0]) continue;
    let sp = 0; stack[sp++] = i0; seen[i0] = 1;
    let x0 = i0 % W, x1b = x0, ya = (i0 / W) | 0, yb = ya, n = 0;
    while (sp > 0) {
      const i = stack[--sp]; const cx = i % W, cy = (i / W) | 0; n++;
      if (cx < x0) x0 = cx; if (cx > x1b) x1b = cx;
      if (cy < ya) ya = cy; if (cy > yb) yb = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= MH) continue;
        const ni = ny * W + nx;
        if (seen[ni] || !mask[ni]) continue;
        seen[ni] = 1; stack[sp++] = ni;
      }
    }
    const bw = x1b - x0 + 1, bh = yb - ya + 1;
    // ★馬らしい形だけ: 面積が一定以上・横長すぎない・縦長すぎない
    if (n > (W * MH) / 2500 && bw / bh > 0.7 && bw / bh < 3.2 && bw < W * 0.25) {
      blobs.push({ bw, bh, n });
    }
  }
  blobs.sort((a, b) => b.n - a.n);
  const widths = blobs.slice(0, 14).map((b) => b.bw);
  const med = widths.length ? widths.sort((a, b) => a - b)[widths.length >> 1] : 0;

  console.log(`★${path.basename(f)}  （元 ${W}×${H}）`);
  console.log(`  ゲーム画面   y ${gy0} 〜 ${gy1}（高さ ${GH} = 元の ${(GH / H * 100).toFixed(0)}%）`);
  console.log(`  ★走路の帯   高さ ${turf} = ★**ゲーム画面の ${(turf / GH * 100).toFixed(0)}%**  （厚いほど俯角が深い）`);
  console.log(`  ★馬らしい塊 ${blobs.length} 個　中央の幅 ${med}px = ★**画面幅の ${(med / W * 100).toFixed(1)}%**`);
  console.log('');
}
console.log('⚠️ この道具は幾何と割合だけを数字にします。絵も文字も写しません。');
