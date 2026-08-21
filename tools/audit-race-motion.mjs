/**
 * ★読むだけ。Broadcast V2 の「動き」を全編にわたって数値で監査する。
 *
 *   npx tsx tools/audit-race-motion.mjs [--seed 42] [--step 1] [--json out/race-motion.json]
 *
 * `/race` と同じレース生成（seed・出走馬・位置モデル・時間圧縮）で 1 秒ごとに:
 *   - ショット id・注視点 focusS・先頭/最後尾・馬群の広がり
 *   - 注視点の px/m と馬の画面上の高さ（2.5m × px/m）・画面高に対する割合
 *   - 画面内に入っている頭数・蹄の画面 y の範囲
 *   - 背景の流速（px/秒・注視点の層）: パララックスなら focusS の変化 × px/m、
 *     1 枚プレートなら `progress` 送りの実効値（(Δ focusS/400) × 送り幅）
 * を出す。ユーザー指摘「区間によって背景が動かない／馬が小さい」を秒単位で突き合わせるための道具。
 * ⚠️ 描画は行わない（画像を読まない）。ブラウザ反映の証明にはならない（引継ぎ書 §6.1）。
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt, TRACK_WIDTH_M,
} from '@star/race-engine';
import {
  cameraBasis, finalOrderOf, knotsFor, ovalCourse, posOf, project, replayPositionModel,
  resolveBroadcastV2Scene, timeWarpFor, withFinishRunOut, ratesForTarget, targetDisplaySec,
  RACE_INTRO_RACE_START_SEC, parallaxLayerShiftPx, HORSE_HEIGHT_M,
  broadcastV2AnchorWeight, buildVisualScroll, broadcastV2FinishStyleOf, HORSE_LENGTH_M,
} from '@star/render';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const seed = Number(opt('seed', 42));
const stepSec = Number(opt('step', 1));
const jsonOut = opt('json', null);
const W = 1280, H = 720, FIELD = 12, DIST = 1600;

// ★ページ（apps/web/src/app/race/page.tsx build()）と同じ生成
const pool = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const strategies = ['nige', 'senko', 'sashi', 'oikomi'];
const poolStart = (seed * 13) % Math.max(1, pool.length - FIELD);
const entrants = pool.slice(poolStart, poolStart + FIELD).map((horse, index) => ({
  horseId: String(index + 1), stats: horse.stats, surfaceAptitude: horse.surfaceAptitude,
  distanceCenter: horse.distanceCenter, distanceRange: horse.distanceRange,
  strategyAptitude: horse.strategyAptitude, heavyAptitude: horse.heavyAptitude,
  strategy: strategies[(index + seed) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: index + 1, age: 4, skillGenes: horse.skillGenes,
}));
const conditions = { raceId: `r${seed}-turf-good`, distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 };
const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (gate) => entrants[gate - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('final order mismatch');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (gate) => entrants[gate - 1].strategy, pace,
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, seed),
  formationSeed: seed * 2654435761,
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) throw new Error('model mismatch');
const warp = timeWarpFor(knotsFor(boundaries, 3), ratesForTarget(knotsFor(boundaries, 3), targetDisplaySec(DIST)));
const finishSec = new Map(result.order.map((entry) => [Number(entry.horseId), entry.timeSec]));
const winnerGate = Number(result.order[0].horseId);
const course = ovalCourse(DIST, { widthM: TRACK_WIDTH_M, turn: 'left' });

// ★ページと同じ: ゴール前の展開（先頭が残り 80m に達した瞬間）
let finishStyle = 'solo';
for (let sec = 0; sec <= warp.raceSecAt(warp.displaySec) + 1e-9; sec += 0.05) {
  const sortedM = model.at(sec).map((h) => h.meters).sort((a, b) => b - a);
  if (sortedM[0] >= DIST - 80) { finishStyle = broadcastV2FinishStyleOf(sortedM, HORSE_LENGTH_M); break; }
}
console.log(`finishStyle=${finishStyle}`);
// ★ページと同じ: 横視点（side）のショットはパララックス、コーナーは旧プレート（page.tsx の parallaxPlate 条件と一致させる）
const isParallax = (view) => view === 'side';
const PLATE_TRAVEL_PX = (1672 - 1672 / 1.14) * (W / (1672 / 1.14)); // 旧プレートの送り幅（画面 px）

function sample(displaySec) {
  const raceD = Math.max(0, displaySec - RACE_INTRO_RACE_START_SEC);
  const raceSec = warp.raceSecAt(Math.min(raceD, warp.displaySec));
  const raw = model.at(raceSec);
  const visual = withFinishRunOut(raw, (gate) => finishSec.get(gate), raceSec, DIST, Math.max(0, raceD - warp.displaySec));
  const winnerFinished = (raw.find((h) => h.gate === winnerGate)?.meters ?? 0) >= DIST - 1e-6;
  const horses = visual.map((h) => ({ gate: h.gate, s: h.meters, w: h.w ?? TRACK_WIDTH_M / 2, finished: h.meters >= DIST - 1e-6 }));
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, winnerFinished, {
    finishStyle, cornerCutM: 400, raceDisplaySec: displaySec - RACE_INTRO_RACE_START_SEC,
  });
  const basis = cameraBasis(scene.camera);
  const f = posOf(course, scene.focusS, scene.focusW);
  const pf = project(scene.camera, basis, { x: f.x, y: f.y, z: 0 });
  const f1 = posOf(course, scene.focusS + 1, scene.focusW);
  const pf1 = project(scene.camera, basis, { x: f1.x, y: f1.y, z: 0 });
  const heights = [];
  const feetY = [];
  let inFrame = 0;
  for (const h of scene.visibleHorses) {
    const p = posOf(course, h.s, h.w);
    const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const hp = HORSE_HEIGHT_M * q.pxPerM;
    heights.push(hp); feetY.push(q.y);
    if (q.depth > 2 && q.x > -hp * 0.3 && q.x < W + hp * 0.3 && q.y > 0 && q.y < H + hp * 0.2) inFrame++;
  }
  const ss = horses.map((h) => h.s);
  return {
    displaySec, raceSec: Number(raceSec.toFixed(2)), shot: scene.shot.id, view: scene.shot.view,
    focusS: scene.focusS, leaderS: Math.max(...ss), tailS: Math.min(...ss),
    packDepthM: pf.depth, packPxPerM: pf.pxPerM, direction: pf1.x >= pf.x ? 1 : -1,
    horseHeightPx: heights, feetY, inFrame, total: scene.visibleHorses.length,
  };
}

// ★ページと同じ見た目速度テーブル（0.05 秒刻み）
const total = RACE_INTRO_RACE_START_SEC + warp.displaySec + 5.2;
const vsSamples = [];
for (let d = 0; d <= total + 1e-9; d += 0.05) {
  const s = sample(d);
  const raceD = Math.max(0, d - RACE_INTRO_RACE_START_SEC);
  const clampedD = Math.min(raceD, warp.displaySec);
  const lo = Math.max(0, clampedD - 0.05), hi = Math.min(warp.displaySec, clampedD + 0.05);
  const rate = raceD >= warp.displaySec || hi <= lo ? 1 : (warp.raceSecAt(hi) - warp.raceSecAt(lo)) / (hi - lo);
  vsSamples.push({ displaySec: d, focusS: s.focusS, rate: rate > 0 ? rate : 1, anchorWeight: broadcastV2AnchorWeight(course, s.shot, s.focusS) });
}
const visualScroll = buildVisualScroll(vsSamples);

const rows = [];
let prev = null;
for (let d = RACE_INTRO_RACE_START_SEC; d <= total + 1e-9; d += stepSec) {
  const s = sample(d);
  s.visualS = s.focusS + visualScroll.deltaAt(d);
  let bgPxPerSec = 0;
  if (prev !== null && prev.shot === s.shot) {
    const dS = (s.focusS - prev.focusS) / stepSec;
    if (isParallax(s.view)) {
      const dV = (s.visualS - prev.visualS) / stepSec;
      bgPxPerSec = Math.abs(parallaxLayerShiftPx({ depthOffsetM: 0 }, { scrollM: dV, packPxPerM: s.packPxPerM, packDepthM: s.packDepthM, direction: s.direction }));
    } else {
      bgPxPerSec = Math.abs(dS / 400) * PLATE_TRAVEL_PX; // 旧プレートの progress 送り
    }
  }
  const mid = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? 0; };
  rows.push({
    t: Number(d.toFixed(2)), race: s.raceSec, shot: s.shot, view: s.view,
    focusS: Math.round(s.focusS), spreadM: Math.round(s.leaderS - s.tailS),
    pxPerM: Number(s.packPxPerM.toFixed(1)), horsePx: Math.round(mid(s.horseHeightPx)),
    horsePct: Number((100 * mid(s.horseHeightPx) / H).toFixed(1)),
    inFrame: `${s.inFrame}/${s.total}`,
    feetY: `${Math.round(Math.min(...s.feetY))}-${Math.round(Math.max(...s.feetY))}`,
    bgPxPerSec: Math.round(bgPxPerSec),
    packSpeedMps: prev !== null ? Number(((s.focusS - prev.focusS) / stepSec).toFixed(1)) : 0,
    visualMps: prev !== null ? Number(((s.visualS - prev.visualS) / stepSec).toFixed(1)) : 0,
    strideHz: prev !== null ? Number((((s.visualS - prev.visualS) / stepSec) / 7).toFixed(2)) : 0,
  });
  prev = s;
}
console.table(rows);
// ショットごとの要約
const byShot = new Map();
for (const r of rows) {
  const b = byShot.get(r.shot) ?? { shot: r.shot, from: r.t, to: r.t, n: 0, horsePct: 0, bg: 0, spread: 0 };
  b.to = r.t; b.n++; b.horsePct += r.horsePct; b.bg += r.bgPxPerSec; b.spread += r.spreadM;
  byShot.set(r.shot, b);
}
console.table([...byShot.values()].map((b) => ({ shot: b.shot, from: b.from, to: b.to, sec: b.n * stepSec, avgHorsePct: (b.horsePct / b.n).toFixed(1), avgBgPxPerSec: Math.round(b.bg / b.n), avgSpreadM: Math.round(b.spread / b.n) })));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
