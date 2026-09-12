/**
 * ★**カットの境目で「馬の大きさ」が跳ぶかを測る**（★2026-09-12・★オーナー指摘）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★真横カメラワークでの切り替わりで、★どうしても ★**一連のレースが
 *   ★つながっている感がありません**。★勝負服が同じだからかもしれませんし、
 *   ★別の原因があるかもしれません」。
 *
 *   ★`tools/audit-cut-seam.mjs` は ★**走行方向の反転**と ★**画面上の位置の跳び**を測ります。
 *   ★実測（★2026-09-12・seed 42）: ★反転 0 箇所 ／ ★共通馬 0 頭の境目 0 箇所。
 *   ★位置の跳びは ★真横どうしで 68〜75px と小さく、★コーナーの出入りが 615〜720px。
 *   ⚠️ ★**大きさ（縮尺）は、あの道具が測っていません。**
 *      ★同じ馬が同じ場所にいても、★**大きさが跳べば別のカメラに見えます**。
 *
 * 【★測り方】★画面と同じ経路（`resolveBroadcastV2Scene`）を通します（★R-30・式を作り直さない）。
 *   ★境目の ★**前後 0.1 秒**で、★同じ馬の ★**画面上の高さ**を出し、その比を取ります。
 *   ★1.00 なら大きさが変わっていない。★2.00 なら 2 倍に跳んでいる。
 *
 * ⚠️ ★DB に触れません。★読むだけです。★合否は出しません（★閾値はオーナー判断・R-16）。
 *
 * ★実行: npx tsx tools/measure-cut-scale.mjs [--seed 42]
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import {
  cameraBasis, knotsFor, ovalCourse, posOf, project, ratesForTarget, replayPositionModel,
  resolveBroadcastV2Scene, targetDisplaySec, timeWarpFor,
} from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEED = Number(arg('seed', 42));
const W = 1280, H = 720, FIELD = 12, DIST = 1600, OWN = 3, STEP = 0.1;
/** ★画面と同じ値（`page.tsx` の `CORNER_CUT_M_WEB` / `CUT_SCRIPT_NO_FRAME_SHOTS`） */
const CORNER_CUT_M = 400;
const NO_FRAME_SHOTS = ['finish-line'];

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
/** ★主役群（★確定着順の上位 5 頭）。★画面は `climaxLeadGates` で同じものを渡します */
const LEAD_GATES = [...boundaries].sort((a, b) => a.finishSec - b.finishSec).slice(0, 5).map((b) => b.gate);
const kn = knotsFor(boundaries, OWN, model.straightMeters);
const warp = timeWarpFor(kn, ratesForTarget(kn, targetDisplaySec(DIST)));

/** ★その表示秒の場面と、★馬ごとの画面上の高さ（px） */
function frameAt(t) {
  const at = model.at(warp.raceSecAt(Math.min(t, warp.displaySec)));
  const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
  /**
   * ⚠️ ★**画面と同じ引数を渡すこと**（★R-31）。
   *    ★2026-09-12、★`noContenderFrameShots` を渡さずに測って
   *    ★**画面と違うゴール板のカメラ**を測りました（★比 0.49 と出ましたが、それは別のカメラです）。
   *    ★渡す値の出どころは `apps/web/src/app/race/page.tsx` の `resolveBroadcastV2Scene` 呼び出しです。
   * ⚠️ ★`finishStyle` だけは組んだレースから来るので渡せていません（★既定で歩きます）。
   */
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, false, {
    raceDisplaySec: t,
    cornerCutM: CORNER_CUT_M,
    cornerTracking: true,
    fourthCornerFront: true,
    cornerStyle: 'front',
    script: 'v6',
    noContenderFrameShots: NO_FRAME_SHOTS,
    leadGates: LEAD_GATES,
  });
  const basis = cameraBasis(scene.camera);
  const heightOf = new Map();
  for (const h of scene.visibleHorses) {
    const p = posOf(course, h.s, h.w ?? 10);
    const foot = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(scene.camera, basis, { x: p.x, y: p.y, z: 2.5 });
    if (foot.depth <= 2 || head.depth <= 2) continue;
    if (foot.x < -80 || foot.x > W + 80) continue;
    heightOf.set(h.gate, Math.abs(foot.y - head.y));
  }
  return { shot: scene.shot.id, heightOf, eye: scene.camera.eye, fov: scene.camera.fovY };
}

/** ★カットの境目を探す */
const rows = [];
for (let t = 0; t <= warp.displaySec; t += STEP) rows.push({ t, f: frameAt(t) });
const seams = [];
for (let i = 1; i < rows.length; i += 1) {
  if (rows[i].f.shot === rows[i - 1].f.shot) continue;
  seams.push({ t: rows[i].t, before: rows[i - 1].f, after: rows[i].f });
}

const median = (xs) => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
console.log(`★seed ${SEED} ／ 境目 ${seams.length} 箇所 ／ 画面 ${W}x${H}`);
console.log('');
console.log('境界                                       共通馬  高さ前  高さ後   比   カメラの移動  画角前  画角後');
const out = [];
for (const s of seams) {
  const shared = [...s.before.heightOf.keys()].filter((g) => s.after.heightOf.has(g));
  const ratios = shared.map((g) => s.after.heightOf.get(g) / Math.max(1e-6, s.before.heightOf.get(g)));
  const hb = median(shared.map((g) => s.before.heightOf.get(g)));
  const ha = median(shared.map((g) => s.after.heightOf.get(g)));
  const r = median(ratios);
  const eyeJump = Math.hypot(s.after.eye.x - s.before.eye.x, s.after.eye.y - s.before.eye.y,
    s.after.eye.z - s.before.eye.z);
  const fovRatio = s.after.fov / Math.max(1e-6, s.before.fov);
  const degOf = (rad) => (rad * 180) / Math.PI;
  out.push({ name: `${s.before.shot} → ${s.after.shot}`, n: shared.length, hb, ha, r, eyeJump,
    fovRatio, fovB: degOf(s.before.fov), fovA: degOf(s.after.fov) });
}
for (const o of out.sort((a, b) => Math.abs(Math.log(b.r)) - Math.abs(Math.log(a.r)))) {
  console.log(`${o.name.padEnd(42).slice(0, 42)} ${String(o.n).padStart(4)}`
    + ` ${o.hb.toFixed(0).padStart(6)} ${o.ha.toFixed(0).padStart(6)}`
    + ` ${o.r.toFixed(2).padStart(5)} ${o.eyeJump.toFixed(0).padStart(11)}m`
    + ` ${o.fovB.toFixed(1).padStart(6)}° ${o.fovA.toFixed(1).padStart(6)}°`);
}
console.log('');
console.log('★比が 1.00 なら大きさが変わっていない。★2.00 なら 2 倍に跳んでいる。');
console.log('★この道具は合否を出しません（★閾値はオーナー判断・R-16）。');
