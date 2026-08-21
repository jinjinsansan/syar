/**
 * ★ゲート待機と開扉の瞬間を、**本番と同じ描画で**静止画にする
 *
 * 【なぜ要るか（2026-08-21）】
 *   ゲート周りは `audit-broadcast-v2.mjs` が描きません（発馬機の看板を渡していない）。
 *   そのため★**ゲートの絵を誰も見ないまま**、素材の縦横比が 1.65 倍狂っている状態が残り、
 *   オーナー評「**ゲートに馬や騎手がなく足しかない**」になりました。
 *
 *   ⚠️ 「たぶんこう」で直すと外します。**描いたものを自分で見ます。**
 *
 * 実行: npx tsx tools/shot-gate.mjs
 * 出力: out/gate/01-closed.png（待機）/ 02-open.png（開扉直後）
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { laneAt } from '@star/race-engine';
import {
  drawBroadcastV2Scene, frameRoleOf, ovalCourse, resolveBroadcastV2Scene,
} from '@star/render';

const W = 1280, H = 720, FIELD = 12, DIST = 1600;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/gate');
mkdirSync(OUT, { recursive: true });
const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/** ★透明余白を除いた矩形。描画側（`opaqueBounds`）と同じ考え方 */
async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 12) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left
    ? { x: 0, y: 0, width: info.width, height: info.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** ★`audit-broadcast-v2.mjs` と同じ形（`sheet` / `spec` / `frameImages`）で返すこと */
async function library(prefix) {
  const files = Array.from({ length: 8 }, (_, i) => path.join(ART, `${prefix}${String(i + 1).padStart(2, '0')}.png`));
  const measured = await Promise.all(files.map(async (file) => ({
    image: await loadImage(file), source: await alphaBounds(file),
  })));
  const referenceHeight = Math.max(...measured.map((frame) => frame.source.height));
  const frames = measured.map((frame) => ({ ...frame, referenceHeight }));
  return {
    sheet: frames[0].image, sheetWidth: frames[0].source.width,
    spec: { frames: 1, cellH: referenceHeight, anchorXRatio: 0.5, anchorYRatio: 1 },
    frameImages: frames,
  };
}

/** ★Web 画面と同じ素材を読むこと。ここが古いと、見ている画が別物になります */
const libraries = {
  'side-v6': await library('horse-jockey-side-v7-pose'),
  'diag-front-v2': await library('horse-jockey-diag-front-v3-pose'),
  'diag-rear-v2': await library('horse-jockey-diag-rear-v5-pose'),
  'high-diag-v2': await library('horse-jockey-high-diag-v4-pose'),
};

const closedFile = path.join(ART, 'starting-gate-front-v1.png');
const openFile = path.join(ART, 'starting-gate-front-open-v1.png');
const gate = {
  closed: await loadImage(closedFile), open: await loadImage(openFile),
  closedSource: await alphaBounds(closedFile), openSource: await alphaBounds(openFile),
};

/** ★発走直後の馬。位置は 0m 付近、内外はエンジンの `laneAt` から（描画側で並べ直さない） */
const horsesAt = (meters) => Array.from({ length: FIELD }, (_, i) => ({
  gate: i + 1, s: meters, w: laneAt(i + 1, FIELD, DIST - meters, DIST, 42),
  staminaRatio: 1,
}));

for (const [index, view] of [
  { label: 'ゲート待機（扉閉）', meters: 0, closed: true },
  { label: '開扉直後（扉開）', meters: 14, closed: false },
].entries()) {
  const horses = horsesAt(view.meters);
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H });
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const image = view.closed ? gate.closed : gate.open;
  drawBroadcastV2Scene(ctx, course, scene, {
    palette, libraries, fieldSize: FIELD,
    frameOf: (g) => (index * 2 + g * 3) % 8,
    frameRoleOf, surface: 'turf', condition: 'good', kickupColor: '#738b43',
    worldBillboards: [{
      image, width: image.width, height: image.height,
      source: view.closed ? gate.closedSource : gate.openSource,
      worldS: 1.6, worldW: 0.5, widthM: 14.8,
      zOrder: view.closed ? 'front' : 'behind',
    }],
  });
  ctx.fillStyle = 'rgba(5,10,8,0.84)'; ctx.fillRect(18, 18, 520, 58);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${view.label} / ${scene.shot.id}`, 34, 55);
  const file = path.join(OUT, `${String(index + 1).padStart(2, '0')}-${view.closed ? 'closed' : 'open'}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`書き出し ${file}`);
}
