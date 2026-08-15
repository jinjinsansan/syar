/**
 * ★斜め俯瞰シートを、使える形に焼く
 *
 * 【なぜ要るか】
 *   ⚠️ 生成物は**コマの幅が揃っていません**。真横のときに
 *      ★**幅 ÷ 6 で切って「首と蹄が宙に浮く」**という失敗をしました。
 *   → ★**中身のある列の連続で切り出します。**
 *
 * 【★接地点で揃える】
 *   斜め俯瞰では**接地する蹄がセルの左下**にあります（試作①で実測）。
 *   ⚠️ **下端揃え**（真横のときのやり方）では、コマごとに脚の伸び方が違うので
 *      **馬が上下に跳ねます**。★**接地点（下端 6px 帯の重心）で揃えます。**
 *
 * 実行: node tools/bake-oblique.mjs [--cell 160x120]
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';


const OUT_DIR = path.resolve('apps/web/public/art');
const REPORT_DIR = path.resolve('out/oblique');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const [CELL_W, CELL_H] = arg('cell', '160x120').split('x').map(Number);
const SRC = path.resolve(arg('src', 'design/art/assets/horse-oblique-sheet2.png'));
const ALPHA = 24;

/**
 * ★コマを切り出す。
 *
 * ⚠️ 最初は**連結成分**で数えましたが、★**隣のコマと胴が横に重なっていて 3個**になりました
 *    （真横のシートでは離れていたので通用していた方法です）。
 * → ★**中身のある列の連続**で切ります。コマとコマの間には必ず空の列があります。
 */
function splitFrames(data, w, h, frames) {
  const col = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > ALPHA) col[x]++;
  }
  const runs = [];
  let s = -1;
  for (let x = 0; x < w; x++) {
    if (col[x] > 0) { if (s < 0) s = x; } else if (s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, w - 1]);
  console.log(`  中身のある列の連続 ${runs.length} 本: ${runs.map((r) => `${r[0]}-${r[1]}`).join(' / ')}`);

  if (runs.length === frames) {
    return runs.map(([x0, x1]) => bboxIn(data, w, h, x0, x1));
  }

  /**
   * ★列でも切れないとき = **尾が隣のコマにまたがっている**。
   *
   * ⚠️ ここで「幅 ÷ 6」にそのまま逃げると、真横のときの失敗（首と蹄が宙に浮く）と同じです。
   * ⚠️ ★**「格子線の上の画素が平均の 50% 未満なら格子とみなす」という閾値も置きません。**
   *    実際に **0.51** で落ちました。**閾値を緩めれば通る**——それは
   *    「この基準を最も安易に満たす方法」であって、絵が正しく切れる保証になりません。
   *
   * → ★**境目そのものを探させます。**
   *   等分の位置の前後を探して、**いちばん中身の薄い列**をその境目にします。
   *   ★探した結果が薄くなければ、そこで止まります（数字をいじって通しません）。
   */
  const cw = w / frames;
  const search = Math.round(cw * 0.12);
  const mid = [];
  for (let i = 0; i < frames; i++) mid.push(col[Math.round(cw * (i + 0.5))] ?? 0);
  const midAvg = mid.reduce((a, b) => a + b, 0) / mid.length;

  const cuts = [0];
  for (let i = 1; i < frames; i++) {
    const centre = Math.round(cw * i);
    let best = centre;
    let bestV = Infinity;
    for (let x = Math.max(1, centre - search); x <= Math.min(w - 2, centre + search); x++) {
      if (col[x] < bestV) { bestV = col[x]; best = x; }
    }
    cuts.push(best);
  }
  cuts.push(w);
  const found = cuts.slice(1, frames).map((x, i) => `${x}(${col[x]}px, 等分から${x - Math.round(cw * (i + 1)) >= 0 ? '+' : ''}${x - Math.round(cw * (i + 1))})`);
  console.log(`  ★探した境目: ${found.join(' / ')}`);
  console.log(`     コマ中央の画素数 平均 ${midAvg.toFixed(0)}`);
  const worst = Math.max(...cuts.slice(1, frames).map((x) => col[x] ?? 0));
  if (worst > midAvg * 0.35) {
    throw new Error(`★境目が見つかりません（いちばん濃い境目で ${worst}px）。切ると絵が欠けます`);
  }
  const out = [];
  for (let i = 0; i < frames; i++) out.push(bboxIn(data, w, h, cuts[i], cuts[i + 1] - 1));
  return out;
}

/** 指定した列の範囲にある中身の外接矩形 */
function bboxIn(data, w, h, x0, x1) {
  let y0 = h, y1 = -1, n = 0, ax0 = x1, ax1 = x0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA) {
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x < ax0) ax0 = x; if (x > ax1) ax1 = x;
        n++;
      }
    }
  }
  return { x0: ax0, y0, x1: ax1, y1, n };
}

/** ★接地点 = 下端 6px 帯にある不透明画素の x 重心 */
function contactOf(data, w, box) {
  let bot = box.y0;
  for (let y = box.y1; y >= box.y0; y--) {
    let any = false;
    for (let x = box.x0; x <= box.x1; x++) if (data[(y * w + x) * 4 + 3] > ALPHA) { any = true; break; }
    if (any) { bot = y; break; }
  }
  let sx = 0, n = 0;
  for (let y = bot; y > bot - 6 && y >= box.y0; y--) {
    for (let x = box.x0; x <= box.x1; x++) if (data[(y * w + x) * 4 + 3] > ALPHA) { sx += x; n++; }
  }
  return { x: sx / n, y: bot };
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const boxes = splitFrames(data, info.width, info.height, 6);
  console.log(`★元シート ${info.width}×${info.height}　→ コマ ${boxes.length} 個`);
  if (boxes.length !== 6) {
    console.error('★6コマではありません。切り出しを確認してください:');
    for (const b of boxes) console.error(`   ${b.x0},${b.y0} - ${b.x1},${b.y1}  画素 ${b.n}`);
    process.exit(1);
  }

  const metrics = boxes.map((b, i) => {
    const c = contactOf(data, info.width, b);
    return {
      i, box: b,
      w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1,
      // 接地点をコマの左上からの相対で持つ
      cx: c.x - b.x0, cy: c.y - b.y0,
    };
  });
  console.log('\n★コマごとの寸法と接地点（切り出し前の画素）');
  for (const m of metrics) {
    console.log(`  コマ${m.i} ${String(m.w).padStart(4)}×${String(m.h).padStart(4)}`
      + `  接地点 (${m.cx.toFixed(0)}, ${m.cy})  接地点の横位置 ${(m.cx / m.w * 100).toFixed(0)}%`);
  }

  /**
   * ★焼き方: **すべてのコマを同じ縮尺で縮め、接地点をセルの同じ点に置く。**
   *   縮尺は「いちばん大きいコマがセルに収まる」ように1つだけ決めます。
   *   ⚠️ コマごとに縮尺を変えると、**走るたびに馬の大きさが変わります**。
   */
  /**
   * ⚠️ ★最初は「いちばん大きいコマがセルに収まる」縮尺にしましたが、
   *    **接地点で揃えたあとに何が要るか**を計算していませんでした。
   *    接地点はコマによって幅の 13%〜58% の位置にあるので、揃えると
   *    ★**コマによっては尾がセルからはみ出し、隣のセルに写り込みます**
   *    （実際、走路に尾だけが1本浮きました）。
   * → ★**接地点から左右・上に必要な量**を先に出し、そこから縮尺を決めます。
   */
  const needL = Math.max(...metrics.map((m) => m.cx));            // 接地点より左
  const needR = Math.max(...metrics.map((m) => m.w - m.cx));      // 接地点より右
  const needU = Math.max(...metrics.map((m) => m.cy));            // 接地点より上
  const scale = Math.min((CELL_W - 4) / (needL + needR), (CELL_H - 5) / needU);
  const ax = Math.round(needL * scale) + 2;
  const ay = CELL_H - 3;
  console.log(`  接地点から必要な量（元の画素）左 ${needL.toFixed(0)} / 右 ${needR.toFixed(0)} / 上 ${needU}`);

  const cells = [];
  for (const m of metrics) {
    const buf = await sharp(SRC)
      .extract({ left: m.box.x0, top: m.box.y0, width: m.w, height: m.h })
      .resize(Math.max(1, Math.round(m.w * scale)), Math.max(1, Math.round(m.h * scale)), { kernel: 'nearest' })
      .png().toBuffer();
    const left = Math.round(ax - m.cx * scale);
    const top = Math.round(ay - m.cy * scale);
    cells.push({ input: buf, left: m.i * CELL_W + left, top });
  }
  const outFile = path.join(OUT_DIR, 'horse-oblique.png');
  await sharp({ create: { width: CELL_W * 6, height: CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells).png().toFile(outFile);

  /* ── ★焼いたあとに測り直す（揃っているか） ── */
  const baked = await sharp(outFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cs = [];
  for (let i = 0; i < 6; i++) {
    const box = { x0: i * CELL_W, y0: 0, x1: (i + 1) * CELL_W - 1, y1: CELL_H - 1 };
    const c = contactOf(baked.data, baked.info.width, box);
    cs.push({ x: c.x - box.x0, y: c.y });
  }
  const xs = cs.map((c) => c.x), ys = cs.map((c) => c.y);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  console.log(`\n★焼き上がり ${outFile}`);
  console.log(`  セル ${CELL_W}×${CELL_H} × 6　縮尺 ${scale.toFixed(4)}`);
  console.log(`  接地点 ${cs.map((c) => `(${c.x.toFixed(0)},${c.y})`).join(' ')}`);
  console.log(`  ★接地点のばらつき  横 ${spreadX.toFixed(1)} px ／ 縦 ${spreadY.toFixed(1)} px`);
  console.log(`  ★契約に書く接地点 = (${(xs.reduce((a, b) => a + b, 0) / 6).toFixed(0)}, ${(ys.reduce((a, b) => a + b, 0) / 6).toFixed(0)})`);
  if (spreadY > 3) {
    console.error('\n★FAIL — 縦のばらつきが大きすぎます（走ると馬が跳ねます）');
    process.exit(1);
  }
  console.log('\n★PASS — 接地点が揃っています');
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
