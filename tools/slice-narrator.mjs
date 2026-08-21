/**
 * ★ナレーターのシートを 6 枚に切り出し、**頭が動かないように**口だけ差し替える
 *
 * 【仕様】`design/hud-ds/components/narrator-cast/index.html`
 *   表情 3（通常／熱／絶叫）× 口 2（閉／開）= 6 枚
 *   ★**口パクは同一頭部で口だけ差し替え（頭が動かないこと）**
 *   枠 150×172（表示等倍）／ 2 倍で作り 300×344 を納品
 *   顔の中心を枠の (75, 68) に置く ／ 下 30px はネームプレートが重なるので顔・あごを入れない
 *
 * 【なぜ「口だけ差し替え」なのか】
 *   生成は同じ絵を 2 度描けません。閉と開をそのまま並べると**頭が数 px ずれ**、
 *   喋るたびに顔が揺れます（馬のコマで何度も踏んだのと同じ問題）。
 *   → **閉じた絵を土台にし、口の部分だけ開いた絵から貼ります。** 頭は 1 枚しか使いません。
 *
 * 実行: npx tsx tools/slice-narrator.mjs <シート.png> <出力の接頭辞>
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [sheetPath, outPrefix] = process.argv.slice(2);
if (sheetPath === undefined || outPrefix === undefined) {
  console.error('使い方: npx tsx tools/slice-narrator.mjs <シート.png> <出力の接頭辞>');
  process.exit(2);
}
const COLS = 3, ROWS = 2;
const EXPR = ['normal', 'hot', 'shout'];

const sheet = await loadImage(sheetPath);
const sc = createCanvas(sheet.width, sheet.height);
const sx = sc.getContext('2d');
sx.drawImage(sheet, 0, 0);
const sd = sx.getImageData(0, 0, sheet.width, sheet.height);

/** クロマ緑を抜く（緑の残りは despill する） */
function keyOut(data, w, h) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (g > 150 && g > r * 1.6 && g > b * 1.6) { d[i + 3] = 0; continue; }
    if (g > r && g > b) {                        // 縁の緑かぶりを抑える
      const m = Math.max(r, b);
      d[i + 1] = Math.min(g, m + (g - m) * 0.25);
    }
  }
  void w; void h;
  return data;
}
keyOut(sd, sheet.width, sheet.height);
sx.putImageData(sd, 0, 0);

const cellW = Math.floor(sheet.width / COLS), cellH = Math.floor(sheet.height / ROWS);
const cellOf = (col, row) => {
  const c = createCanvas(cellW, cellH);
  c.getContext('2d').drawImage(sc, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
  return c;
};

/** 不透明の外接矩形 */
function bounds(canvas) {
  const x = canvas.getContext('2d');
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
  let l = canvas.width, t = canvas.height, r = -1, b = -1;
  for (let y = 0; y < canvas.height; y += 1) for (let xx = 0; xx < canvas.width; xx += 1) {
    if (d[(y * canvas.width + xx) * 4 + 3] < 24) continue;
    if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > b) b = y;
  }
  return { x: l, y: t, width: r - l + 1, height: b - t + 1 };
}

console.log('  表情      閉の外接矩形         開の外接矩形         ずれ');
const out = [];
for (let col = 0; col < COLS; col += 1) {
  const closed = cellOf(col, 0), open = cellOf(col, 1);
  const bc = bounds(closed), bo = bounds(open);
  const dx = bo.x - bc.x, dy = bo.y - bc.y;
  console.log(`  ${EXPR[col].padEnd(8)}(${bc.x},${bc.y}) ${bc.width}x${bc.height}   (${bo.x},${bo.y}) ${bo.width}x${bo.height}   Δ(${dx},${dy})`);
  /**
   * ★**口を貼る前に、開いた絵を閉じた絵へ揃えます。**
   *
   * ⚠️ 生成物は列によって頭の位置が違います（実測: 実況 D は**縦に 34px**ずれていた）。
   *    揃えずに口の矩形を貼ると、★**開いた絵の「鼻やあご」を口の位置に貼る**ことになります。
   *    外接矩形の差だけ平行移動してから使います。
   */
  let aligned = open;
  if (dx !== 0 || dy !== 0) {
    const a = createCanvas(cellW, cellH);
    a.getContext('2d').drawImage(open, -dx, -dy);
    aligned = a;
  }
  out.push({ expr: EXPR[col], closed, open: aligned, bc, bo, dx, dy });
}

/**
 * ★口の位置を、閉と開の**差分**から求めます。
 *   ⚠️ 頭がずれていると差分が顔全体に散るので、**差分の広がり**で頭のずれも検出できます。
 */
console.log('\n  表情      口の矩形（差分から）        差分の面積比');
for (const o of out) {
  const a = o.closed.getContext('2d').getImageData(0, 0, cellW, cellH).data;
  const b = o.open.getContext('2d').getImageData(0, 0, cellW, cellH).data;
  /**
   * ⚠️ ★**外接矩形では口を切り出せません。** 生成物は輪郭の抗鋸歯が全体で微妙に違うので、
   *    差分の外接矩形は**顔全体（99〜100%）**になります（実測）。
   * → **密度**で見ます。粗い格子で差分の数を数え、いちばん濃い場所から広げます。
   */
  const B = 16;                                  // 格子の大きさ（px）
  const gw = Math.ceil(cellW / B), gh = Math.ceil(cellH / B);
  const grid = new Int32Array(gw * gh);
  let n = 0;
  for (let y = 0; y < cellH; y += 1) for (let xx = 0; xx < cellW; xx += 1) {
    const i = (y * cellW + xx) * 4;
    const diff = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      + Math.abs(a[i + 3] - b[i + 3]);
    if (diff < 60) continue;
    n += 1;
    grid[Math.floor(y / B) * gw + Math.floor(xx / B)] += 1;
  }
  /**
   * ⚠️ ★探す範囲を**顔の下半分**に限ります。表情差分では**目も変わる**ので、
   *    範囲を絞らないと目まで差し替わり、口を開けるたびに**目が見開く**ことになります
   *    （実際にそうなり、目視で気づきました）。
   *    仕様は「**口だけ差し替え**」なので、目は閉じた絵のものを使います。
   */
  const faceTop = o.bc.y, faceH = o.bc.height;
  const yLo = Math.floor((faceTop + faceH * 0.52) / B);
  const yHi = Math.floor((faceTop + faceH * 0.82) / B);
  let best = 0, bi = 0;
  for (let gy = yLo; gy <= yHi; gy += 1) for (let gx = 0; gx < gw; gx += 1) {
    const i = gy * gw + gx;
    if (i >= 0 && i < grid.length && grid[i] > best) { best = grid[i]; bi = i; }
  }
  // ★濃い場所の 12% 以上ある格子だけを口とみなす
  const keep = Math.max(3, Math.round(best * 0.12));
  let l = cellW, t = cellH, r = -1, bo2 = -1;
  const bx = bi % gw, by = Math.floor(bi / gw);
  for (let gy = 0; gy < gh; gy += 1) for (let gx = 0; gx < gw; gx += 1) {
    if (grid[gy * gw + gx] < keep) continue;
    // ★口から離れた孤立した格子は拾わない（顔の輪郭の抗鋸歯）
    if (gy < yLo || gy > yHi) continue;                 // ★顔の下半分だけ
    if (Math.abs(gx - bx) > 7 || Math.abs(gy - by) > 3) continue;
    l = Math.min(l, gx * B); t = Math.min(t, gy * B);
    r = Math.max(r, Math.min(cellW - 1, (gx + 1) * B - 1));
    bo2 = Math.max(bo2, Math.min(cellH - 1, (gy + 1) * B - 1));
  }
  // ★少しだけ余白を取る（境目が見えないように）
  const pad = 6;
  l = Math.max(0, l - pad); t = Math.max(0, t - pad);
  r = Math.min(cellW - 1, r + pad); bo2 = Math.min(cellH - 1, bo2 + pad);
  o.mouth = { x: l, y: t, width: r - l + 1, height: bo2 - t + 1 };
  const area = (o.mouth.width * o.mouth.height) / (o.bc.width * o.bc.height) * 100;
  console.log(`  ${o.expr.padEnd(8)}(${l},${t}) ${o.mouth.width}x${o.mouth.height}        ${area.toFixed(1)}%  差分画素 ${n.toLocaleString()}`);
}

/**
 * ★仕様の枠に収める（`narrator-cast`）
 *   枠 150×172（表示等倍）／**2 倍で作り 300×344 を納品**／実装で 0.5 倍
 *   顔の中心を枠の (75, 68) → 2 倍で **(150, 136)**
 *   ★下 30px（2 倍で 60px）はネームプレートが重なるので、**あごを入れない**
 */
const OUT_W = 300, OUT_H = 344;
const FACE_CX = 150, FACE_CY = 136;
const NAMEPLATE_H = 60;
function frame(canvas, box) {
  /**
   * ★顔の中心は、被写体の上から 28% あたり（髪の上端〜あごの中央）に置きます。
   *   ⚠️ 被写体の外接矩形は**肩まで**含むので、その中心を顔の中心と取り違えないこと。
   */
  const faceCx = box.x + box.width / 2;
  const faceCy = box.y + box.height * 0.28;
  /**
   * ★縮尺は**頭の大きさ**で決めます。
   *
   * ⚠️ ★以前は「あごが名札に入らない」条件だけで決めていました。その結果
   *    被写体（肩まで含む外接矩形）の幅 478px が **493px** に拡大され、
   *    幅 300 の枠に対して**大きすぎて肩が切れ、顔が枠いっぱい**になりました
   *    （オーナー評「顔が枠からはみ出ています」）。
   *
   * ★頭（髪の上端〜あご）は被写体の高さのおよそ 55%。
   *   枠 344 に対して**頭の高さを 190px**（＝表示 95px）にすると、
   *   胸から上が収まり、あごが名札（下 60px）に掛かりません。
   */
  const HEAD_RATIO = 0.55;      // 被写体の高さに占める頭の割合
  const HEAD_TARGET = 190;      // 枠内での頭の高さ（2 倍・px）
  const scale = HEAD_TARGET / (box.height * HEAD_RATIO);
  const c = createCanvas(OUT_W, OUT_H);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.setTransform(scale, 0, 0, scale, FACE_CX - faceCx * scale, FACE_CY - faceCy * scale);
  x.drawImage(canvas, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

mkdirSync(dirname(outPrefix), { recursive: true });
for (const o of out) {
  writeFileSync(`${outPrefix}-${o.expr}-closed.png`, frame(o.closed, o.bc).toBuffer('image/png'));
  // ★開いた口は「閉じた絵の上に、口の矩形だけを開いた絵から貼る」
  const merged = createCanvas(cellW, cellH);
  const m = merged.getContext('2d');
  m.drawImage(o.closed, 0, 0);
  m.clearRect(o.mouth.x, o.mouth.y, o.mouth.width, o.mouth.height);
  m.drawImage(o.open, o.mouth.x, o.mouth.y, o.mouth.width, o.mouth.height,
    o.mouth.x, o.mouth.y, o.mouth.width, o.mouth.height);
  writeFileSync(`${outPrefix}-${o.expr}-open.png`, frame(merged, o.bc).toBuffer('image/png'));
}
console.log(`\n  ${outPrefix}-<${EXPR.join('|')}>-<closed|open>.png  を書き出しました`);
