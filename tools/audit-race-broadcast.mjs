/** Fixed-seed broadcast audit: render representative shots and measure framing. */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, withFinishRunOut, timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec,
  phaseOf, ovalCourse, HORSE_LENGTH_M, raceShotAt, broadcastCamera,
  broadcastEnvironmentAt,
  drawPerspectiveWorld, drawPerspectiveHorses, frameRoleOf,
  drawGauge, drawStandings, drawCallBand, drawResultPanel, raceHudVisibilityAt,
  SHEET_REAR, SHEET_V2, SHEET_DIAG_FRONT_V1, SHEET_HIGH_DIAG_V1, SHEET_DIAG_REAR_V1, cameraBasis, project, posOf, shotCameraForDistance,
  focusForRaceShot,
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
const TURN = stringArg('turn', 'left');
const trackSuffix = SURFACE === 'turf' && CONDITION === 'good' ? '' : `-${SURFACE}-${CONDITION}`;
const suffix = `${trackSuffix}${TURN === 'left' ? '' : `-${TURN}`}`;
const OUT = path.resolve('out/reference-audit', DIST === 1600 && FIELD === 12 && SEED === 42 && suffix === ''
  ? 'star-seed42' : `star-seed${SEED}-${DIST}m-${FIELD}h${suffix}`);
const COURSE = ovalCourse(DIST, { turn: TURN });
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
const warp = timeWarpFor(knotsFor(boundaries, 3, model.straightMeters), ratesForTarget(knotsFor(boundaries, 3, model.straightMeters), targetDisplaySec(DIST)));
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
  const focus = focusForRaceShot(shot, {
    all: at, pack, contenders,
    leader: at.filter((h) => h.meters === visualLead),
    winner: at.filter((h) => h.gate === winnerGate),
  });
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
    trackEffect: { surface: SURFACE, condition: CONDITION, color: pal[SURFACE === 'dirt'
      ? (CONDITION === 'good' || CONDITION === 'yielding' ? 'dirt-0' : 'dirt-1') : 'turf-5'] ?? '#6d5236' },
  });
  const allFinished = model.at(sec).every((h) => h.meters >= DIST - 1e-6);
  const hud = raceHudVisibilityAt(displaySec, warp.displaySec, allFinished);
  const vp = { width: W, height: H };
  const font = (px, bold) => `${bold ? 'bold ' : ''}${px}px sans-serif`;
  const rank = [...at].sort((a, b) => {
    if (allFinished) return result.order.findIndex((e) => Number(e.horseId) === a.gate)
      - result.order.findIndex((e) => Number(e.horseId) === b.gate);
    return b.meters - a.meters;
  });
  if (hud.gauge) drawGauge(ctx, pal, vp, font, '3番（自分の馬）', 68, 100, 0.014);
  if (hud.standings) drawStandings(ctx, pal, vp, font, rank.map((h, i) => ({
    gate: h.gate,
    lengths: i === 0 ? 0 : ((rank[0]?.meters ?? h.meters) - h.meters) / HORSE_LENGTH_M,
    isOwn: h.gate === 3,
  })), FIELD, frameRoleOf);
  if (hud.calls) drawCallBand(ctx, pal, vp, font, [
    [{ text: '3番', role: frameRoleOf(3, FIELD) }, { text: ' は前との差を詰めています' }],
  ]);
  if (hud.result) drawResultPanel(ctx, pal, vp, font, result.order.slice(0, 5).map((e, i) => ({
    place: i + 1, gate: Number(e.horseId), margin: e.marginLabel,
  })), FIELD, frameRoleOf);
  const hudRects = [
    ...(hud.gauge ? [{ name: 'gauge', x0: 32, y0: H - 96, x1: 391, y1: H - 36 }] : []),
    ...(hud.standings ? [{ name: 'standings', x0: W - 200, y0: 6, x1: W - 10, y1: 132 }] : []),
    // 代表実況の実幅に余白を加えた保守的な矩形。背景は drawCallBand で文章幅に追従する。
    ...(hud.calls ? [{ name: 'calls', x0: 32, y0: H - 177, x1: 400, y1: H - 98 }] : []),
    ...(hud.result ? [{ name: 'result', x0: W - 378, y0: 120, x1: W - 48, y1: 294 }] : []),
  ];
  const hudOccluded = hudRects.flatMap((r) => boxes
    .filter((b) => b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0)
    .map((b) => `${r.name}:${b.gate}`));
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
  audit.push({ family, view: shot.view, target: shot.target, environment: broadcastEnvironmentAt(COURSE, packS), hud, hudOccluded, displaySec, raceSec: sec, visible: boxes.length, clipped, requiredGates, requiredMissing, requiredClipped, packBounds: bounds, packWidthRatio: (bounds.x1 - bounds.x0) / W, packHeightRatio: (bounds.y1 - bounds.y0) / H, horseWidthRatio: boxes.reduce((n, b) => n + b.width, 0) / Math.max(1, boxes.length) / W });
}

const continuousFailures = [];
const familyFrames = new Map();
const motion = { launchMaxStepPx: 0, maxSameShotStepPx: 0, maxSameShotScaleRatio: 1, worstSameShot: null, transitions: [], failures: [] };
let previousMotion = null;
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
  const anchors = new Map(framing.boxes.map((b) => [b.gate, { x: (b.x0 + b.x1) / 2, y: b.y1, height: b.height }]));
  if (previousMotion !== null) {
    let maxStepPx = 0, maxScaleRatio = 1, worstGate = null;
    for (const [gate, anchor] of anchors) {
      const before = previousMotion.anchors.get(gate);
      if (!before) continue;
      const stepPx = Math.hypot(anchor.x - before.x, anchor.y - before.y);
      const scaleRatio = Math.max(anchor.height / Math.max(1e-9, before.height), before.height / Math.max(1e-9, anchor.height));
      if (stepPx > maxStepPx) { maxStepPx = stepPx; worstGate = gate; }
      maxScaleRatio = Math.max(maxScaleRatio, scaleRatio);
    }
    if (state.shot.family === previousMotion.family) {
      if (displaySec <= 1) motion.launchMaxStepPx = Math.max(motion.launchMaxStepPx, maxStepPx);
      else if (maxStepPx > motion.maxSameShotStepPx) {
        motion.maxSameShotStepPx = maxStepPx;
        motion.worstSameShot = { displaySec, family: state.shot.family, gate: worstGate, stepPx: maxStepPx };
      }
      if (displaySec > 1) motion.maxSameShotScaleRatio = Math.max(motion.maxSameShotScaleRatio, maxScaleRatio);
      if (displaySec > 1 && (maxStepPx > 80 || maxScaleRatio > 1.25)) {
        motion.failures.push({ displaySec, family: state.shot.family, gate: worstGate, stepPx: maxStepPx, maxScaleRatio,
          before: previousMotion.anchors.get(worstGate), after: anchors.get(worstGate),
          beforeRace: previousMotion.positions.get(worstGate),
          afterRace: state.at.find((h) => h.gate === worstGate),
        });
      }
    } else {
      motion.transitions.push({ displaySec, from: previousMotion.family, to: state.shot.family, transition: state.shot.transition, maxStepPx, maxScaleRatio });
    }
  }
  previousMotion = { family: state.shot.family, anchors,
    positions: new Map(state.at.map((h) => [h.gate, { meters: h.meters, w: h.w }])) };
  if (requiredMissing.length > 0 || requiredClipped.length > 0) {
    continuousFailures.push({ displaySec, family: state.shot.family, requiredMissing, requiredClipped,
      clippedBoxes: framing.boxes.filter((b) => requiredClipped.includes(b.gate)) });
  }
}
const continuous = { stepSec: STEP, sampledFrames: [...familyFrames.values()].reduce((a, b) => a + b, 0), familyFrames: Object.fromEntries(familyFrames), failures: continuousFailures, motion };

const thumbs = await Promise.all(pngs.map((f) => sharp(f).resize(640, 360).png().toBuffer()));
const rows = Math.ceil(thumbs.length / 2);
await sharp({ create: { width: 1280, height: rows * 360, channels: 4, background: '#111' } })
  .composite(thumbs.map((input, i) => ({ input, left: (i % 2) * 640, top: Math.floor(i / 2) * 360 })))
  .png().toFile(path.join(OUT, 'contact-sheet.png'));
writeFileSync(path.join(OUT, 'metrics.json'), `${JSON.stringify({ seed: SEED, distance: DIST, fieldSize: FIELD, surface: SURFACE, trackCondition: CONDITION, turn: TURN, raceDisplayDurationSec: warp.displaySec, totalDisplayDurationSec: TOTAL_DISPLAY, shots: audit, continuous }, null, 2)}\n`);
console.table(audit.map((a) => ({ family: a.family, view: a.view, environment: a.environment, at: a.displaySec.toFixed(2), visible: a.visible, requiredCut: a.requiredClipped.join(',') || '-', hudCover: a.hudOccluded.join(',') || '-', packW: `${(a.packWidthRatio * 100).toFixed(1)}%`, horseW: `${(a.horseWidthRatio * 100).toFixed(1)}%` })));
const failures = audit.filter((a) => a.requiredMissing.length > 0 || a.requiredClipped.length > 0);
const hudFailures = audit.filter((a) => a.hudOccluded.length > 0);
if (failures.length > 0) throw new Error(`Framing gate failed: ${failures.map((a) => a.family).join(', ')}`);
if (hudFailures.length > 0) throw new Error(`HUD occlusion gate failed: ${hudFailures.map((a) => `${a.family}[${a.hudOccluded.join(',')}]`).join('; ')}`);
if (continuousFailures.length > 0) throw new Error(`Continuous framing gate failed: ${continuousFailures.length} frames; first=${JSON.stringify(continuousFailures[0])}`);
if (motion.failures.length > 0) throw new Error(`Motion gate failed: ${motion.failures.length}; first=${JSON.stringify(motion.failures[0])}`);
console.log(`Continuous gate: ${continuous.sampledFrames} frames / ${STEP.toFixed(2)}s step / failures 0`);
console.log(`Motion: launch ${motion.launchMaxStepPx.toFixed(1)}px / same-shot max ${motion.maxSameShotStepPx.toFixed(1)}px / scale x${motion.maxSameShotScaleRatio.toFixed(3)} / failures 0`);
console.log(OUT);
