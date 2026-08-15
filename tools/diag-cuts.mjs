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

const LANE_Y = [436, 520, 626];
const LANE_AIR = [0.1, 0.04, 0];
const PX_PER_M = 30;
const LANE_MOVE_SEC = 1.6;
const SCALE_AT = 1.6;
/** ★左右で別々の上限。スプライトの半分の幅を引く（中心が枠内でも絵がはみ出すため） */
function softX(dm, zoom, anchorX, halfW) {
  const lim = dm >= 0
    ? Math.max(60, W - anchorX - halfW - 8)
    : Math.max(60, anchorX - halfW - 8);
  return lim * Math.tanh((dm * PX_PER_M * zoom) / lim);
}
function targetLane(rank, current, isOwn) {
  const up2 = rank <= 2, down2 = rank >= 4, up1 = rank <= 6, down1 = rank >= 8;
  let want = current >= 1.5 ? (down2 ? 1 : 2) : (up2 ? 2 : (current >= 0.5 ? (down1 ? 0 : 1) : (up1 ? 1 : 0)));
  if (isOwn) want = Math.max(1, want);
  return want;
}
const CUT_OF = {
  '2角': { zoom: 1.35, target: 'pack', anchorX: 380, label: '発走' },
  '1角': { zoom: 1.35, target: 'pack', anchorX: 380, label: '発走' },
  向正面: { zoom: 0.95, target: 'pack', anchorX: 640, label: '道中' },
  '3角': { zoom: 1.35, target: 'mover', anchorX: 600, label: '仕掛け' },
  '4角': { zoom: 1.7, target: 'lead2', anchorX: 580, label: '勝負所' },
  直線: { zoom: 2.1, target: 'lead2', anchorX: 540, label: '決着' },
};

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

let maxJump = 0, jumpSum = 0, jumpN = 0;
for (const seed of [42, 7, 101, 2026, 555]) {
  const { model, warp } = raceOf(seed);
  durSum += warp.displaySec;
  const lane = new Map();
  let prevX = null, prevSeg = null;
  let camResid = 0;
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
    let targetM = packM;
    if (cut.target === 'lead2') targetM = packM * 0.35 + ((sorted[0].meters + sorted[1].meters) / 2) * 0.65;
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
      targetM = packM * 0.55 + best * 0.45;
    }
    /**
     * ★カメラは重心に**厳密に一致**させ、「誰を見るか」の**差だけ**を滑らかにします。
     *   ⚠️ 差を滑らかにしないと、注視の対象が別の馬に移った瞬間に
     *      **画面全体がごそっと飛びます**（＝オーナーの「小間切れ現象」の 2つめの原因）。
     */
    const resid = targetM - packM;
    camResid += (resid - camResid) * Math.min(1, dt / 0.9);
    const camM = packM + camResid;

    let minX = Infinity, maxX = -Infinity;
    const curX = new Map();
    sorted.forEach((h, rank) => {
      const cur = lane.get(h.gate) ?? (rank <= 2 ? 2 : rank <= 6 ? 1 : 0);
      const want = targetLane(rank, cur, h.gate === OWN);
      const now = cur + (want - cur) * Math.min(1, dt / LANE_MOVE_SEC);
      lane.set(h.gate, now);
      // ⚠️ ★添字は丸めたほうに合わせる（`now - Math.floor(now)` だと now=2 で f=0 になる）
      const i = Math.max(0, Math.min(1, Math.floor(now)));
      const f = Math.max(0, Math.min(1, now - i));
      const scale = now >= SCALE_AT ? 2 : 1;
      const halfW = 110 * scale;
      const x = cut.anchorX + softX(h.meters - camM, cut.zoom, cut.anchorX, halfW);
      curX.set(h.gate, x);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      // ★絵の端まで含めて枠内か（中心ではなく**絵**で判定する）
      if (x - halfW < -2 || x + halfW > W + 2) offScreen++;
      samples++;
      void f;
      const s = smallShare.get(h.gate) ?? { small: 0, n: 0 };
      if (scale === 1) s.small++;
      s.n++;
      smallShare.set(h.gate, s);
    });

    /**
     * ★**「馬全部がごそっと動く」を測る**（F-09）。
     *
     * ⚠️ 最初は「馬群の左端と右端の中点」で測りましたが、
     *    ★**直線で隊列がばらけると中点そのものが動く**ので、カメラのせいでない量まで拾いました
     *    （13.8px と出た）。**測っていたものが違いました。**
     * → ★全馬の画面 x の変化量の**中央値**（＝全馬に共通して掛かった動き＝カメラのぶん）を見ます。
     *    1頭だけ伸びた・下がったは中央値に出ません。
     */
    if (prevX !== null && prevSeg === seg.label) {
      const deltas = [];
      for (const [g, xv] of curX) {
        const pv = prevX.get(g);
        if (pv !== undefined) deltas.push(xv - pv);
      }
      deltas.sort((a, b) => a - b);
      const med = deltas.length ? deltas[deltas.length >> 1] : 0;
      const jump = Math.abs(med) * (1 / 60) / dt;   // 1/60秒あたりに直す
      maxJump = Math.max(maxJump, jump);
      jumpSum += jump; jumpN++;
    }
    prevX = curX; prevSeg = seg.label;

    const rec = acc.get(seg.label) ?? { label: cut.label, zoom: cut.zoom, target: cut.target, n: 0, span: 0, sec: 0 };
    rec.n++; rec.span += maxX - minX; rec.sec += dt;
    acc.set(seg.label, rec);
  }
}

console.log(`★1600m の表示時間 ${(durSum / 5).toFixed(1)} 秒（5レース平均）\n`);
console.log('★カットごとの見え方（5レースの平均・自馬3番）\n');
console.log('  区間    見せ場    画角   注視点  ★1馬身が何px に見えるか  馬群の画面上の幅   尺');
for (const [segLabel, r] of acc) {
  const perLen = PX_PER_M * r.zoom * HORSE_LENGTH_M;
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

console.log(`\n★全馬に共通して掛かる動き（＝カメラ）が 1コマ（1/60秒）で動く量`
  + `　平均 ${(jumpSum / jumpN).toFixed(2)} px ／ 最大 ${maxJump.toFixed(2)} px`);

let bad = false;
if (spanZ < 1.5) { console.log('\n★FAIL — カットが実質的に変わっていません'); bad = true; }
if (offScreen > 0) { console.log(`\n★FAIL — ${offScreen} 標本で馬が枠外へ出ています`); bad = true; }
if (maxJump > 12) { console.log(`
★FAIL — 1コマで ${maxJump.toFixed(1)}px 飛んでいます（ごそっと動く）`); bad = true; }
if (always.length > 0) {
  console.log(`\n★FAIL — 最初から最後まで小さいままの馬がいます: ${always.map(([g]) => `${g}番`).join(',')}`);
  bad = true;
}
if (bad) process.exit(1);
console.log('\n★PASS — カットは切り替わり／誰も枠外へ出ず／ずっと小さいままの馬もいません');
