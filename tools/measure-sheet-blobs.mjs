/**
 * ★スプライトシートの「本当のコマ位置」を測る
 *
 * 【なぜ要るか】
 *   ⚠️ **「幅 ÷ 6」で切っていました。シートは等間隔ではありません。**
 *      1頭目の頭が2枚目のセルに入り、画面に**宙に浮いた頭と蹄**が出ていました。
 *   ★思い込みではなく、**緑を抜いた残りの塊**を数えて位置を決めます。
 *
 * 実行: npx tsx tools/measure-sheet-blobs.mjs [シート.png]
 */
import sharp from 'sharp';

const SHEET = process.argv[2] ?? 'design/art/assets/horse-gallop-cloth2-sheet.png';
const { data, info } = await sharp(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

/** 緑（クロマキー）でない画素 */
const solid = new Uint8Array(W * H);
for (let p = 0; p < W * H; p += 1) {
  const o = p * C;
  const isGreen = data[o] < 120 && data[o + 1] > 180 && data[o + 2] < 120;
  solid[p] = (!isGreen && data[o + 3] > 128) ? 1 : 0;
}

/**
 * ★**連結成分**で数えます。
 *   ⚠️ 最初は「中身のある列」で区切りました。**尾と次のコマの頭が近く、1・2枚目が繋がりました**
 *      （6コマのはずが5つに見えた）。★区切りは隙間ではなく**繋がり**で決めます。
 */
const label = new Int32Array(W * H).fill(-1);
const blobs = [];
const stack = [];
for (let p0 = 0; p0 < W * H; p0 += 1) {
  if (!solid[p0] || label[p0] >= 0) continue;
  const id = blobs.length;
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
  stack.length = 0; stack.push(p0); label[p0] = id;
  while (stack.length > 0) {
    const q = stack.pop();
    const qy = (q / W) | 0, qx = q % W;
    n += 1;
    if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
    if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = qx + dx, ny = qy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nq = ny * W + nx;
      if (solid[nq] && label[nq] < 0) { label[nq] = id; stack.push(nq); }
    }
  }
  blobs.push({ x0, x1, y0, y1, n });
}
// ★大きい塊だけ（尾の先などの離れ小島は捨てる）
const big = blobs.filter((b) => b.n >= 2000).sort((a2, b2) => a2.x0 - b2.x0);
const merged = big.map((b) => [b.x0, b.x1]);

console.log(`# ★シートの実測: ${SHEET}`);
console.log(`  寸法 ${W}×${H} / 「幅÷6」なら 1コマ ${(W / 6).toFixed(1)}px`);
console.log('');
console.log('  実際のコマ（列に中身がある区間）');
for (let i = 0; i < big.length; i += 1) {
  const b = big[i];
  const clipped = (b.x0 <= 1 || b.x1 >= W - 2) ? '  ★端で切れている可能性' : '';
  console.log(`    ${i}: x ${String(b.x0).padStart(4)}〜${String(b.x1).padStart(4)} (幅 ${String(b.x1 - b.x0 + 1).padStart(3)}) / y ${b.y0}〜${b.y1} (高さ ${b.y1 - b.y0 + 1}) / 画素 ${b.n}${clipped}`);
}
console.log('');
console.log(`  ★コマ数: ${big.length}`);
const widths = merged.map(([a, b]) => b - a + 1);
console.log(`  幅のばらつき: ${Math.min(...widths)} 〜 ${Math.max(...widths)}px`);
console.log('  ⚠️ 幅が揃っていないので、**等分割は必ずコマを跨ぎます**。');
