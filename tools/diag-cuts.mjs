/**
 * ★**カットが本当に変わっているか**を測る
 *
 * 【なぜ要るか】
 *   ★オーナー判定②「ずっとカメラワークが同じなのが飽きる。見せ場も必要」。
 *   ★**「切り替えました」と言うだけでは足りません。**
 *   画面に入っている頭数・注視点の位置・画角が、区間ごとに**実際に違う**ことを数字で出します。
 *
 * ⚠️ ★**この道具は `race-next/page.tsx` の値を写しています。**
 *    片方だけ直すと、道具が通ったまま画面が変わりません。**両方直すこと。**
 *
 * 実行: npx tsx tools/diag-cuts.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel, timeWarpFor, knotsFor, ovalCourse, segmentStarts } from '@star/render';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const DIST = 1600;
const FIELD = 12;
const W = 1280;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const RATES = { cruise: 3.6, spurt: 3.0, straight: 2.4 };

const ROW_DEF = [
  { id: 'back', pxPerM: 22, slots: 5 },
  { id: 'mid', pxPerM: 30, slots: 4 },
  { id: 'front', pxPerM: 40, slots: 3 },
];
const X_ANCHOR = 640;
const SOFT_LIMIT_M = 14;
const softGap = (dm) => SOFT_LIMIT_M * Math.tanh(dm / SOFT_LIMIT_M);
const CUT_OF = {
  '2角': { zoom: 0.72, target: 'pack', label: '発走' },
  '1角': { zoom: 0.72, target: 'pack', label: '発走' },
  向正面: { zoom: 0.6, target: 'pack', label: '道中' },
  '3角': { zoom: 1.25, target: 'mover', label: '仕掛け' },
  '4角': { zoom: 1.7, target: 'lead2', label: '勝負所' },
  直線: { zoom: 2.1, target: 'lead2', label: '決着' },
};

const COURSE = ovalCourse(DIST);
const ST = segmentStarts(COURSE);
const SEGS = ST.map((x, i) => ({ s: x.s, end: ST[i + 1]?.s ?? DIST, label: x.label }));
const segAt = (m) => SEGS.find((g) => m >= g.s && m < g.end) ?? SEGS[SEGS.length - 1];

function lanesOf(ownGate) {
  const rest = Array.from({ length: FIELD }, (_, i) => i + 1).filter((g) => g !== ownGate);
  const out = [{ gate: ownGate, row: 2, sub: 0 }];
  const counts = [0, 0, 1];
  let ri = 0;
  for (const g of rest) {
    while (ri < 3 && counts[ri] >= ROW_DEF[ri].slots) ri++;
    if (ri > 2) break;
    out.push({ gate: g, row: ri, sub: counts[ri]++ });
  }
  return out;
}

function raceOf(seed) {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4], condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `n${seed}`, distance: DIST, surface: 'turf',
    trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
  return {
    model: replayPositionModel({
      distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
      jostle: 0.25, jostleSeed: seed * 2654435761,
    }),
    warp: timeWarpFor(knotsFor(boundaries, 3), RATES),
  };
}

const OWN = 3;
const lanes = lanesOf(OWN);
const laneOf = Object.fromEntries(lanes.map((l) => [l.gate, l.row]));

/** 区間ごとに集める */
const acc = new Map();
for (const seed of [42, 7, 101, 2026, 555]) {
  const { model, warp } = raceOf(seed);
  for (let i = 0; i <= 600; i++) {
    const d = (warp.displaySec * i) / 600;
    const at = model.at(warp.raceSecAt(d));
    const sorted = [...at].sort((a, b) => b.meters - a.meters);
    const own = at.find((h) => h.gate === OWN);
    const seg = segAt(own.meters);
    const cut = CUT_OF[seg.label];
    const packM = at.reduce((s, h) => s + h.meters, 0) / at.length;
    let camM = packM;
    if (cut.target === 'lead2') camM = packM * 0.35 + ((sorted[0].meters + sorted[1].meters) / 2) * 0.65;
    let onScreen = 0;
    for (const h of at) {
      const x = X_ANCHOR + softGap(h.meters - camM) * ROW_DEF[laneOf[h.gate]].pxPerM * cut.zoom;
      if (x > -110 && x < W + 110) onScreen++;
    }
    const rec = acc.get(seg.label) ?? { label: cut.label, zoom: cut.zoom, target: cut.target, n: 0, sum: 0, sec: 0 };
    rec.n++; rec.sum += onScreen; rec.sec += warp.displaySec / 600;
    acc.set(seg.label, rec);
  }
}

console.log('★カットごとの見え方（5レースの平均・自馬3番）\n');
console.log('  区間    見せ場      画角   注視点   ★画面に入っている頭数   1レースあたりの尺');
for (const [segLabel, r] of acc) {
  console.log(`  ${segLabel.padEnd(5)} ${r.label.padEnd(6)} ${r.zoom.toFixed(2)}×  ${r.target.padEnd(6)} `
    + `      ${(r.sum / r.n).toFixed(1)} / 12 頭        ${(r.sec / 5).toFixed(1)} 秒`);
}
const zooms = [...acc.values()].map((r) => r.zoom);
const heads = [...acc.values()].map((r) => r.sum / r.n);
const spanZ = Math.max(...zooms) / Math.min(...zooms);
const spanH = Math.max(...heads) - Math.min(...heads);
console.log(`\n  ★画角の幅 ${spanZ.toFixed(1)}倍　／　画面に入る頭数の差 ${spanH.toFixed(1)}頭`);
if (spanZ < 1.5 || spanH < 2) {
  console.log('\n★FAIL — カットが実質的に変わっていません（ずっと同じカメラワーク）');
  process.exit(1);
}
console.log('\n★PASS — 区間ごとに画角と写る頭数が変わっています');
