/** Broadcast V2 static audit: same world/camera/horse renderer as the Web route. */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  cameraBasis, drawBroadcastV2Scene, finalOrderOf, frameRoleOf, knotsFor, ovalCourse,
  posOf, project, replayPositionModel, resolveBroadcastV2Scene, segmentStarts,
  timeWarpFor, withFinishRunOut, DEFAULT_PHASE_RATES,
} from '@star/render';

const W = 1280, H = 720, FIELD = 12, DIST = 1600;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/broadcast-v2-audit');
const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 12) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left
    ? { x: 0, y: 0, width: info.width, height: info.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

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

const libraries = {
  'side-v6': await library('horse-jockey-side-v6-pose'),
  'diag-front-v2': await library('horse-jockey-diag-front-v2-pose'),
  'diag-rear-v2': await library('horse-jockey-diag-rear-v2-pose'),
  'high-diag-v2': await library('horse-jockey-high-diag-v2-pose'),
  'winner-v1': await (async () => {
    const file = path.join(ART, 'horse-jockey-winner-v1.png');
    const image = await loadImage(file), source = await alphaBounds(file);
    const frame = { image, source, referenceHeight: source.height };
    return {
      sheet: image, sheetWidth: source.width,
      spec: { frames: 1, cellH: source.height, anchorXRatio: 0.5, anchorYRatio: 1 },
      frameImages: [frame],
    };
  })(),
};
const plates = {
  backstretch: await loadImage(path.join(ART, 'race-backstretch-side-v1.png')),
  homestretch: await loadImage(path.join(ART, 'race-corner-exit-side-v1.png')),
  finish: await loadImage(path.join(ART, 'race-finish-side-v2.png')),
  cornerRear: await loadImage(path.join(ART, 'race-corner-rear-v2.png')),
  cornerHigh: await loadImage(path.join(ART, 'race-corner-high-v2.png')),
};
console.log('assets loaded');

const starts = segmentStarts(course);
const points = starts.map((segment, index) => {
  const end = starts[index + 1]?.s ?? DIST;
  return {
    label: segment.label,
    s: Math.min(DIST - 100, segment.s + Math.max(8, (end - segment.s) * 0.45)),
  };
});
points.push({ label: 'ゴール前', s: DIST - 45 });
const deduped = points.filter((point, index) => points.findIndex((other) => other.label === point.label) === index);
mkdirSync(OUT, { recursive: true });
const files = [];

for (let index = 0; index < deduped.length; index += 1) {
  const point = deduped[index];
  console.log(`render ${index + 1}: ${point.label} s=${point.s.toFixed(1)}`);
  const horses = Array.from({ length: FIELD }, (_, i) => ({
    gate: i + 1,
    s: point.s - Math.floor(i / 3) * 3.2 - (i % 3) * 0.7,
    w: 2.4 + (i % 4) * 3.4,
  }));
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H });
  const plate = scene.shot.id === 'finish-line' || scene.shot.id === 'winner-follow' ? plates.finish
    : scene.shot.id === 'homestretch-side' ? plates.homestretch
      : scene.shot.id === 'third-corner-rear' ? plates.cornerRear
        : scene.shot.id === 'first-corner-front' || scene.shot.id === 'second-corner-high'
          || scene.shot.id === 'fourth-corner-high' ? plates.cornerHigh
          : plates.backstretch;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  drawBroadcastV2Scene(ctx, course, scene, {
    palette, libraries, fieldSize: FIELD,
    frameOf: (gate) => (index * 2 + gate * 3) % 8,
    frameRoleOf, surface: 'turf', condition: 'good', kickupColor: '#738b43',
    backgroundPlate: plate === undefined ? undefined : {
      image: plate, width: plate.width, height: plate.height,
      progress: (scene.focusS % 400) / 400, zoom: 1.14,
    },
  });
  console.log(`drawn ${scene.shot.id}`);
  ctx.fillStyle = 'rgba(5,10,8,0.84)'; ctx.fillRect(18, 18, 460, 58);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${point.label} / ${scene.shot.id} / ${scene.shot.view}`, 34, 55);
  const file = path.join(OUT, `${String(index + 1).padStart(2, '0')}-${scene.shot.id}.png`);
  writeFileSync(file, canvas.toBuffer('image/png')); files.push(file);
}

const thumbs = await Promise.all(files.map((file) => sharp(file).resize(640, 360).png().toBuffer()));
const rows = Math.ceil(thumbs.length / 2);
await sharp({ create: { width: 1280, height: rows * 360, channels: 4, background: '#111' } })
  .composite(thumbs.map((input, i) => ({ input, left: (i % 2) * 640, top: Math.floor(i / 2) * 360 })))
  .png().toFile(path.join(OUT, 'contact-sheet.png'));
console.log(path.join(OUT, 'contact-sheet.png'));

/* ── Actual race timeline audit ─────────────────────────────────────────── */
const pool = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const strategies = ['nige', 'senko', 'sashi', 'oikomi'];
const seed = 42;
const poolStart = (seed * 13) % Math.max(1, pool.length - FIELD);
const entrants = pool.slice(poolStart, poolStart + FIELD).map((horse, index) => ({
  horseId: String(index + 1), stats: horse.stats, surfaceAptitude: horse.surfaceAptitude,
  distanceCenter: horse.distanceCenter, distanceRange: horse.distanceRange,
  strategyAptitude: horse.strategyAptitude, heavyAptitude: horse.heavyAptitude,
  strategy: strategies[(index + seed) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: index + 1, age: 4, skillGenes: horse.skillGenes,
}));
const conditions = {
  raceId: 'broadcast-v2-audit-42', distance: DIST, surface: 'turf', trackCondition: 'good',
  courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (gate) => entrants[gate - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('timeline: final order mismatch');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (gate) => entrants[gate - 1].strategy, pace,
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, seed),
  formationSeed: seed * 2654435761,
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((entry) => Number(entry.horseId)))) {
  throw new Error('timeline: position model mismatch');
}
const warp = timeWarpFor(knotsFor(boundaries, 3), DEFAULT_PHASE_RATES);
const finishSec = new Map(result.order.map((entry) => [Number(entry.horseId), entry.timeSec]));
const winnerGate = Number(result.order[0].horseId);
const samples = [];
const transitions = [];
const anomalies = [];
let previous = null;
const stepSec = 0.25;
const totalDisplaySec = warp.displaySec + 4;

for (let displaySec = 0; displaySec <= totalDisplaySec + 1e-9; displaySec += stepSec) {
  const raceSec = warp.raceSecAt(Math.min(displaySec, warp.displaySec));
  const raw = model.at(raceSec);
  const visual = withFinishRunOut(raw, (gate) => finishSec.get(gate), raceSec, DIST,
    Math.max(0, displaySec - warp.displaySec));
  const winnerFinished = (raw.find((horse) => horse.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
  const horses = visual.map((horse) => ({ gate: horse.gate, s: horse.meters, w: horse.w ?? course.widthM / 2 }));
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, winnerFinished);
  const basis = cameraBasis(scene.camera);
  const anchors = new Map();
  const outside = [];
  /**
   * ★注視ルール（broadcastV2LeadFrameFocusMeters）: 馬群が画面幅より広いときは先頭集団を大きく映し、
   *   後方は画面外に出る（参考映像の横追従）。よって「画面外」は**先頭**（と勝馬追従の勝馬）だけを異常とみなす。
   */
  const leaderS = Math.max(...scene.visibleHorses.map((horse) => horse.s));
  for (const horse of scene.visibleHorses) {
    const world = posOf(course, horse.s, horse.w);
    const projected = project(scene.camera, basis, { x: world.x, y: world.y, z: 0 });
    const height = 2.5 * projected.pxPerM;
    const anchor = { x: projected.x, y: projected.y, height, pxPerM: projected.pxPerM };
    anchors.set(horse.gate, anchor);
    const off = projected.depth <= 2 || projected.x < -height || projected.x > W + height
      || projected.y < height * 0.25 || projected.y > H + height * 0.2;
    if (off && horse.s >= leaderS - 1e-6) outside.push(horse.gate);
  }
  if (previous !== null) {
    if (previous.shot !== scene.shot.id) {
      transitions.push({ displaySec, from: previous.shot, to: scene.shot.id, outside });
    } else {
      let maxStepPx = 0, maxStepM = 0, maxScaleRatio = 1, worstGate = null;
      for (const [gate, anchor] of anchors) {
        const before = previous.anchors.get(gate);
        if (before === undefined) continue;
        const delta = Math.hypot(anchor.x - before.x, anchor.y - before.y);
        const ratio = Math.max(anchor.height / Math.max(1, before.height), before.height / Math.max(1, anchor.height));
        // ★画面上の移動は px/m 換算で見る（望遠では同じ相対移動が大きな px になる）。0.25 秒で 2.5m 超は不連続
        const deltaM = delta / Math.max(1e-6, anchor.pxPerM);
        if (deltaM > maxStepM) { maxStepM = deltaM; maxStepPx = delta; worstGate = gate; }
        maxScaleRatio = Math.max(maxScaleRatio, ratio);
      }
      if (maxStepM > 2.5 || maxScaleRatio > 1.28 || outside.length > 0) {
        anomalies.push({ displaySec, shot: scene.shot.id, maxStepPx, maxScaleRatio, worstGate, outside });
      }
    }
  }
  samples.push({ displaySec, raceSec, shot: scene.shot.id, focusS: scene.focusS, outside });
  previous = { shot: scene.shot.id, anchors };
}
const timeline = { seed, stepSec, totalDisplaySec, transitions, anomalies, samples };
writeFileSync(path.join(OUT, 'timeline-metrics.json'), `${JSON.stringify(timeline, null, 2)}\n`);
console.table(transitions);
console.log(`timeline samples=${samples.length} transitions=${transitions.length} anomalies=${anomalies.length}`);
if (anomalies.length > 0) console.log('first anomaly', anomalies[0]);
