/**
 * ★台本の**各カットが実際に何秒あるか**を、本番のエンジンで測る
 *
 * 【なぜ要るか（2026-08-21）】
 *   台本の `until` は**距離の比**で書きます。ところが表示時間は距離に比例しません
 *   （道中は早送り・勝負所と直線は等倍）。**距離で 30% のカットが、時間では 5% しかない**
 *   ということが普通に起きます。
 *   ★オーナー判定で残ったカットが**一瞬で消えていないか**を、目分量でなく秒で確かめます。
 *
 * 実行: npx tsx tools/verify-cut-timing.mjs [--distance 1600] [--seed 42]
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  knotsFor, ovalCourse, ratesForTarget, replayPositionModel, resolveBroadcastV2Scene,
  targetDisplaySec, timeWarpFor,
} from '@star/render';
/**
 * ★**時間の伸縮を組む基準馬**。★画面（`page.tsx` の `useState(3)`）と同じにすること。
 *   ⚠️ ★ここは 2026-08-28 まで **1 番固定**でした。`knotsFor` はその馬の節目を
 *      実時間へ寄せるので、★**同じ表示秒が画面と別の瞬間を指します**（実測 2.33 秒・R-30）。
 */
const OWN_GATE = 3;

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const SEED = num('--seed', 42);
const FIELD = 12;
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
if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 着順が一致しません');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  laneOf: (g, ml) => laneAt(g, FIELD, ml, DIST, SEED),
});
const knots = knotsFor(boundaries, OWN_GATE);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/** 1/60 秒刻みで、そのときのカットを引く */
const STEP = 1 / 60;
const runs = [];
for (let t = 0; t <= warp.displaySec + 1e-9; t += STEP) {
  const at = model.at(warp.raceSecAt(t));
  const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
  const allFinished = at.every((h) => h.meters >= DIST - 1e-6);
  const shot = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, allFinished, {
    raceDisplaySec: t,
  }).shot.id;
  const last = runs[runs.length - 1];
  if (last !== undefined && last.id === shot) last.end = t;
  else runs.push({ id: shot, start: t, end: t });
}

console.log(`\n=== カットの実尺（${DIST}m / シード ${SEED}）===`);
console.log(`  目標の表示時間 ${targetDisplaySec(DIST)} 秒 / 実際 ${warp.displaySec.toFixed(1)} 秒\n`);
console.log('  カット                    開始      尺');
let total = 0;
const REAR = new Set(['second-corner-high', 'aerial', 'third-corner-rear', 'fourth-corner-wide', 'winner-follow-rear']);
let rear = 0;
for (const r of runs) {
  const len = r.end - r.start + STEP;
  total += len;
  const bad = REAR.has(r.id);
  if (bad) rear += len;
  console.log(`  ${bad ? '🔴' : '  '}${r.id.padEnd(22)}${r.start.toFixed(1).padStart(6)}s${len.toFixed(1).padStart(8)}s`
    + (len < 1.5 ? '   ★短すぎる（1.5 秒未満）' : ''));
}
console.log(`\n  合計 ${total.toFixed(1)} 秒`);
if (rear > 0) {
  console.log(`  🔴 後方・俯瞰のカットが ${rear.toFixed(1)} 秒あります（オーナー判定で 5 戦 5 敗）`);
  process.exit(1);
}
console.log('  ★後方・俯瞰のカットは含まれていません');
