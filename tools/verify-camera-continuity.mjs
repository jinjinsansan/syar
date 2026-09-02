/**
 * ★カメラがカットの中で**跳んでいない**かを測る
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   固定カメラの据え位置を「先頭の現在位置が属するコース区間の終点」にしていたため、
 *   カットの途中で馬が区間の境界を跨ぐと★**カメラが瞬間移動**していました。
 *   実測: 4 角正面で画角が **12.82°→2.80°（−78%）**、馬が **1 コマで 517px** 跳ぶ。
 *   ★オーナー評「カーブから曲がってくる時が雑、滑らかに走っていない」。
 *
 * ⚠️ ★**馬の位置で測ってはいけません。** 先頭は途中で交代し、後方の馬は画面端で
 *    投影が暴れます。どちらも指標を雑音まみれにします。
 *    **カメラ（視点・注視点・画角）そのもの**を見ること。
 *
 * 実行: npx tsx tools/verify-camera-continuity.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import { knotsFor, ovalCourse, ratesForTarget, replayPositionModel, resolveBroadcastV2Scene,
  targetDisplaySec, timeWarpFor } from '@star/render';

const W = 1280, H = 720, FIELD = 12, DIST = 1600, SEED = 42, FPS = 30;
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });
const S = ['nige', 'senko', 'sashi', 'oikomi'];
const st = (SEED * 13) % (POOL.length - FIELD);
const entrants = POOL.slice(st, st + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: S[(i + SEED) % 4], condition: 3, fatigue: 20, weightKg: 55, gate: i + 1, age: 4,
  skillGenes: h.skillGenes,
}));
const result = resolveRace({
  conditions: { raceId: 'c', distance: DIST, surface: 'turf', trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55 },
  entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE,
});
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('着順不一致');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  laneOf: (g, ml) => laneAt(g, FIELD, ml, DIST, SEED),
});
const kn = knotsFor(boundaries, 3, model.straightMeters);
const warp = timeWarpFor(kn, ratesForTarget(kn, targetDisplaySec(DIST)));

const agg = new Map();
let prev = null;
for (let t = 0; t <= warp.displaySec; t += 1 / FPS) {
  const at = model.at(warp.raceSecAt(t));
  const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
  const sc = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, false, { raceDisplaySec: t });
  const cur = {
    id: sc.shot.id, ex: sc.camera.eye.x, ey: sc.camera.eye.y, ez: sc.camera.eye.z,
    tx: sc.camera.target.x, ty: sc.camera.target.y, fov: (sc.camera.fovY * 180) / Math.PI,
  };
  if (prev !== null && prev.id === cur.id) {
    const r = agg.get(cur.id) ?? { eye: 0, tgt: 0, fov: 0, n: 0 };
    r.eye = Math.max(r.eye, Math.hypot(cur.ex - prev.ex, cur.ey - prev.ey, cur.ez - prev.ez));
    r.tgt = Math.max(r.tgt, Math.hypot(cur.tx - prev.tx, cur.ty - prev.ty));
    r.fov = Math.max(r.fov, Math.abs(cur.fov / prev.fov - 1) * 100);
    r.n += 1;
    agg.set(cur.id, r);
  }
  prev = cur;
}

console.log(`\n=== カットの中でのカメラの跳び（${FPS}fps・1 コマあたりの最大）===\n`);
console.log('  カット                 視点(m)   注視点(m)   画角の変化');
let bad = 0;
for (const [id, r] of agg) {
  /**
   * ★**視点だけを見てはいけません。** 道中は 5.9 倍速で送るので、追従カメラは
   *   1 コマで 5m 動くのが正常です（実測 `side-drive` 視点 5.08m / 注視点 4.25m）。
   *   跳びは「**注視点はほとんど動いていないのに視点だけ大きく動く**」形で出ます。
   *
   * ⚠️ ★**メートルだけで判定してはいけません。** カメラが近いほど、同じ 1m が画面では
   *    大きく動きます。実測: `front-close` は被写体まで約 18m・画角 20° なので
   *    **横に 1m 動くと画面は約 200px 動きます**。
   *    実際、注視点の横位置が 2.51m 跳んで**画面が 237px 飛んだ**のに、
   *    この検査は「2.78m」としか見ておらず**見逃しました**。
   *    → 馬の動きは `tools/verify-horse-smoothness.mjs` で**画面の px** として測ること。
   *      こちらは「カメラが瞬間移動していないか」だけを見る道具です。
   */
  const ng = (r.eye > 5 && r.eye > r.tgt * 3) || r.fov > 12;
  if (ng) bad += 1;
  console.log(`  ${ng ? '🔴' : '  '}${id.padEnd(22)}${r.eye.toFixed(2).padStart(8)}${r.tgt.toFixed(2).padStart(12)}${(r.fov.toFixed(1) + '%').padStart(12)}`);
}
console.log('\n  ★視点が 5m を超えて跳ぶ＝カメラの瞬間移動。画角 12% 超＝大きさが跳ぶ');
if (bad > 0) { console.log(`  🔴 ${bad} カットで跳びがあります`); process.exit(1); }
console.log('  ★どのカットもカメラは連続しています');
