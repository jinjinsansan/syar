/**
 * ★**「かくかく曲がる」を測る**（読取専用・製品コードに触れません）
 *
 *   馬の絵は板（ビルボード）なので、向きは**素材の選び分け**でしか変わりません。
 *   `broadcast-v2-scene.ts` は注視点の向きとカメラの向きの角度 `viewDeg` を 1 つ求め、
 *     `viewDeg < 60` … 後ろ向き素材 / `> 120` … 正面素材 / それ以外 … 真横素材
 *   と**3 段の閾値**で選び、さらに `forwardDx < 0` なら**左右反転**します。
 *
 *   ★つまり曲がっている間、向きは**連続には変わりません**。閾値をまたぐ瞬間に
 *     素材が入れ替わり、反転が起きた瞬間に絵が裏返ります。ここでは
 *     **1 カットの中で何回入れ替わるか**と、**そのとき角度がいくつ跳ぶか**を数えます。
 *
 * ⚠️ 乱数・時刻を使いません（憲法 4）。着順・馬の位置は読むだけです（憲法 3）。
 *
 * 実行: npx tsx tools/audit-corner-turn.mjs
 */
import { DEFAULT_RACE_SCRIPT, posOf, cameraBasis, project, broadcastV2ShotById, broadcastV2TurnFacing } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30;
/**
 * ★台本を選べるようにしました（2026-08-28）。★既定は画面の既定（v5）。
 * ⚠️ ★以前は 'v5' 固定で、★**v6 にしか無いカットを一度も見ていません**でした（R-30）。
 */
const SCRIPT = (() => { const i = process.argv.indexOf('--script'); return i >= 0 ? process.argv[i + 1] : DEFAULT_RACE_SCRIPT; })();
const SEED = Number(process.env.AUDIT_SEED ?? RACE_DEFAULTS.seed);
const built = buildAuditRace({ seed: SEED });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const course = built.course;
const totalSec = clock.introSec + clock.warp.displaySec;

/** ★`broadcast-v2-scene.ts` の `shotView` と同じ式（★2 か所に持たないよう、式はここに写している旨を明記） */
function shotViewOf(scene) {
  const p0 = posOf(course, scene.focusS, scene.focusW);
  const p1 = posOf(course, scene.focusS + 1, scene.focusW);
  const fx = p1.x - p0.x, fy = p1.y - p0.y;
  const vx = p0.x - scene.camera.eye.x, vy = p0.y - scene.camera.eye.y;
  const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(vx, vy) || 1;
  const cosT = Math.max(-1, Math.min(1, (fx * vx + fy * vy) / (fl * vl)));
  const basis = cameraBasis(scene.camera);
  const q0 = project(scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
  const q1 = project(scene.camera, basis, { x: p1.x, y: p1.y, z: 0 });
  /**
   * ★**反転は画面と同じ決め方（毎コマ・進行方向の投影の符号）で測ります。**
   *   ⚠️ 2026-08-25: 一度これを「カット中は固定」に変えましたが、**カット後半で
   *      本来と逆を向く**ためオーナー評「全員斜めになりながら曲がっている・前回より酷い」となり、
   *      revert しました。★跳びより「向きが逆のまま」のほうが悪い、という判定です。
   */
  return { viewDeg: (Math.acos(cosT) * 180) / Math.PI, flip: (q1.x - q0.x) < 0, rawFlip: (q1.x - q0.x) < 0 };
}
/**
 * ★**素材の選び分けは、製品と同じ関数から引きます**（R-30・ここで作り直さない）。
 *
 *   ⚠️ 以前この道具は `viewDeg > 120 → 正面` を**自前で書き写して**いました。
 *      2026-08-26 に第4コーナーだけ `broadcastV2TurnFacing` へ変えたので、
 *      写しのままだと★**変えた当のカットを測れません**（0 回と出ます）。
 */
const bucketOf = (viewDeg, shotId) => {
  if (viewDeg < 60) return '後ろ';
  if (broadcastV2ShotById(shotId).turnFacing === true) {
    return broadcastV2TurnFacing(viewDeg).useFront ? '正面' : '真横';
  }
  return viewDeg > 120 ? '正面' : '真横';
};
void broadcastV2TurnFacing;   // ★turnFacing が復活したときのために経路だけ残す
/**
 * ★**横倍率は 1.00 固定です**（2026-08-26・指示書 §3-1 で「横縮小は回転ではない」と不合格）。
 *
 *   ⚠️ ★`broadcastV2TurnSqueezeX` / `broadcastV2TurnFacing` は**描画から外しました**。
 *      関数と検査は記録として残っていますが、★**呼ぶとここだけ製品と食い違います。**
 *      向きは**編集（カットの窓とカメラの据え位置）**で合わせています。
 */
const squeezeOf = () => 1;

const per = new Map();
let prev;
for (let f = 0; f / FPS <= totalSec; f += 1) {
  const d = f / FPS;
  const { scene } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  const v = shotViewOf(scene);
  const id = scene.shot.id;
  if (!per.has(id)) per.set(id, { frames: 0, swaps: [], flips: [], rawFlips: [], minDeg: 999, maxDeg: -999, maxStep: 0, stepAt: 0 });
  const r = per.get(id);
  r.frames += 1;
  r.minDeg = Math.min(r.minDeg, v.viewDeg); r.maxDeg = Math.max(r.maxDeg, v.viewDeg);
  if (prev !== undefined && prev.id === id) {
    const step = Math.abs(v.viewDeg - prev.v.viewDeg);
    if (step > r.maxStep) { r.maxStep = step; r.stepAt = d; }
    if (bucketOf(v.viewDeg, id) !== bucketOf(prev.v.viewDeg, id)) r.swaps.push({ d, from: bucketOf(prev.v.viewDeg, id), to: bucketOf(v.viewDeg, id) });
    const sq = squeezeOf(), sqPrev = squeezeOf();
    r.sqMin = Math.min(r.sqMin ?? 1, sq); r.sqMax = Math.max(r.sqMax ?? 0, sq);
    r.sqFlat = (r.sqFlat ?? 0) + (Math.abs(sq - sqPrev) < 1e-9 ? 1 : 0);
    if (v.flip !== prev.v.flip) r.flips.push(d);
    if (v.rawFlip !== prev.v.rawFlip) r.rawFlips.push(d);
  }
  prev = { id, v };
}

console.log(`\n★seed ${SEED} / 台本 ${SCRIPT} / ${FPS}fps\n`);
console.log('ショット                 秒    向きの角度      1コマ最大の跳び   素材の入替  左右反転');
console.log('─'.repeat(88));
for (const [id, r] of per) {
  console.log(`${id.padEnd(22)} ${(r.frames / FPS).toFixed(1).padStart(5)}`
    + `  ${r.minDeg.toFixed(0).padStart(3)}°〜${r.maxDeg.toFixed(0).padEnd(4)}°`
    + `  ${r.maxStep.toFixed(2).padStart(9)}°/コマ`
    + `  ${String(r.swaps.length).padStart(8)} 回  ${String(r.flips.length).padStart(6)} 回 (直す前 ${r.rawFlips.length} 回)`
    );
}
for (const [id, r] of per) {
  if (r.swaps.length === 0 && r.flips.length === 0 && r.rawFlips.length === 0) continue;
  console.log(`\n★${id}`);
  for (const s of r.swaps) console.log(`   表示 ${s.d.toFixed(2)}s  素材が ${s.from} → ${s.to} に入れ替わった`);
  for (const d of r.flips) console.log(`   表示 ${d.toFixed(2)}s  ★左右反転（いま）`);
  for (const d of r.rawFlips) console.log(`   表示 ${d.toFixed(2)}s  （直す前なら反転していた地点）`);
}
console.log(`
★読み方
   「1コマ最大の跳び」が大きいほど、その瞬間に向きが飛んでいます。
   「素材の入替」「左右反転」は**その瞬間に絵が別物になる**ので、曲がりが かくかく に見えます。`);
