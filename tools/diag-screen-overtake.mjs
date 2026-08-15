/**
 * ★**画面の上で、実際に馬が馬を抜くか**を測る
 *
 * 【なぜ要るか】
 *   ★オーナー判定:「馬それぞれの場所が定位置、走っているアニメーション（その場で）、
 *     芝や背景が動くだけ」。**そのとおりでした。**
 *   3段12枠に**順位順で馬を入れ替えて**いたので、
 *   ★**順位が変わると馬が瞬間移動するだけで、誰も誰も抜きません。**
 *
 *   横位置を「実際の差 [m] × 段ごとの px/m」に変えました。
 *   ★**変えたと言うだけでは足りないので、画面 x の入れ替わりを数えます。**
 *
 * 【何を数えるか】
 *   2頭について、画面 x の大小が**入れ替わった回数**。
 *   ⚠️ 段（奥行き）も順位で動くようになったので、段で絞らず全 66組を見ます。
 *      段が違うと px/m が違うため、x の前後が位置の前後と一致しないことがあります
 *      （＝視差。奥の馬のほうが横に動かない）。**それは正しい見え方です。**
 *
 * 実行: npx tsx tools/diag-screen-overtake.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf } from '@star/race-engine';
import { replayPositionModel, finalOrderOf } from '@star/render';

const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const DIST = 1600;
const FIELD = 12;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

/** ★`race-next/page.tsx` と同じ式・同じ値であること */
const W = 1280;
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

function modelOf(seed) {
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
  return replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    jostle: 0.25, jostleSeed: seed * 2654435761,
  });
}

const SEEDS = [42, 7, 101, 2026, 555];
let total = 0;
let totalPairs = 0;
console.log('★画面 x の前後が入れ替わった回数（＝抜いた回数）\n');
for (const seed of SEEDS) {
  const model = modelOf(seed);
  const lane = new Map();
  // ★`raceSec` です。最初 `finishSec` と書いたら undefined → x が NaN になり、
  //   `sign(NaN) !== sign(NaN)` が常に真で **全組が毎コマ入れ替わった**ことになり、
  //   ★どのシードでも同じ 4560 回という数字で「PASS」と表示しました。
  const T = 240;
  const step = model.raceSec / T;
  if (!Number.isFinite(step) || step <= 0) throw new Error(`★step が ${step} です`);
  const gates = model.at(0).map((h) => h.gate);
  let prev = null;
  let swaps = 0;
  const perLane = [0, 0, 0];
  let maxTravel = 0;
  const first = new Map();
  for (let t = 0; t <= T; t++) {
    const at = model.at(t * step);
    const sortedNow = [...at].sort((a, b) => b.meters - a.meters);
    const camM = at.reduce((s, h) => s + h.meters, 0) / at.length;
    const x = new Map();
    sortedNow.forEach((h, rank) => {
      // ★段は順位で決まり、1.2秒かけて移る（`race-next/page.tsx` と同じ）
      const cur = lane.get(h.gate) ?? (rank <= 2 ? 2 : rank <= 6 ? 1 : 0);
      const want = targetLane(rank, cur, h.gate === 3);
      const now = cur + (want - cur) * Math.min(1, step / LANE_MOVE_SEC);
      lane.set(h.gate, now);
      const halfW = 110 * (now >= SCALE_AT ? 2 : 1);
      const v = 640 + softX(h.meters - camM, 1, 640, halfW);
      if (!Number.isFinite(v)) throw new Error(`★${h.gate}番の画面 x が ${v} です`);
      x.set(h.gate, v);
      if (!first.has(h.gate)) first.set(h.gate, v);
      maxTravel = Math.max(maxTravel, Math.abs(v - first.get(h.gate)));
    });
    if (prev !== null) {
      for (const a of gates) {
        for (const b of gates) {
          if (a >= b) continue;
          if (Math.sign(x.get(a) - x.get(b)) !== Math.sign(prev.get(a) - prev.get(b))) {
            swaps++; perLane[Math.round(lane.get(a) ?? 0)]++;
          }
        }
      }
    }
    prev = x;
  }
  /**
   * ★**行って戻るだけの揺れ**を数えないよう、**発走時と決着時で前後が逆になった組**も数えます。
   *   こちらは震えでは増えません。
   */
  let decided = 0;
  {
    // ⚠️ ★決着時の**位置**で比べてはいけません。`replay-model.ts` に書いたとおり
    //    **ゴール時刻には全馬がゴール線上にいる**ので、差が全部 0 になり、
    //    ★どのシードでも「0 / 19」と出て FAIL しました（自分の測り方の欠陥）。
    // → **道中（25%地点）の位置**と、**確定した着順**で比べます。
    const early = new Map(model.at(model.raceSec * 0.25).map((h) => [h.gate, h.meters]));
    const place = new Map(finalOrderOf(model).map((g, i) => [g, i]));
    for (const a of gates) {
      for (const b of gates) {
        if (a >= b) continue;
        // 道中で前 = early が大きい／着順が上 = place が小さい
        if (Math.sign(early.get(a) - early.get(b)) !== Math.sign(place.get(b) - place.get(a))) decided++;
      }
    }
  }
  const pairs = (FIELD * (FIELD - 1)) / 2;
  total += decided;
  totalPairs += pairs;
  console.log(`  seed ${String(seed).padStart(4)}  ★道中の前後が着順で逆転した組 ${String(decided).padStart(2)} / ${pairs}`
    + `　（途中の入れ替わり延べ ${String(swaps).padStart(3)} 回・奥 ${perLane[0]} / 中 ${perLane[1]} / 手前 ${perLane[2]}）`
    + `  1頭が画面上を動いた幅 ${maxTravel.toFixed(0)}px`);
}
console.log(`\n  合計 ${total} 回 / 組 ${totalPairs} 通り × ${SEEDS.length} レース`);
if (total === 0) {
  console.log('\n★FAIL — 1回も抜いていません。「定位置で走っているだけ」の状態です');
  process.exit(1);
}
console.log('\n★PASS — 画面の上で抜き差しが起きています');
