/**
 * ★**カットが本当に変わっているか／馬が画面から消えていないか**を測る
 *
 * 【なぜ要るか】オーナー判定より
 *   ②「ずっとカメラワークが同じなのが飽きる。見せ場も必要」
 *   ★「**画面の右端に消える馬が多い**」
 *   ★「遠近法なのか**ずっと小さい馬がいる**のはなぜ？」
 *
 *   ★**「直しました」と言うだけでは足りません。** 3つとも数字にします。
 *
 * ⚠️ ★**この道具は `race-next/page.tsx` の式と値を写しています。**
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
const OWN = 3;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const RATES = { cruise: 2.7, spurt: 2.25, straight: 1.8 };
const HORSE_LENGTH_M = 2.4;

const ROW_DEF = [
  { id: 'back', pxPerM: 22, limitPx: 330, groundY: 436, air: 0.1 },
  { id: 'mid', pxPerM: 30, limitPx: 440, groundY: 520, air: 0.04 },
  { id: 'front', pxPerM: 40, limitPx: 560, groundY: 626, air: 0 },
];
const X_ANCHOR = 640;
const LANE_MOVE_SEC = 1.2;
const softX = (dm, pxPerM, zoom, limitPx) => limitPx * Math.tanh((dm * pxPerM * zoom) / limitPx);
const CUT_OF = {
  // ★発走は**寄る**。オーナー指示「逃げ・先行が前へ踊り出て、差し・追込が後方へ」＝
  //   隊列ができていく過程が見えないと意味がないので、引くと逆効果でした
  '2角': { zoom: 1.5, target: 'pack', label: '発走' },
  '1角': { zoom: 1.5, target: 'pack', label: '発走' },
  // ★道中がいちばん引く（＝上空の代わり。一団であることが伝わる）
  向正面: { zoom: 0.95, target: 'pack', label: '道中' },
  '3角': { zoom: 1.35, target: 'mover', label: '仕掛け' },
  '4角': { zoom: 1.7, target: 'lead2', label: '勝負所' },
  直線: { zoom: 2.1, target: 'lead2', label: '決着' },
};
function targetLane(rank, current, isOwn) {
  const up2 = rank <= 2, down2 = rank >= 4, up1 = rank <= 6, down1 = rank >= 8;
  let want = current >= 1.5 ? (down2 ? 1 : 2) : (up2 ? 2 : (current >= 0.5 ? (down1 ? 0 : 1) : (up1 ? 1 : 0)));
  if (isOwn) want = Math.max(1, want);
  return want;
}

const COURSE = ovalCourse(DIST);
const ST = segmentStarts(COURSE);
const SEGS = ST.map((x, i) => ({ s: x.s, end: ST[i + 1]?.s ?? DIST, label: x.label }));
const segAt = (m) => SEGS.find((g) => m >= g.s && m < g.end) ?? SEGS[SEGS.length - 1];

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
    warp: timeWarpFor(knotsFor(boundaries, OWN), RATES),
  };
}

const acc = new Map();
let offScreen = 0;
let samples = 0;
/** 馬ごとの「1× で写っていた割合」（★ずっと小さい馬がいないか） */
const smallShare = new Map();
let durSum = 0;

for (const seed of [42, 7, 101, 2026, 555]) {
  const { model, warp } = raceOf(seed);
  durSum += warp.displaySec;
  const lane = new Map();
  const N = 900;
  for (let i = 0; i <= N; i++) {
    const d = (warp.displaySec * i) / N;
    const dt = warp.displaySec / N;
    const at = model.at(warp.raceSecAt(d));
    const sorted = [...at].sort((a, b) => b.meters - a.meters);
    const own = at.find((h) => h.gate === OWN);
    const seg = segAt(own.meters);
    const cut = CUT_OF[seg.label];
    const packM = at.reduce((s, h) => s + h.meters, 0) / at.length;
    let camM = packM;
    if (cut.target === 'lead2') camM = packM * 0.35 + ((sorted[0].meters + sorted[1].meters) / 2) * 0.65;
    else if (cut.target === 'mover') {
      const back = model.at(Math.max(0, warp.raceSecAt(d) - 1.2));
      const lead0 = Math.max(...back.map((h) => h.meters));
      let best = packM, bestGain = 0;
      for (const h of sorted) {
        const b = back.find((x) => x.gate === h.gate);
        if (!b) continue;
        const gain = (lead0 - b.meters) - (sorted[0].meters - h.meters);
        if (gain > bestGain) { bestGain = gain; best = h.meters; }
      }
      camM = packM * 0.55 + best * 0.45;
    }

    let minX = Infinity, maxX = -Infinity;
    sorted.forEach((h, rank) => {
      const cur = lane.get(h.gate) ?? (rank <= 2 ? 2 : rank <= 6 ? 1 : 0);
      const want = targetLane(rank, cur, h.gate === OWN);
      const now = cur + (want - cur) * Math.min(1, dt / LANE_MOVE_SEC);
      lane.set(h.gate, now);
      const lo = ROW_DEF[Math.max(0, Math.min(1, Math.floor(now)))];
      const hi = ROW_DEF[Math.max(1, Math.min(2, Math.floor(now) + 1))];
      const f = Math.max(0, Math.min(1, now - Math.floor(now)));
      const mix = (a, b) => a + (b - a) * f;
      const x = X_ANCHOR + softX(h.meters - camM, mix(lo.pxPerM, hi.pxPerM), cut.zoom, mix(lo.limitPx, hi.limitPx));
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      // ★スプライトは 1× で 220px 幅。中心が枠から 110px 以上外なら「消えた」
      if (x < -110 || x > W + 110) offScreen++;
      samples++;
      const s = smallShare.get(h.gate) ?? { small: 0, n: 0 };
      if (now < 1.55) s.small++;
      s.n++;
      smallShare.set(h.gate, s);
    });

    const rec = acc.get(seg.label) ?? { label: cut.label, zoom: cut.zoom, target: cut.target, n: 0, span: 0, sec: 0 };
    rec.n++; rec.span += maxX - minX; rec.sec += dt;
    acc.set(seg.label, rec);
  }
}

console.log(`★1600m の表示時間 ${(durSum / 5).toFixed(1)} 秒（5レース平均）\n`);
console.log('★カットごとの見え方（5レースの平均・自馬3番）\n');
console.log('  区間    見せ場    画角   注視点  ★1馬身が何px に見えるか  馬群の画面上の幅   尺');
for (const [segLabel, r] of acc) {
  const perLen = 40 * r.zoom * HORSE_LENGTH_M;   // 手前の段（40px/m）での見た目
  console.log(`  ${segLabel.padEnd(5)} ${r.label.padEnd(5)} ${r.zoom.toFixed(2)}×  ${r.target.padEnd(6)}`
    + `        ${perLen.toFixed(0).padStart(3)} px          `
    + `${(r.span / r.n).toFixed(0).padStart(4)} px      ${(r.sec / 5).toFixed(1)} 秒`);
}
const zooms = [...acc.values()].map((r) => r.zoom);
const spanZ = Math.max(...zooms) / Math.min(...zooms);
console.log(`\n  ★画角の幅 ${spanZ.toFixed(1)}倍`);

console.log(`\n★枠の外へ出た馬 ${offScreen} / ${samples} 標本`);

const shares = [...smallShare.entries()].map(([g, s]) => [g, s.small / s.n]).sort((a, b) => b[1] - a[1]);
console.log('\n★「1×（小さいまま）で写っていた割合」馬番ごと');
console.log('  ' + shares.map(([g, v]) => `${g}番 ${(v * 100).toFixed(0)}%`).join('  '));
const always = shares.filter(([, v]) => v > 0.97);

let bad = false;
if (spanZ < 1.5) { console.log('\n★FAIL — カットが実質的に変わっていません'); bad = true; }
if (offScreen > 0) { console.log(`\n★FAIL — ${offScreen} 標本で馬が枠外へ出ています`); bad = true; }
if (always.length > 0) {
  console.log(`\n★FAIL — 最初から最後まで小さいままの馬がいます: ${always.map(([g]) => `${g}番`).join(',')}`);
  bad = true;
}
if (bad) process.exit(1);
console.log('\n★PASS — カットは切り替わり／誰も枠外へ出ず／ずっと小さいままの馬もいません');
