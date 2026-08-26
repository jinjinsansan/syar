/**
 * ★**直線のカメラが「主役 5 頭」をどう収めているか**を測る（読取専用）
 *
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §4-4。
 *
 * 【★測るもの】
 *   ① ★主役 5 頭の**帯が画面幅のどれだけ**を占めるか（要求: 中央 60〜75%）
 *   ② ★その帯の**中心が画面中央からどれだけ**ずれているか
 *   ③ ★注視点が「先頭 1 頭」に寄っていないか
 *      → 主役 5 頭の**加重中心**と、いま採っている注視点との差（m）
 *   ④ ★画角が 1 コマで跳んでいないか（度／コマ）
 *   ⑤ ★後方馬まで全部入れて引きすぎていないか（画面内の総頭数）
 *
 * ⚠️ ★製品コードは変更しません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-climax-camera.mjs [--seeds 42,14,332,474]
 */
import { cameraBasis, posOf, project } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
/** ★このカットだけを数える（既定 = 攻防のカット）。`--shot ''` で全部 */
const SHOT_ONLY = String(arg('shot', 'homestretch-side'));
/** ★`--climax off` で演出を切って測る（対照） */
const CLIMAX_ON = String(arg('climax', 'on')) !== 'off';
const HORSE_HEIGHT_M = 2.4, HORSE_ASPECT = 1.71;

/** 中央値 */
const med = (xs) => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((p, q) => p - q);
  return a[Math.floor(a.length / 2)];
};

console.log(`★直線（先頭の残り 260〜60m・カット ${SHOT_ONLY || '全部'}）で、主役 5 頭をカメラがどう収めているかを測ります`);
console.log('★要求（§4-4）: 帯が画面幅の 60〜75% / 注視点は先頭 1 頭ではなく主役 5 頭の加重中心\n');

for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed });
  const clock = auditClock(built);
  const DIST = built.DIST;
  const total = clock.introSec + clock.warp.displaySec;
  const top5 = built.result.order.slice(0, 5).map((row) => {
    const e = built.entrants.find((x) => x.horseId === row.horseId);
    return e?.gate;
  });

  const spanM5 = [];
  const spanFrac = [], centerOff = [], edgeFrac = [], edgeOff = [], focusGap = [], onScreenAll = [];
  let maxFovStep = 0, maxFovAt = 0, prevFov, prevShot;
  const cutSteps = [];
  let frames = 0;
  for (let f = 0; f / FPS <= total; f += 1) {
    const d = f / FPS;
    const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT, { climax: CLIMAX_ON });
    const leadS = Math.max(...r.drawn.map((h) => h.s));
    const rem = DIST - leadS;
    if (rem > 260 || rem < 60) continue;
    /**
     * ★**カットごとに分けて数えます。**
     *   ⚠️ 残り 260〜60m には `homestretch-side`（攻防）と `finish-line`（ゴール前）の
     *      ★**2 つのカット**が入ります。混ぜると、攻防の構図を `finish-line` の
     *      別の構図（`broadcastV2FinishCamera`）が汚します。
     */
    if (SHOT_ONLY !== '' && r.scene.shot.id !== SHOT_ONLY) {
      /** ★カットの境目そのものも記録します（★跳んでよい場所ですが、大きさは報告します） */
      if (prevShot !== undefined && prevShot !== r.scene.shot.id && prevFov !== undefined) {
        cutSteps.push(`${prevShot}→${r.scene.shot.id} ${prevFov.toFixed(2)}°→${((r.scene.camera.fovY * 180) / Math.PI).toFixed(2)}°`);
      }
      prevShot = r.scene.shot.id;
      continue;
    }
    if (prevShot !== undefined && prevShot !== r.scene.shot.id && prevFov !== undefined) {
      cutSteps.push(`${prevShot}→${r.scene.shot.id} ${prevFov.toFixed(2)}°→${((r.scene.camera.fovY * 180) / Math.PI).toFixed(2)}°`);
    }
    prevShot = r.scene.shot.id;
    frames += 1;
    const basis = cameraBasis(r.scene.camera);
    const sx = new Map();
    let visibleAll = 0;
    for (const h of r.drawn) {
      const p = posOf(built.course, h.s, h.w);
      const foot = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      const head = project(r.scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
      const hp = Math.max(0, foot.y - head.y), wp = hp * HORSE_ASPECT;
      const vis = foot.depth > 0 && foot.x + wp / 2 > 0 && foot.x - wp / 2 < W && foot.y > 0 && head.y < H;
      if (vis) visibleAll += 1;
      sx.set(h.gate, { x: foot.x, wp, vis });
    }
    onScreenAll.push(visibleAll);
    /** ★主役 5 頭のうち、画面に出ている馬の帯 */
    const vs = top5.map((g) => sx.get(g)).filter((v) => v !== undefined && v.vis);
    if (vs.length >= 2) {
      /** ★中心どうしの帯 */
      const lo = Math.min(...vs.map((v) => v.x)), hi = Math.max(...vs.map((v) => v.x));
      spanFrac.push((hi - lo) / W);
      centerOff.push(((lo + hi) / 2 - W / 2) / W);
      /**
       * ★**絵の外縁どうしの帯**（★こちらが「画面をどれだけ占めているか」）。
       *   ⚠️ 中心どうしだと、★馬の絵の幅（体高 × 1.71）が丸ごと抜け落ちます。
       */
      const eLo = Math.min(...vs.map((v) => v.x - v.wp / 2));
      const eHi = Math.max(...vs.map((v) => v.x + v.wp / 2));
      edgeFrac.push((eHi - eLo) / W);
      edgeOff.push(((eLo + eHi) / 2 - W / 2) / W);
    }
    /** ★注視点（m）と、主役 5 頭の加重中心（m）の差 */
    const sOf = new Map(r.drawn.map((h) => [h.gate, h.s]));
    const gs = top5.map((g) => sOf.get(g)).filter((v) => v !== undefined);
    if (gs.length > 0) focusGap.push(r.scene.focusS - gs.reduce((a, b) => a + b, 0) / gs.length);
    if (gs.length > 1) spanM5.push(Math.max(...gs) - Math.min(...gs));
    /** ★画角の 1 コマ差 */
    const fov = (r.scene.camera.fovY * 180) / Math.PI;
    if (prevFov !== undefined) {
      const step = Math.abs(fov - prevFov);
      if (step > maxFovStep) { maxFovStep = step; maxFovAt = d; }
    }
    prevFov = fov;
  }

  const spanMed = med(spanFrac), offMed = med(centerOff), gapMed = med(focusGap);
  const ok1 = spanMed >= 0.60 && spanMed <= 0.75;
  console.log(`seed ${String(seed).padStart(3)}  主役 5 頭 = 馬番 ${top5.join(',')}   ${frames} コマ`);
  console.log(`   ① 帯が画面幅に占める割合   中央値 ${(spanMed * 100).toFixed(1)}%  `
    + `（範囲 ${(Math.min(...spanFrac) * 100).toFixed(1)}〜${(Math.max(...spanFrac) * 100).toFixed(1)}%） / 要求 60〜75%   ${ok1 ? '○' : '×'}`);
  const edgeMed = med(edgeFrac), edgeOffMed = med(edgeOff);
  const ok1e = edgeMed >= 0.60 && edgeMed <= 0.75;
  console.log(`   ①' ★絵の外縁で見た割合      中央値 ${(edgeMed * 100).toFixed(1)}%  `
    + `（範囲 ${(Math.min(...edgeFrac) * 100).toFixed(1)}〜${(Math.max(...edgeFrac) * 100).toFixed(1)}%） / 要求 60〜75%   ${ok1e ? '○' : '×'}`);
  console.log(`   ② 帯の中心の画面中央からのずれ 中央値 ${(offMed * 100).toFixed(1)}%（外縁で ${(edgeOffMed * 100).toFixed(1)}%・＋は右）`);
  console.log(`   ③ 注視点 − 主役 5 頭の加重中心  中央値 ${gapMed.toFixed(2)}m`
    + `（範囲 ${Math.min(...focusGap).toFixed(2)}〜${Math.max(...focusGap).toFixed(2)}m）`);
  console.log(`   ④ 画角の 1 コマ最大差       ${maxFovStep.toFixed(3)}°（${maxFovAt.toFixed(2)}s）`);
  console.log(`   ④' 主役 5 頭の実際の広がり  中央値 ${med(spanM5).toFixed(1)}m`
    + `（範囲 ${Math.min(...spanM5).toFixed(1)}〜${Math.max(...spanM5).toFixed(1)}m）`);
  console.log(`   ④'' カットの境目での画角  ${cutSteps.join(' / ') || 'なし'}`);
  console.log(`   ⑤ 画面内の総頭数           中央値 ${med(onScreenAll)} 頭 / 全 ${built.FIELD} 頭`
    + `（範囲 ${Math.min(...onScreenAll)}〜${Math.max(...onScreenAll)}）`);
  console.log('');
}
console.log('⚠️ 幾何だけの数字です。最終判定は実画面です。');
