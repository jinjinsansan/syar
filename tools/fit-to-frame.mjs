/**
 * ★**描き直した絵を 元のコマの枠に重ね合わせる**（★2026-10-02・牝馬のレースの絵）。
 *
 * 【なぜ要るか】
 *   ★Codex は 編集した絵の ★大きさと余白を変えて返す（★970×576 → 1672×941）。
 *   ★レースは ★コマごとに測った位置（★勝負服を塗る窓 `SILKS_LAYOUT_*`・足元・影）で描くので、
 *   ★騎手が 1 画素でもずれると ★勝負服の色が騎手から外れる。
 *
 * 【やること】
 *   ★元のコマと 描き直しの ★不透明な形（α）が いちばん重なる 拡大率と位置を探し（★粗く → 細かく）、
 *   ★元のコマと同じ大きさに描き直しを置く。★重なり（IoU）と ★騎手の白い画素の差 を出す。
 *
 * 実行: node tools/fit-to-frame.mjs <元のコマ.png> <描き直し.png> <出力.png>
 */
import sharp from 'sharp';

const [origPath, candPath, outPath] = process.argv.slice(2);
if (outPath === undefined) {
  console.error('使い方: node tools/fit-to-frame.mjs <元のコマ.png> <描き直し.png> <出力.png>');
  process.exit(2);
}

const orig = await sharp(origPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = orig.info.width, H = orig.info.height;
const candMeta = await sharp(candPath).metadata();

/** ★描き直しを 拡大率 s・位置 (dx, dy) で 元の枠へ置いた RGBA */
async function place(s, dx, dy) {
  const cw = Math.max(1, Math.round((candMeta.width ?? 1) * s)), ch = Math.max(1, Math.round((candMeta.height ?? 1) * s));
  const resized = await sharp(candPath).ensureAlpha().resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer();
  /** ★枠からはみ出す分は 先に切る（★sharp の composite は 枠より大きい絵を受けない） */
  const left = Math.round(dx), top = Math.round(dy);
  const cropL = Math.max(0, -left), cropT = Math.max(0, -top);
  const visW = Math.min(cw - cropL, W - Math.max(0, left)), visH = Math.min(ch - cropT, H - Math.max(0, top));
  const base = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  if (visW <= 0 || visH <= 0) return base.raw().toBuffer();
  const piece = await sharp(resized).extract({ left: cropL, top: cropT, width: visW, height: visH }).png().toBuffer();
  return base.composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).raw().toBuffer();
}

/** ★α の重なり（IoU）・★間引いて数える */
function iou(buf, step) {
  let inter = 0, uni = 0;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * 4 + 3;
    const a = orig.data[i] >= 128, b = buf[i] >= 128;
    if (a && b) inter += 1;
    if (a || b) uni += 1;
  }
  return uni === 0 ? 0 : inter / uni;
}

/** ★外接矩形から 初めの見当（★高さを合わせる） */
async function bbox(data, w, h) {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] < 128) continue;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { l, t, r, b };
}
const ob = await bbox(orig.data, W, H);
const cand = await sharp(candPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cb = await bbox(cand.data, cand.info.width, cand.info.height);
let best = { s: (ob.b - ob.t) / (cb.b - cb.t), dx: 0, dy: 0, score: -1 };
best.dx = ob.l - cb.l * best.s; best.dy = ob.t - cb.t * best.s;
best.score = iou(await place(best.s, best.dx, best.dy), 2);

/** ★粗く → 細かく（★拡大率 ±3%・位置 ±8px から 刻みを半分ずつ） */
for (const [ds, dp, step] of [[0.03, 8, 3], [0.01, 3, 2], [0.004, 1, 1]]) {
  for (const s of [best.s - ds, best.s, best.s + ds]) {
    for (const ox of [-dp, 0, dp]) for (const oy of [-dp, 0, dp]) {
      const dx = best.dx + ox + (best.s - s) * (ob.l + ob.r) / 2 / best.s * 0;
      const buf = await place(s, dx, best.dy + oy);
      const sc = iou(buf, step);
      if (sc > best.score) best = { s, dx, dy: best.dy + oy, score: sc };
    }
  }
}
const out = await place(best.s, best.dx, best.dy);
const finalIou = iou(out, 1);

/** ★騎手の白（★元で 明るく 色の薄い画素）の差 ＝ 勝負服の窓が合っているかの目安 */
let wd = 0, wn = 0;
for (let i = 0; i < W * H; i += 1) {
  const r = orig.data[i * 4], g = orig.data[i * 4 + 1], b = orig.data[i * 4 + 2], a = orig.data[i * 4 + 3];
  if (a < 200 || Math.min(r, g, b) < 190 || Math.max(r, g, b) - Math.min(r, g, b) > 30) continue;
  wn += 1;
  wd += (Math.abs(out[i * 4] - r) + Math.abs(out[i * 4 + 1] - g) + Math.abs(out[i * 4 + 2] - b)) / 3;
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outPath);
console.log(`★重ね合わせ: 拡大率 ${best.s.toFixed(4)}・位置 (${best.dx.toFixed(1)}, ${best.dy.toFixed(1)})・α の重なり ${(finalIou * 100).toFixed(1)}%・騎手の白 ${wn} 画素の差 平均 ${(wd / Math.max(1, wn)).toFixed(1)} 階調 → ${outPath}`);
