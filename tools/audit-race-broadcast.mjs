/** Fixed-seed broadcast audit: render representative shots and measure framing. */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, withFinishRunOut, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, ovalCourse, HORSE_LENGTH_M, raceShotAt, broadcastCamera,
  broadcastEnvironmentAt,
  drawPerspectiveWorld, drawPerspectiveHorses, frameRoleOf,
  SHEET_REAR, SHEET_V2, SHEET_DIAG_FRONT_V1, SHEET_HIGH_DIAG_V1, SHEET_DIAG_REAR_V1, cameraBasis, project, posOf, shotCameraForDistance,
} from '@star/render';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const stringArg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const W = 1280, H = 720;
const DIST = arg('distance', 1600), FIELD = arg('field', 12), SEED = arg('seed', 42);
const STEP = arg('step', 0.25);
const SURFACE = stringArg('surface', 'turf'), CONDITION = stringArg('condition', 'good');
const suffix = SURFACE === 'turf' && CONDITION === 'good' ? '' : `-${SURFACE}-${CONDITION}`;
const OUT = path.resolve('out/reference-audit', DIST === 1600 && FIELD === 12 && SEED === 42 && suffix === ''
  ? 'star-seed42' : `star-seed${SEED}-${DIST}m-${FIELD}h${suffix}`);
const COURSE = ovalCourse(DIST);
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = { raceId: `audit-${SEED}-${SURFACE}-${CONDITION}`, distance: DIST, surface: SURFACE, trackCondition: CONDITION, courseShape: 'oval', baseWeightKg: 55 };
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('final order mismatch');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace,
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
  formationSeed: SEED * 2654435761,
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) throw new Error('position model mismatch');
const warp = timeWarpFor(knotsFor(boundaries, 3), DEFAULT_PHASE_RATES);
const finishSec = new Map(result.order.map((entry) => [Number(entry.horseId), entry.timeSec]));
const winnerGate = Number(result.order[0].horseId);
const TOTAL_DISPLAY = warp.displaySec + 1.2;

const images = {
  rear: await loadImage(path.resolve('apps/web/public/art/horse-rear.png')),
  side: await loadImage(path.resolve('apps/web/public/art/horse-side-v3.png')),
  diagFront: await loadImage(path.resolve('apps/web/public/art/horse-diag-front-v1.png')),
  highDiag: await loadImage(path.resolve('apps/web/public/art/horse-high-diag-v1.png')),
  diagRear: await loadImage(path.resolve('apps/web/public/art/horse-diag-rear-v1.png')),
};

function spriteFor(view) {
  if (view === 'rear') return { img: images.rear, spec: SHEET_REAR };
  if (view === 'diag-rear') return { img: images.diagRear, spec: SHEET_DIAG_REAR_V1 };
  if (view === 'diag-front') return { img: images.diagFront, spec: SHEET_DIAG_FRONT_V1 };
  if (view === 'high-diag') return { img: images.highDiag, spec: SHEET_HIGH_DIAG_V1 };
  return { img: images.side, spec: SHEET_V2 };
}

function framingAt(state) {
  const { img, spec } = spriteFor(state.shot.view);
  const basis = cameraBasis(state.cam), cw = img.width / spec.frames;
  const framedHorses = state.shot.family === 'winner' ? state.at.filter((h) => h.gate === winnerGate) : state.at;
  const boxes = framedHorses.map((h) => {
    const wp = posOf(COURSE, Math.max(0, h.meters), h.w ?? COURSE.widthM / 2);
    const p = project(state.cam, basis, { x: wp.x, y: wp.y, z: 0 });
    const height = 2.5 * p.pxPerM, width = height * (cw / spec.cellH);
    return { gate: h.gate, x0: p.x - width / 2, y0: p.y - height, x1: p.x + width / 2, y1: p.y, width, height, visible: p.depth > 2 };
  }).filter((b) => b.visible);
  const clipped = boxes.filter((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H).map((b) => b.gate);
  return { img, spec, boxes, clipped };
}

function stateAt(displaySec) {
  const sec = warp.raceSecAt(displaySec);
  const rawAt = model.at(sec);
  const at = withFinishRunOut(rawAt, (gate) => finishSec.get(gate), sec, DIST, Math.max(0, displaySec - warp.displaySec));
  const sorted = [...rawAt].sort((a, b) => b.meters - a.meters);
  const lead = sorted[0].meters;
  const shot = raceShotAt({ distanceMeter: DIST, leaderMeters: lead, displaySec, displayDurationSec: TOTAL_DISPLAY, phase: phaseOf(DIST - lead), allFinished: rawAt.every((h) => h.meters >= DIST - 1e-6) });
  const visualLead = Math.max(...at.map((h) => h.meters));
  const contenders = at.filter((h) => visualLead - h.meters <= HORSE_LENGTH_M * 2);
  const pack = at.filter((h) => visualLead - h.meters <= 40);
  const focus = shot.family === 'finish' ? at
    : shot.target === 'leader' || shot.target === 'winner' ? at.filter((h) => shot.target === 'winner' ? h.gate === winnerGate : h.meters === visualLead)
    : shot.target === 'contenders' ? contenders
      : shot.target === 'gate' ? at.filter((h) => h.meters === Math.min(...at.map((x) => x.meters))) : pack;
  const packS = focus.reduce((sum, h) => sum + h.meters, 0) / Math.max(1, focus.length);
  const packW = focus.reduce((sum, h) => sum + (h.w ?? COURSE.widthM / 2), 0) / Math.max(1, focus.length);
  const cam = broadcastCamera(COURSE, { atS: Math.max(20, shot.family === 'finish' || shot.family === 'winner' ? packS : Math.min(DIST - 5, packS)), atW: packW, width: W, height: H, view: shot.view, preset: shotCameraForDistance(shot, DIST) });
  return { sec, at, lead, shot, cam, packS };
}

// First representative frame for each family, with enough distance from a cut.
const chosen = new Map();
const representativeTimes = [];
for (let d = 0; d < TOTAL_DISPLAY; d += 0.25) representativeTimes.push(d);
representativeTimes.push(TOTAL_DISPLAY);
for (const d of representativeTimes) {
  const s = stateAt(d);
  if (!chosen.has(s.shot.family)) chosen.set(s.shot.family, d === TOTAL_DISPLAY ? d : Math.min(TOTAL_DISPLAY, d + 0.5));
}

mkdirSync(OUT, { recursive: true });
const audit = [];
const pngs = [];
for (const [family, displaySec] of chosen) {
  const { sec, at, shot, cam, packS } = stateAt(displaySec);
  const { img, spec, boxes, clipped } = framingAt({ sec, at, shot, cam, packS });
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  drawPerspectiveWorld(ctx, COURSE, cam, pal, DIST, packS, { surface: SURFACE, condition: CONDITION });
  const horsesToDraw = shot.family === 'winner' ? at.filter((h) => h.gate === winnerGate) : at;
  drawPerspectiveHorses(ctx, COURSE, cam, horsesToDraw.map((h) => ({ gate: h.gate, s: h.meters, w: h.w ?? COURSE.widthM / 2 })), {
    sheet: img, sheetWidth: img.width, spec, fieldSize: FIELD,
    frameOf: (g) => Math.floor(displaySec * 16 + g * 0.37 * spec.frames) % spec.frames,
    frameRoleOf, distanceMeter: DIST,
  });
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(12, 12, 390, 42);
  ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
  ctx.fillText(`${family} / ${shot.view} / ${displaySec.toFixed(2)}s`, 24, 40);
  const file = path.join(OUT, `${String(audit.length + 1).padStart(2, '0')}-${family}.png`);
  writeFileSync(file, cv.toBuffer('image/png')); pngs.push(file);

  const bounds = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) };
  const requiredGates = shot.family === 'winner' ? [winnerGate] : at.map((h) => h.gate);
  const visibleGates = new Set(boxes.map((b) => b.gate));
  const requiredMissing = requiredGates.filter((gate) => !visibleGates.has(gate));
  const requiredClipped = clipped.filter((gate) => requiredGates.includes(gate));
  audit.push({ family, view: shot.view, target: shot.target, environment: broadcastEnvironmentAt(COURSE, packS), displaySec, raceSec: sec, visible: boxes.length, clipped, requiredGates, requiredMissing, requiredClipped, packBounds: bounds, packWidthRatio: (bounds.x1 - bounds.x0) / W, packHeightRatio: (bounds.y1 - bounds.y0) / H, horseWidthRatio: boxes.reduce((n, b) => n + b.width, 0) / Math.max(1, boxes.length) / W });
}

const continuousFailures = [];
const familyFrames = new Map();
const continuousTimes = [];
for (let d = 0; d < TOTAL_DISPLAY; d += STEP) continuousTimes.push(d);
continuousTimes.push(TOTAL_DISPLAY);
for (const displaySec of continuousTimes) {
  const state = stateAt(displaySec);
  const framing = framingAt(state);
  const requiredGates = state.shot.family === 'winner' ? [winnerGate] : state.at.map((h) => h.gate);
  const visibleGates = new Set(framing.boxes.map((b) => b.gate));
  const requiredMissing = requiredGates.filter((gate) => !visibleGates.has(gate));
  const requiredClipped = framing.clipped.filter((gate) => requiredGates.includes(gate));
  familyFrames.set(state.shot.family, (familyFrames.get(state.shot.family) ?? 0) + 1);
  if (requiredMissing.length > 0 || requiredClipped.length > 0) {
    continuousFailures.push({ displaySec, family: state.shot.family, requiredMissing, requiredClipped,
      clippedBoxes: framing.boxes.filter((b) => requiredClipped.includes(b.gate)) });
  }
}
const continuous = { stepSec: STEP, sampledFrames: [...familyFrames.values()].reduce((a, b) => a + b, 0), familyFrames: Object.fromEntries(familyFrames), failures: continuousFailures };

const thumbs = await Promise.all(pngs.map((f) => sharp(f).resize(640, 360).png().toBuffer()));
const rows = Math.ceil(thumbs.length / 2);
await sharp({ create: { width: 1280, height: rows * 360, channels: 4, background: '#111' } })
  .composite(thumbs.map((input, i) => ({ input, left: (i % 2) * 640, top: Math.floor(i / 2) * 360 })))
  .png().toFile(path.join(OUT, 'contact-sheet.png'));
writeFileSync(path.join(OUT, 'metrics.json'), `${JSON.stringify({ seed: SEED, distance: DIST, fieldSize: FIELD, surface: SURFACE, trackCondition: CONDITION, raceDisplayDurationSec: warp.displaySec, totalDisplayDurationSec: TOTAL_DISPLAY, shots: audit, continuous }, null, 2)}\n`);
console.table(audit.map((a) => ({ family: a.family, view: a.view, environment: a.environment, at: a.displaySec.toFixed(2), visible: a.visible, requiredCut: a.requiredClipped.join(',') || '-', packW: `${(a.packWidthRatio * 100).toFixed(1)}%`, horseW: `${(a.horseWidthRatio * 100).toFixed(1)}%` })));
const failures = audit.filter((a) => a.requiredMissing.length > 0 || a.requiredClipped.length > 0);
if (failures.length > 0) throw new Error(`Framing gate failed: ${failures.map((a) => a.family).join(', ')}`);
if (continuousFailures.length > 0) throw new Error(`Continuous framing gate failed: ${continuousFailures.length} frames; first=${JSON.stringify(continuousFailures[0])}`);
console.log(`Continuous gate: ${continuous.sampledFrames} frames / ${STEP.toFixed(2)}s step / failures 0`);
console.log(OUT);
