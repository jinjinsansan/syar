/**
 * ★**最後の直線で、展開ごとにどれだけ引くかを測る**（★2026-09-12・オーナー指示⑤）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★ゴール前に急に引きが入り小さくなりますが、★**追い込み馬がある時は
 *   ★引く必要がありますが、それは展開によってカメラワークを切り替えてください**」。
 *
 *   ★`FINISH_CAMERA_BY_DEVELOPMENT` を足しましたが、★**表を書いただけでは画面は変わりません**
 *   （★2026-08-22 の実害: ★ショットの `camera:` を変えたのに画面が動かなかった）。
 *   ★**実際に画角と馬の大きさが変わっているか**をここで見ます。
 *
 * 【★測り方】★画面と同じ経路（`resolveBroadcastV2Scene`）に、★画面と同じ引数を渡します（★R-31）。
 *   ★ゴール板の手前（★先頭が残り 40m）で、★勝ち馬の ★**画面上の高さ**と ★**画角**を出します。
 *
 * ⚠️ ★DB に触れません。★読むだけです。★合否は出しません（★閾値はオーナー判断・R-16）。
 *
 * ★実行: npx tsx tools/measure-finish-framing.mjs [--seeds 1,3,5]
 */
import { buildAuditRace } from './lib/race-audit-build.mjs';
import {
  cameraBasis, homeStretchMetersOf, posOf, project, raceDevelopmentOf, RACE_DEVELOPMENT_LABEL,
  resolveBroadcastV2Scene,
} from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '9,13,7,42')).split(',').map(Number);
/** ★測る地点（★先頭が残り何 m か）。★引きが効くのは ★**まだ差が付いている間**です */
const LEFT = Number(arg('left', 40));
const W = 1280, H = 720;
/** ★`page.tsx` と同じ値 */
const CORNER_CUT_M = 400;
const NO_FRAME_SHOTS = ['finish-line'];
const CLIMAX_LEAD_COUNT = 5;

/** ★先頭が「残り `left` m」に達した瞬間の場面 */
function frameAtMetersLeft(built, development, leadGates, left, withDevelopment) {
  for (let sec = 0; sec < 600; sec += 0.05) {
    const at = built.model.at(sec);
    if (Math.max(...at.map((h) => h.meters)) < built.DIST - left) continue;
    const horses = at.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: 1 }));
    const scene = resolveBroadcastV2Scene(built.course, horses, { width: W, height: H }, false, {
      raceDisplaySec: sec,
      cornerCutM: CORNER_CUT_M,
      cornerTracking: true,
      fourthCornerFront: true,
      cornerStyle: 'front',
      script: 'v8',
      noContenderFrameShots: NO_FRAME_SHOTS,
      leadGates,
      ...(withDevelopment ? { development } : {}),
    });
    const basis = cameraBasis(scene.camera);
    const heights = new Map();
    for (const h of scene.visibleHorses) {
      const p = posOf(built.course, h.s, h.w ?? 10);
      const foot = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      const head = project(scene.camera, basis, { x: p.x, y: p.y, z: 2.5 });
      if (foot.depth <= 2 || head.depth <= 2) continue;
      /** ⚠️ ★画面の外へ出た馬を数えないこと。★入れなければ「入る頭数」が常に全頭になります */
      if (foot.x < 0 || foot.x > W) continue;
      heights.set(h.gate, Math.abs(foot.y - head.y));
    }
    return { shot: scene.shot.id, fovDeg: (scene.camera.fovY * 180) / Math.PI, heights, count: heights.size };
  }
  return null;
}

console.log(`★画面 ${W}x${H} ／ 台本 v8 ／ 先頭が残り ${LEFT}m の瞬間`);
console.log('');
console.log('seed  展開      勝ち馬  ★展開なし(従来)          ★展開あり(今回)');
console.log('                        画角    高さ   入る頭数   画角    高さ   入る頭数');
for (const seed of SEEDS) {
  const built = buildAuditRace({ seed });
  const straightM = homeStretchMetersOf(built.course);
  const winnerGate = Number(built.result.order[0].horseId);
  let sample = [];
  for (let sec = 0; sec < 600; sec += 0.05) {
    const at = built.model.at(sec);
    if (Math.max(...at.map((h) => h.meters)) < built.DIST - straightM) continue;
    sample = at.map((h) => ({ gate: h.gate, meters: h.meters }));
    break;
  }
  const info = raceDevelopmentOf(sample, winnerGate);
  const leadGates = built.result.order.slice(0, CLIMAX_LEAD_COUNT).map((e) => Number(e.horseId));
  const before = frameAtMetersLeft(built, info.kind, leadGates, LEFT, false);
  const after = frameAtMetersLeft(built, info.kind, leadGates, LEFT, true);
  const row = (f) => `${f.fovDeg.toFixed(1).padStart(5)}° ${f.heights.get(winnerGate)?.toFixed(0).padStart(5) ?? '  -- '}px ${String(f.count).padStart(5)} 頭`;
  console.log(`${String(seed).padStart(4)}  ${RACE_DEVELOPMENT_LABEL[info.kind].padEnd(5)} ${String(winnerGate).padStart(4)} 番   ${row(before)}   ${row(after)}`);
}
console.log('');
console.log('★「入る頭数」＝ その画角で画面に収まった馬の数。★追い込みほど多く入るのが狙いです。');
console.log('★この道具は合否を出しません（★閾値はオーナー判断・R-16）。');
