/**
 * ★8 コマのシートを切り出し、同時に胴体基準で揃える
 *
 * 【なぜシートから作るのか（2026-08-20）】
 *   1 コマずつ生成すると、**カメラ角度と体型がコマごとに流れます**。
 *   個別生成した俯瞰セットは、1 枚ずつは合格でしたが、動かすとガクガクして走って見えませんでした
 *   （オーナー確認）。**8 コマを 1 枚の絵に入れると、カメラも馬も揃わざるを得ません。**
 *
 * 【この道具がやること】
 *   ① 4 列 × 2 行のセルに分ける
 *   ② 各セルの被写体（キー色でない画素）の外接矩形を求める
 *   ③ ★**上半身の重心**を基準に、全コマを同じ位置・同じ倍率に揃えて焼き直す
 *      （外接矩形は脚の伸縮で正しく変動するので、基準にできない）
 *   ④ 出力は全コマ同じ画布・同じ寸法（描画側が元画像 px で配置するため）
 *
 * 実行:
 *   node tools/slice-pose-sheet.mjs <シート.png> <出力の接頭辞> [--cols 4] [--rows 2]
 *   例) node tools/slice-pose-sheet.mjs out/gen/high-diag-sheet-v1.png out/gen/hd/high-diag-v4
 *       → out/gen/hd/high-diag-v4-pose01..08.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const argv = process.argv.slice(2);
const [sheetPath, outPrefix] = argv;
if (sheetPath === undefined || outPrefix === undefined) {
  console.error('使い方: node tools/slice-pose-sheet.mjs <シート.png> <出力の接頭辞> [--cols 4] [--rows 2]');
  process.exit(2);
}
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const COLS = num('--cols', 4), ROWS = num('--rows', 2);
const FRAMES = COLS * ROWS;

const sheet = await loadImage(sheetPath);
const sc = createCanvas(sheet.width, sheet.height);
const sctx = sc.getContext('2d');
sctx.drawImage(sheet, 0, 0);
const sd = sctx.getImageData(0, 0, sheet.width, sheet.height).data;
const isBg = (i) => sd[i + 3] < 16 || (sd[i + 1] > 190 && sd[i] < 120 && sd[i + 2] < 120);

const cellW = Math.floor(sheet.width / COLS), cellH = Math.floor(sheet.height / ROWS);
console.log(`シート ${sheet.width}x${sheet.height} → セル ${cellW}x${cellH}（${COLS}列 × ${ROWS}行）\n`);

/** 各セルの被写体を測る */
const cells = [];
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    const x0 = c * cellW, y0 = r * cellH;
    let top = cellH, bottom = -1, left = cellW, right = -1, area = 0;
    let sx = 0, sy = 0, n = 0;
    // 先に外接矩形
    for (let y = 0; y < cellH; y += 1) {
      for (let x = 0; x < cellW; x += 1) {
        if (isBg(((y0 + y) * sheet.width + (x0 + x)) * 4)) continue;
        area += 1;
        if (y < top) top = y; if (y > bottom) bottom = y;
        if (x < left) left = x; if (x > right) right = x;
      }
    }
    if (area === 0) { console.error(`★セル ${cells.length + 1} が空です`); process.exit(1); }
    // ★上半身（胴と騎手）だけで重心を取る。脚の開閉に引っ張られないように
    const half = top + (bottom - top) * 0.5;
    for (let y = top; y <= half; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (isBg(((y0 + y) * sheet.width + (x0 + x)) * 4)) continue;
        sx += x; sy += y; n += 1;
      }
    }
    cells.push({ x0, y0, top, bottom, left, right, area, cx: sx / n, cy: sy / n });
  }
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const refArea = med(cells.map((c) => c.area));

// 出力の画布は、最も大きいコマが収まる大きさに揃える（余白を持たせる）
const maxW = Math.max(...cells.map((c) => c.right - c.left)) * 1.35;
const maxH = Math.max(...cells.map((c) => c.bottom - c.top)) * 1.35;
const OUT_W = Math.ceil(maxW / 2) * 2, OUT_H = Math.ceil(maxH / 2) * 2;
// 基準点は画布の中央やや上（胴体が中央に来るように）
const anchorX = OUT_W / 2, anchorY = OUT_H * 0.42;

console.log('  コマ  倍率   被写体');
for (let i = 0; i < FRAMES; i += 1) {
  const c = cells[i];
  const scale = Math.sqrt(refArea / c.area);
  const out = createCanvas(OUT_W, OUT_H);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // セルを切り出しつつ、上半身の重心が anchor に来るように拡大縮小・平行移動
  ctx.setTransform(scale, 0, 0, scale, anchorX - c.cx * scale, anchorY - c.cy * scale);
  ctx.drawImage(sheet, c.x0, c.y0, cellW, cellH, 0, 0, cellW, cellH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const dest = `${outPrefix}-pose${String(i + 1).padStart(2, '0')}.png`;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out.toBuffer('image/png'));
  console.log(`   ${String(i + 1).padStart(2, '0')}  ${scale.toFixed(3)}  ${(c.right - c.left)}x${(c.bottom - c.top)}`);
}
console.log(`\n出力 ${OUT_W}x${OUT_H} × ${FRAMES} コマ`);
console.log('★このあと verify-pose-set.mjs で、接地点と寸法のばらつきを確かめること');
