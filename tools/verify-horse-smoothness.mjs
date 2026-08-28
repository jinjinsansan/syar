/**
 * ★**馬 1 頭ずつ**の画面上の動きが滑らかかを測る
 *
 * 【なぜ要るか（2026-08-22）】
 *   ★オーナー評「カーブの曲がり、ゲートの出だし、順位を抜く時、様々な場面で
 *     滑らかさがなく、**馬が飛ぶ**印象があります」。
 *
 * ⚠️ ★**先頭を追ってはいけません。** 先頭は途中で交代するので、
 *    交代した瞬間に「別の馬の位置」へ跳び、偽の跳びが出ます（実際に 397px の偽陽性を出した）。
 * ⚠️ ★**画面の端にいる馬も外します。** 投影が暴れて指標が雑音まみれになります。
 * → **枠番で固定した 1 頭**を、**画面の内側にいる間だけ**追います。
 *
 * 【見るもの】
 *   1 コマの移動量そのものではなく、**移動量の変化（跳び）**を見ます。
 *   等速で動いていれば移動量は一定なので、変化は 0 に近くなります。
 *
 * 実行: npx tsx tools/verify-horse-smoothness.mjs
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt } from '@star/race-engine';
import {
  broadcastV2StartLagM,
  cameraBasis, knotsFor, ovalCourse, posOf, project, ratesForTarget,
  replayPositionModel, resolveBroadcastV2Scene, targetDisplaySec, timeWarpFor, withFinishRunOut,
} from '@star/render';


/** ★立ち上がりの基準にする走速（m/s）。★`page.tsx` と同じ値 */
const RACE_SPEED_MPS = 15.6;
const startShownMeters = (meters, raceDisplaySec) =>
  Math.max(0, meters - broadcastV2StartLagM(raceDisplaySec, RACE_SPEED_MPS));

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
const kn = knotsFor(boundaries, 3);
const warp = timeWarpFor(kn, ratesForTarget(kn, targetDisplaySec(DIST)));
const finishSec = new Map(boundaries.map((b) => [b.gate, b.finishSec]));

/** 枠番ごとに、カット内での「移動量の変化」を集める */
const agg = new Map();
const prev = new Map();
/**
 * ★**同じ名前のカットが 2 回出る台本への対応**（2026-08-28）。
 *
 * ⚠️ ★この道具はキーを `ショットID#枠番` にしていました。
 *    ★v6 は `side-drive` も `straight-contest` も**2 回出ます**。
 *    ★すると間の別カットを**飛び越えて前のコマと比べ**、
 *    ★**カットの切替を「馬が飛んだ」として数えていました**
 *    （実例: straight-contest で尖り **1859 倍**。実体は 1392m のカット）。
 * ★**連続している区間ごと**に番号を振り、これをキーに入れます。
 */
let runIndex = 0;
let runShotId;
for (let t = 0; t <= warp.displaySec; t += 1 / FPS) {
  const sec = warp.raceSecAt(t);
  const at = model.at(sec);
  const vis = withFinishRunOut(at, (g) => finishSec.get(g), sec, DIST, 0);
  /**
   * ★**発走の遅れを引く**（`page.tsx` の `startShownMeters` と同じ）。
   * ⚠️ ★この道具は 2026-08-28 まで引いていませんでした。★画面も監査も引いています。
   *    ★引かないと、★**馬を 8.32m 先で測り**、発走直後はその分の動きも見落とします（R-30）。
   */
  const horses = vis.map((h) => ({ gate: h.gate, s: startShownMeters(h.meters, t), w: h.w, staminaRatio: 1 }));
  const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, false, { raceDisplaySec: t });
  const basis = cameraBasis(scene.camera);
  if (scene.shot.id !== runShotId) { runIndex += 1; runShotId = scene.shot.id; }
  for (const h of horses) {
    const p = posOf(course, h.s, h.w);
    const foot = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(scene.camera, basis, { x: p.x, y: p.y, z: 2.5 });
    const key = `${scene.shot.id}#${runIndex}#${h.gate}`;
    if (foot === undefined || head === undefined || foot.depth <= 2) { prev.delete(key); continue; }
    const size = Math.abs(foot.y - head.y);
    // ★画面の内側にいる間だけ（端は投影が暴れる）
    const inside = foot.x > 80 && foot.x < W - 80 && size > 20;
    if (!inside) { prev.delete(key); continue; }
    const p0 = prev.get(key);
    if (p0 !== undefined) {
      const dx = foot.x - p0.x, dy = foot.y - p0.y, ds = size / p0.size - 1;
      if (p0.dx !== undefined) {
        const r = agg.get(scene.shot.id) ?? { jx: 0, jy: 0, js: 0, n: 0, gate: 0, at: 0, all: [] };
        const jx = Math.abs(dx - p0.dx), jy = Math.abs(dy - p0.dy), js = Math.abs(ds - p0.ds) * 100;
        if (jx > r.jx) { r.jx = jx; r.gate = h.gate; r.at = t; }
        r.jy = Math.max(r.jy, jy);
        r.js = Math.max(r.js, js);
        r.all.push(jx);
        r.n += 1;
        agg.set(scene.shot.id, r);
      }
      prev.set(key, { x: foot.x, y: foot.y, size, dx, dy, ds });
    } else prev.set(key, { x: foot.x, y: foot.y, size });
  }
}

console.log(`\n=== 馬 1 頭ごとの「動きの跳び」（${FPS}fps・カット内・画面の内側だけ）===\n`);
console.log('  カット                 横の跳び  ふだん  尖り  縦の跳び  大きさ   最悪の枠/秒');
let bad = 0;
for (const [id, r] of agg) {
  const sorted = [...r.all].sort((x, y) => x - y);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  /**
   * ★**尖り** = いちばん大きい跳び ÷ ふだんの跳び（95% 点）。
   *
   *   ⚠️ ★大きさだけで良し悪しは決められません。**固定カメラに馬が近づくと、
   *      画面上の移動量は本当に増えます**（遠近法）。それは滑らかな加速であって不具合ではない。
   *   ★不具合は「**ふだんと比べて突出した 1 コマ**」＝尖りとして出ます。
   */
  const spike = p95 > 0.05 ? r.jx / p95 : 1;
  /**
   * ★**大きさと尖りの両方**で判定します。
   *   ⚠️ 尖りだけだと、**1.3px が 16 倍**のような「目に見えない尖り」まで拾って役に立ちません。
   *   ⚠️ 大きさだけだと、**遠近法による滑らかな加速**を不具合と誤判定します。
   */
  const ng = (r.jx > 6 && spike > 4) || r.jy > 12 || r.js > 6;
  if (ng) bad += 1;
  console.log(`  ${ng ? '🔴' : '  '}${id.padEnd(22)}${r.jx.toFixed(1).padStart(8)}${p95.toFixed(1).padStart(12)}${(spike.toFixed(1) + '倍').padStart(8)}${r.jy.toFixed(1).padStart(8)}${(r.js.toFixed(1) + '%').padStart(9)}`
    + `   ${r.gate}番 / ${r.at.toFixed(1)}s`);
}
console.log('\n  ★「跳び」は 1 コマ間の移動量の変化。等速なら 0 に近い。');
console.log('    ★**尖り 4 倍**を超えると「ふだんと違う 1 コマ」＝目に「飛んだ」と見える。');
console.log('    大きさだけでは判定しない（固定カメラに近づくと移動量は本当に増えるため）');
if (bad > 0) { console.log(`  🔴 ${bad} カットで跳びがあります`); process.exit(1); }
console.log('  ★どのカットも馬は滑らかです');
