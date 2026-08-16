/**
 * ★駆歩シートを**機械で揃える**（生成物 → 製品シート）
 *
 * 【★考えを改めました】
 *   ⚠️ 生成側に「接地線 y=252・重心 x=180 を全8コマで揃えてください」と頼んでいました。
 *      ★**画像を描くモデルに、画素単位の整列を頼むのは筋が悪い**です。
 *      実測: 接地線が 3px、重心が 11px ずれました。**絵そのものは良いのに**です。
 *   → ★**絵は描いてもらい、整列はこちらで機械的にやります。**
 *
 * 【★何を基準に揃えるか】
 *   **勝負服（青）の重心**です。理由:
 *     ・胴の上にあり、脚や尾のように振れません
 *     ・既存のパイプライン（`tools/lib/dress.mjs`）が**同じ基準**を使っています
 *   ⚠️ 外接矩形の中央で揃えると、★**尾に引っぱられます**（尾は後方に流れるので）。
 *   ⚠️ 下端（接地点）で揃えると、★**宙に浮くコマが地面に貼りつきます**。
 *
 * 実行: npx tsx tools/align-gallop-sheet.mjs <入力.png> <出力.png> [--frames 8] [--cell 360x260]
 */
import sharp from 'sharp';

const argv = process.argv.slice(2);
const [inFile, outFile] = argv;
if (inFile === undefined || outFile === undefined) {
  console.error('使い方: npx tsx tools/align-gallop-sheet.mjs <入力.png> <出力.png>');
  process.exit(2);
}
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const FRAMES = num('--frames', 8);
const cellArg = (() => {
  const i = argv.indexOf('--cell');
  if (i < 0) return null;
  const m = /^(\d+)x(\d+)$/.exec(argv[i + 1] ?? '');
  return m === null ? null : { w: Number(m[1]), h: Number(m[2]) };
})();

const { data, info } = await sharp(inFile).ensureAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const cw = info.width / FRAMES;

console.log('# ★駆歩シートを機械で揃える');
console.log(`  入力 ${inFile}  ${info.width} × ${info.height}  ${FRAMES}コマ\n`);

const at = (x, y) => {
  const o = (y * info.width + x) * 4;
  return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
};

/** ★勝負服（青）か。契約の色域（色相 200〜260°・彩度 0.35 以上） */
function isSilk(p) {
  if (p.a < 200) return false;
  const mx = Math.max(p.r, p.g, p.b), mn = Math.min(p.r, p.g, p.b);
  if (mx === 0) return false;
  const sat = (mx - mn) / mx;
  if (sat < 0.35) return false;
  return p.b === mx && p.b > p.r + 30;   // ★青が最も強い
}

const frames = [];
for (let k = 0; k < FRAMES; k += 1) {
  const x0 = Math.round(k * cw), x1 = Math.round((k + 1) * cw);
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = at(x, y);
      if (p.a > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (isSilk(p)) { sx += x; sy += y; n += 1; }
    }
  }
  if (n === 0) {
    console.error(`★コマ ${k}: 勝負服（青）が見つかりません。基準にできないので止めます`);
    process.exit(1);
  }
  frames.push({
    k, x0, minX, maxX, minY, maxY,
    w: maxX - minX + 1, h: maxY - minY + 1,
    silkX: sx / n, silkY: sy / n, silkN: n,
  });
}

console.log('  コマ  外接矩形    勝負服の重心（コマ内）   画素数');
for (const f of frames) {
  console.log(`  ${String(f.k).padStart(3)}  ${String(f.w).padStart(4)}×${String(f.h).padStart(3)}`
    + `    (${(f.silkX - f.x0).toFixed(1).padStart(6)}, ${f.silkY.toFixed(1).padStart(6)})`
    + `   ${String(f.silkN).padStart(6)}`);
}

/**
 * ★セルの大きさは、**勝負服の重心から見た必要量**で決めます。
 *   ⚠️ 「いちばん大きいコマが収まる縮尺」では決めません
 *      （前回それで**尾が隣のセルに写り込みました**）。
 */
const needL = Math.max(...frames.map((f) => f.silkX - f.minX));
const needR = Math.max(...frames.map((f) => f.maxX - f.silkX));
const needU = Math.max(...frames.map((f) => f.silkY - f.minY));
const needD = Math.max(...frames.map((f) => f.maxY - f.silkY));
const M = 2;
const cell = cellArg ?? {
  w: Math.ceil(needL + needR) + M * 2,
  h: Math.ceil(needU + needD) + M * 2,
};
const anchor = { x: Math.round(needL) + M, y: Math.round(needU) + M };

console.log(`\n  ★勝負服の重心から必要な量: 左 ${needL.toFixed(0)} / 右 ${needR.toFixed(0)}`
  + ` / 上 ${needU.toFixed(0)} / 下 ${needD.toFixed(0)}px`);
console.log(`  ★セル ${cell.w} × ${cell.h}　基準点（勝負服の重心）(${anchor.x}, ${anchor.y})`);

const composites = [];
for (const f of frames) {
  const buf = await sharp(inFile)
    .extract({ left: f.minX, top: f.minY, width: f.w, height: f.h })
    .png().toBuffer();
  composites.push({
    input: buf,
    left: f.k * cell.w + anchor.x - Math.round(f.silkX - f.minX),
    top: anchor.y - Math.round(f.silkY - f.minY),
  });
}
await sharp({
  create: {
    width: cell.w * FRAMES, height: cell.h, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite(composites).png().toFile(outFile);

console.log(`\n★${outFile}（${cell.w * FRAMES} × ${cell.h}）`);
console.log('⚠️ ★揃ったかどうかは `verify-gallop-sheet.mjs` で測ります。ここでは判定しません。');
