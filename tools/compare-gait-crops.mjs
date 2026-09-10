/**
 * ★**1 頭ぶんを同じ大きさに揃えて並べる**（★2026-09-10・★裁定 R4）
 *
 * ★裁定:「★同じ型 A/B を見分けられるようにし、★**違う画角・頭数・大きさで運動の差が隠れないようにする**」。
 *
 * ★検証台（4 頭・真横・大きい）と本編（12 頭・透視投影）は、★そのまま並べると
 * ★頭数と大きさが違うので、★1 頭の運動の差が埋もれます。
 * → ★両方が ★**自分で出した描画矩形**（`__benchDiag` / `__raceDiag.boxes`）を使い、
 *   ★同じ倍率・同じ枠で切り出します。★道具が置き方の式を書き写すことはしません（★R-30）。
 *
 * ★実行:
 *   node --import tsx tools/compare-gait-crops.mjs \
 *     --out out/gait-integration-20260910/three-way \
 *     --bench tmp/bench-ref:0 --race tmp/gait2-before/side:3 --race tmp/gait2-after/side:3
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const argsOf = (k) => process.argv.reduce((acc, v, i) =>
  (process.argv[i - 1] === `--${k}` ? [...acc, v] : acc), []);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const OUT = String(arg('out', 'out/gait-crops'));
/** ★切り出す枠は、描画矩形の高さの何倍か（★脚の上下が枠から出ない大きさ） */
const BOX_H = Number(arg('boxH', 2.0));
const BOX_W = Number(arg('boxW', 2.4));
/** ★書き出す 1 枚の大きさ */
const CELL_H = Number(arg('cellH', 520));

/** ★`パス:番号` … ★検証台は lane、★本編は 馬番 */
const sources = [
  ...argsOf('bench').map((s) => ({ kind: 'bench', dir: s.split(':')[0], id: Number(s.split(':')[1]) })),
  ...argsOf('race').map((s) => ({ kind: 'race', dir: s.split(':')[0], id: Number(s.split(':')[1]) })),
];
if (sources.length < 2) { console.error('★★--bench / --race を 2 つ以上指定してください'); process.exit(1); }

const loaded = sources.map((s) => {
  const j = JSON.parse(readFileSync(`${s.dir}/frames.json`, 'utf8'));
  return { ...s, frames: j.frames, meta: j };
});

const boxOf = (src, frame) => {
  if (src.kind === 'bench') {
    const h = (frame.horses ?? []).find((x) => x.lane === src.id);
    return h === undefined ? null : { x: h.x, y: h.y, w: h.w, h: h.h, tag: `型${String(h.type).toUpperCase()}` };
  }
  const boxes = frame.marks?.boxes ?? [];
  const h = boxes.find((x) => x.gate === src.id);
  return h === undefined ? null : { x: h.x, y: h.y, w: h.w, h: h.h, tag: `${src.id}番` };
};

const n = Math.min(...loaded.map((s) => s.frames.length));
mkdirSync(`${OUT}/rows`, { recursive: true });
const report = [];
let made = 0;
for (let i = 0; i < n; i += 1) {
  const cells = [];
  let ok = true;
  for (const src of loaded) {
    const frame = src.frames[i];
    const box = boxOf(src, frame);
    if (box === null) { ok = false; break; }
    const cw = Math.round(box.h * BOX_W);
    const ch = Math.round(box.h * BOX_H);
    const cx = Math.round(box.x + box.w / 2 - cw / 2);
    const cy = Math.round(box.y + box.h / 2 - ch / 2);
    const file = `${src.dir}/plain/f${String(i).padStart(4, '0')}.jpg`;
    const img = sharp(file);
    const meta = await img.metadata();
    /** ⚠️ ★画面の外へはみ出す分は、★黒で足します（★切り詰めると倍率が変わります） */
    const left = Math.max(0, cx); const top = Math.max(0, cy);
    const right = Math.min(meta.width, cx + cw); const bottom = Math.min(meta.height, cy + ch);
    if (right <= left || bottom <= top) { ok = false; break; }
    const piece = await img.extract({
      left, top, width: right - left, height: bottom - top,
    }).toBuffer();
    const padded = await sharp({
      create: { width: cw, height: ch, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).composite([{ input: piece, left: left - cx, top: top - cy }]).png().toBuffer();
    const cellW = Math.round((CELL_H * BOX_W) / BOX_H);
    cells.push(await sharp(padded).resize(cellW, CELL_H, { fit: 'fill' }).toBuffer());
    if (i === 0) report.push({ dir: src.dir, id: src.id, tag: box.tag, boxH: box.h, cropH: ch });
  }
  if (!ok) continue;
  const cellW = Math.round((CELL_H * BOX_W) / BOX_H);
  const row = sharp({
    create: { width: cellW * cells.length, height: CELL_H, channels: 3, background: { r: 12, g: 16, b: 20 } },
  }).composite(cells.map((b, k) => ({ input: b, left: cellW * k, top: 0 })));
  await row.jpeg({ quality: 92 }).toFile(`${OUT}/rows/r${String(made).padStart(4, '0')}.jpg`);
  made += 1;
}
writeFileSync(`${OUT}/crops.json`, `${JSON.stringify({
  boxH: BOX_H, boxW: BOX_W, cellH: CELL_H, made, sources: report,
  note: '★切り出しは各画面が自分で出した描画矩形から。★枠は描画高さの倍数なので、★どの画面でも馬が同じ大きさになります',
}, null, 1)}\n`);
console.log(`★${made} 枚 → ${OUT}/rows`);
for (const r of report) console.log(`  ${r.dir} ${r.tag} 描画高さ ${r.boxH.toFixed(1)}px → 枠 ${r.cropH}px`);
