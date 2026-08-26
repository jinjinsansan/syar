/**
 * ★**「斜め向いたまま曲がる」を測る**（読取専用・製品コードに触れません）
 *
 * 【何が起きているか】
 *   馬の絵は板（ビルボード）なので、向きは**素材の選び分け**でしか変わりません。
 *   はしごは 3 段（`viewDeg < 60` 斜め後 / `> 120` 斜め前 / それ以外 真横）で、
 *   ★**真正面の素材はありません**（`apps/web/public/art/` に無い）。
 *
 *   4 角の固定カメラは直線入口に据わっているので、馬群が近づく途中で
 *   ★**向きの角度が 179.4°（＝カメラへ真っすぐ）になる瞬間**があります。
 *   そこでも斜め前の絵を出すので「斜めを向いたまま曲がる」ように見えます。
 *
 * 【★カメラでは直さないと決めた理由】
 *   ① 据え位置を総当たりしても掃引は消えません（下の表・全 20 通りで幅 39〜58°）
 *   ② 追従カメラにすると向きは一定になりますが、
 *      ★**奥から手前へ向かってくる迫力が丸ごと消えます**（オーナー判定で差し戻し・2026-08-26）
 *   → ★**カメラは動かさない。絵の側で向きを作る**（`broadcastV2TurnSqueezeX`）。
 *
 * ⚠️ 乱数・時刻を使いません（憲法 4）。着順・馬の位置は読むだけです（憲法 3）。
 * ⚠️ ファイルを書きません。標準出力だけです。
 *
 * 実行: npx tsx tools/audit-corner-camera.mjs
 */
import { posOf, cameraBasis, project, broadcastV2TurnSqueezeX } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5', HORSE_M = 2.4;
const SEED = Number(process.env.AUDIT_SEED ?? RACE_DEFAULTS.seed);
const built = buildAuditRace({ seed: SEED });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const course = built.course;
const total = clock.introSec + clock.warp.displaySec;

/** ★4 角正面カットの実シーン（毎コマ） */
const samples = [];
for (let f = 0; f / FPS <= total; f += 1) {
  const { scene } = auditSceneAt(built, clock, f / FPS, { width: W, height: H }, SCRIPT);
  if (scene.shot.id !== 'fourth-corner-front') continue;
  const p0 = posOf(course, scene.focusS, scene.focusW);
  const p1 = posOf(course, scene.focusS + 1, scene.focusW);
  const fx = p1.x - p0.x, fy = p1.y - p0.y;
  const vx = p0.x - scene.camera.eye.x, vy = p0.y - scene.camera.eye.y;
  const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(vx, vy) || 1;
  const deg = Math.acos(Math.max(-1, Math.min(1, (fx * vx + fy * vy) / (fl * vl)))) * 180 / Math.PI;
  const basis = cameraBasis(scene.camera);
  const q0 = project(scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
  const q1 = project(scene.camera, basis, { x: p1.x, y: p1.y, z: 0 });
  samples.push({
    sec: f / FPS, s: scene.focusS, w: scene.focusW, dist: vl, deg,
    fov: scene.camera.fovY * 180 / Math.PI,
    pct: 100 * HORSE_M * q0.pxPerM / H,
    flip: (q1.x - q0.x) < 0,
    squeeze: broadcastV2TurnSqueezeX(deg),
  });
}
const SHOT_END = 0.660 * course.distance;

console.log(`★seed ${SEED} / 台本 ${SCRIPT} / ${FPS}fps`);
console.log(`  4 角正面カット: ${samples.length} コマ / 注視点 ${samples[0].s.toFixed(0)}m → ${samples[samples.length - 1].s.toFixed(0)}m\n`);

console.log('★① カットの中で何が起きているか（0.2 秒ごと）');
console.log('  表示秒   カメラまで  向きの角度   画角   馬の高さ  横倍率  反転');
console.log('  ────────┼───────────────────────────────────────────────────');
for (const smp of samples.filter((_, i) => i % 6 === 0)) {
  const bar = '█'.repeat(Math.round(smp.squeeze * 20));
  console.log(`  ${smp.sec.toFixed(2).padStart(6)}  ${smp.dist.toFixed(0).padStart(8)}m  ${smp.deg.toFixed(1).padStart(8)}°  ${smp.fov.toFixed(1).padStart(5)}°  ${smp.pct.toFixed(1).padStart(7)}%  ${smp.squeeze.toFixed(2)} ${bar}${smp.flip ? '  ←反転' : ''}`);
}

const worstDeg = samples.reduce((m, s, i) => i === 0 ? 0 : Math.max(m, Math.abs(s.deg - samples[i - 1].deg)), 0);
const worstSq = samples.reduce((m, s, i) => i === 0 ? 0 : Math.max(m, Math.abs(s.squeeze - samples[i - 1].squeeze)), 0);
const flipAt = samples.find((s, i) => i > 0 && s.flip !== samples[i - 1].flip);
console.log(`\n  向きの角度   ${Math.min(...samples.map((s) => s.deg)).toFixed(1)}°〜${Math.max(...samples.map((s) => s.deg)).toFixed(1)}°（1 コマ最大 ${worstDeg.toFixed(2)}°）`);
console.log(`  横倍率       ${Math.min(...samples.map((s) => s.squeeze)).toFixed(2)}〜${Math.max(...samples.map((s) => s.squeeze)).toFixed(2)}（1 コマ最大 ${worstSq.toFixed(3)}）`);
if (flipAt !== undefined) {
  console.log(`  ★左右反転    表示 ${flipAt.sec.toFixed(2)}s・向き ${flipAt.deg.toFixed(1)}°・★そのときの横倍率 ${flipAt.squeeze.toFixed(2)}`);
  console.log(`               （横倍率が小さいほど、裏返っても見え方の差が小さい）`);
}

console.log('\n★② 固定カメラの据え位置を総当たり（★カメラでは掃引を消せないことの根拠）');
console.log('  sFrom   w  |  向きの角度      幅   カメラまでの距離');
console.log('  ───────────┼────────────────────────────────────────');
for (const sFrom of [30, 60, 120, 200, 300]) {
  for (const wCam of [27, 45, 70, 100]) {
    const eye = posOf(course, SHOT_END + sFrom, wCam);
    let min = 999, max = -999, minD = 1e9, maxD = 0;
    for (const smp of samples) {
      const p0 = posOf(course, smp.s, smp.w);
      const p1 = posOf(course, smp.s + 1, smp.w);
      const fx = p1.x - p0.x, fy = p1.y - p0.y;
      const vx = p0.x - eye.x, vy = p0.y - eye.y;
      const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(vx, vy) || 1;
      const deg = Math.acos(Math.max(-1, Math.min(1, (fx * vx + fy * vy) / (fl * vl)))) * 180 / Math.PI;
      min = Math.min(min, deg); max = Math.max(max, deg);
      minD = Math.min(minD, vl); maxD = Math.max(maxD, vl);
    }
    const now = (sFrom === 30 && wCam === 27) ? '  ← 現行（この画を守る）' : '';
    console.log(`  ${String(sFrom).padStart(5)} ${String(wCam).padStart(3)}  |  ${min.toFixed(0).padStart(3)}°〜${max.toFixed(0).padStart(3)}°   ${(max - min).toFixed(0).padStart(3)}°   ${minD.toFixed(0)}〜${maxD.toFixed(0)}m${now}`);
  }
}
console.log('  ★どの据え位置でも幅は残ります。馬が動いてカメラが動かない限り消えません。');
