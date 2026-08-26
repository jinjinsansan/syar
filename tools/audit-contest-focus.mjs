/**
 * ★**競り合いが画面に映っているか / 注視点が跳んでいないか**（読取専用）
 *
 *   ⚠️ 場面解決は実画面と同じ `auditSceneAt` を通します（R-30）。
 *   ⚠️ 製品コードは変更しません。時刻も乱数も使いません（憲法4）。
 */
import { CLIMAX_LEAD_COUNT, cameraBasis, posOf, project } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const SCRIPT = arg('script', 'v6');

console.log(`台本=${SCRIPT}  演出=なし（馬は動かしていません）\n`);
for (const seed of SEEDS) {
  const built = buildAuditRace({ seed });
  const clock = auditClock(built);
  const place = new Map(built.result.order.map((row, i) => {
    const g = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [g, row.finishPosition ?? i + 1];
  }));
  const top5 = [...place.entries()].filter(([, p]) => p <= CLIMAX_LEAD_COUNT).map(([g]) => g);
  /**
   * ★**跳びは「馬の動きとの差」で測ります。**
   *   ⚠️ ★注視点の 1 コマ移動量そのものを見てはいけません。時間圧縮が効いている区間では
   *      ★**馬自身が 1 コマ 2.7m 進みます**。実測でそれを「跳び 2.99m」と誤読しました（R-21）。
   */
  let prev = null, prevLead = null, maxJump = 0, jumpAt = 0, maxAbs = 0;
  let sec2 = 0, sec3 = 0, sec4 = 0, frames = 0, contestFrames = 0, maxOnAll = 0, sumOnAll = 0;
  const total = clock.introSec + clock.warp.displaySec;
  for (let f = 0; f <= Math.ceil(total * FPS); f++) {
    const d = f / FPS;
    if (d < clock.introSec) continue;
    const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT, { climax: false });
    if (r.scene.shot.id !== 'straight-contest') { prev = null; continue; }
    frames++;
    const lead = Math.max(...r.drawn.map((h) => h.s));
    if (prev !== null && prevLead !== null) {
      const j = Math.abs((r.scene.focusS - prev) - (lead - prevLead));
      if (j > maxJump) { maxJump = j; jumpAt = d; }
      const a = Math.abs(r.scene.focusS - prev);
      if (a > maxAbs) maxAbs = a;
    }
    prev = r.scene.focusS;
    prevLead = lead;
    const basis = cameraBasis(r.scene.camera);
    let on = 0;
    /**
     * ★**描かれている全馬**のうち画面内の頭数（着外も含む）。
     *   ⚠️ ★以前はここを「上位 5 頭のうち」しか数えておらず、
     *      ★**着外の馬が同じ画面に入って 10 頭が重なる**のを見落としていました
     *      （オーナー指摘・seed 99 残り218m）。
     */
    let onAll = 0;
    for (const h of r.scene.visibleHorses) {
      const p = posOf(built.course, h.s, h.w);
      const pr = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      if (pr.depth > 0 && pr.x >= 0 && pr.x <= W) {
        onAll++;
        if (top5.includes(h.gate)) on++;
      }
    }
    if (onAll > maxOnAll) maxOnAll = onAll;
    sumOnAll += onAll;
    if (on >= 2) { sec2 += 1 / FPS; contestFrames++; }
    if (on >= 3) sec3 += 1 / FPS;
    if (on >= 4) sec4 += 1 / FPS;
  }
  const cutSec = frames / FPS;
  console.log(`seed ${String(seed).padStart(3)}  競り合いカット 計 ${cutSec.toFixed(1)}秒`);
  console.log(`   ★画面に描かれる頭数（着外も含む）: 最大 ${maxOnAll} 頭 / 平均 ${(sumOnAll / Math.max(1, frames)).toFixed(1)} 頭`);
  console.log(`   主役が 2 頭以上 ${sec2.toFixed(1)}秒 (${(sec2 / cutSec * 100).toFixed(0)}%)` +
    ` / 3 頭以上 ${sec3.toFixed(1)}秒 / 4 頭以上 ${sec4.toFixed(1)}秒`);
  console.log(`   ★注視点が馬から離れる最大量 ${maxJump.toFixed(2)}m/コマ（${jumpAt.toFixed(2)}s）` +
    `  ／ 注視点の 1 コマ移動そのものは最大 ${maxAbs.toFixed(2)}m（馬もほぼ同じだけ進みます）`);
}
