/**
 * ★**画面上で馬が 1 秒に何完歩しているか**を、本番と同じ経路で測る
 *
 * 【なぜ要るか（2026-08-21）】
 *   オーナーが 12 カットを判定したときは、勝負所・直線が**等倍（実物どおりの脚の速さ）**でした。
 *   レースを 30 秒にすると時間が 3.4 倍に圧縮され、**脚もそのぶん速く回ります。**
 *   ★「合格した走り方」は実物どおりの脚の速さで得られたものなので、ここが変わると評価が変わります。
 *
 *   `visual-scroll.ts` は時間圧縮を打ち消して脚を実速に保つ仕組みですが、
 *   ★**決勝線など世界固定の物を映す区間では無効になります**（`broadcastV2AnchorWeight` → 1）。
 *   つまり**ゴール前だけは圧縮どおりに速くなります。** それを数値で出します。
 *
 * 実行: npx tsx tools/verify-stride-rate.mjs
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  broadcastV2AnchorWeight, buildVisualScroll, knotsFor, ovalCourse, ratesForTarget,
  replayPositionModel, resolveBroadcastV2Scene, targetDisplaySec, timeWarpFor,
} from '@star/render';

const DIST = 1600, FIELD = 12, SEED = 42, STRIDE_M = 7, REAL_HZ = 15.6 / STRIDE_M;
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const st = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(st, st + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const result = resolveRace({
  conditions: {
    raceId: 'c', distance: DIST, surface: 'turf', trackCondition: 'good',
    courseShape: 'oval', baseWeightKg: 55,
  },
  entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE,
});
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('★着順が一致しません');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  laneOf: (g, ml) => laneAt(g, FIELD, ml, DIST, SEED),
});
const knots = knotsFor(boundaries, 3, model.straightMeters);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/** ★画面と同じ手順で `visualScroll` を組む */
const STEP = 0.05;
const samples = [];
for (let t = 0; t <= warp.displaySec + 1e-9; t += STEP) {
  const at = model.at(warp.raceSecAt(t));
  const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
  const scene = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false, { raceDisplaySec: t });
  const lo = warp.raceSecAt(Math.max(0, t - STEP));
  const hi = warp.raceSecAt(Math.min(warp.displaySec, t + STEP));
  const rate = (hi - lo) / (Math.min(warp.displaySec, t + STEP) - Math.max(0, t - STEP) || 1);
  samples.push({
    displaySec: t, focusS: scene.focusS, rate,
    anchorWeight: broadcastV2AnchorWeight(course, scene.shot.id, scene.focusS),
  });
}
const scroll = buildVisualScroll(samples);

/** カットごとに、見た目の進行距離の増分から完歩数を出す */
const runs = new Map();
for (let i = 1; i < samples.length; i += 1) {
  const a = samples[i - 1], b = samples[i];
  const at = model.at(warp.raceSecAt(b.displaySec));
  const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
  const id = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
    { raceDisplaySec: b.displaySec }).shot.id;
  // ★見た目の進行距離 = 真の位置 + Δ
  const dVisual = (b.focusS + scroll.deltaAt(b.displaySec)) - (a.focusS + scroll.deltaAt(a.displaySec));
  const dt = b.displaySec - a.displaySec;
  const hz = dVisual / dt / STRIDE_M;
  const r = runs.get(id) ?? { sum: 0, n: 0, anchor: 0 };
  r.sum += hz; r.n += 1; r.anchor = Math.max(r.anchor, b.anchorWeight);
  runs.set(id, r);
}

console.log(`\n=== 画面上の完歩数（1600m・実物は ${REAL_HZ.toFixed(2)} 回/秒）===`);
console.log('  ★オーナーが 12 カットを判定したときは、勝負所・直線が実物どおりでした\n');
console.log('  カット                 完歩/秒   実物比   世界固定への一致度');
let bad = 0;
for (const [id, r] of runs) {
  const hz = r.sum / r.n;
  const ratio = hz / REAL_HZ;
  const ok = ratio <= 1.35;
  if (!ok) bad += 1;
  console.log(`  ${ok ? '  ' : '🔴'}${id.padEnd(22)}${hz.toFixed(2).padStart(6)}${(ratio.toFixed(2) + '倍').padStart(9)}`
    + `${r.anchor.toFixed(2).padStart(14)}`);
}
console.log('\n  ★一致度 1.00 の区間は「決勝線と馬の位置を合わせる」ため、時間圧縮がそのまま脚に出ます');
if (bad > 0) {
  console.log(`  🔴 ${bad} カットで脚が実物の 1.35 倍より速く回っています`);
  process.exit(1);
}
