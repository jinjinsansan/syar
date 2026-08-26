/**
 * ★**最後の直線で、上位 5 頭は実際どれだけ伸びているのか**（読取専用）
 *
 *   オーナー要求は「この大きさで 4〜5 頭がせめぎ合う」。
 *   ★成否を決めるのは**カメラではなく、馬群が実際に何 m に収まっているか**です。
 *   ★画面に入る走路は 1280px ÷（馬 2.4m の px 高）× 2.4m で決まります。
 *
 * ⚠️ 場面解決は実画面と同じ `auditSceneAt` を通します（R-30・式を作り直さない）。
 * ⚠️ 製品コードは変更しません。時刻も乱数も使いません（憲法4）。
 */
import { cameraBasis, posOf, project, CLIMAX_LEAD_COUNT } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, HORSE_H_M = 2.4;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const SCRIPT = arg('script', 'v6');
const CLIMAX = arg('climax', 'off') !== 'on';
const NOFRAME = SCRIPT === 'v6' ? ['finish-line'] : undefined;

console.log(`台本=${SCRIPT}  演出=${CLIMAX ? 'なし' : 'あり'}`);
console.log('★「必要な幅」= 上位5頭の前後の伸び + 馬1頭の絵(4.1m)。これが画面の幅より広いと5頭は入りません\n');

for (const seed of SEEDS) {
  const built = buildAuditRace({ seed });
  const clock = auditClock(built);
  const place = new Map(built.result.order.map((row, i) => {
    const g = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [g, row.finishPosition ?? i + 1];
  }));
  const top5 = [...place.entries()].filter(([, p]) => p <= CLIMAX_LEAD_COUNT).map(([g]) => g);
  console.log(`seed ${String(seed).padStart(3)}  確定上位5頭 = 馬番 ${top5.join(',')}`);
  console.log('  残り     ショット          画面の幅   上位5頭の伸び  必要な幅   画面内(上位5)  馬高比');
  const total = clock.introSec + clock.warp.displaySec;
  for (let d = clock.introSec; d <= total; d += 0.1) {
    const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT,
      { climax: CLIMAX ? false : true, ...(NOFRAME ? { noContenderFrameShots: NOFRAME } : {}) });
    const lead = Math.max(...r.drawn.map((h) => h.s));
    const remain = built.DIST - lead;
    if (remain > 620 || remain < 0) continue;
    if (Math.round(remain) % 60 > 1) continue;
    const basis = cameraBasis(r.scene.camera);
    // ★馬 1 頭の画面高 → 画面に入る走路の幅（m）
    const p0 = posOf(built.course, lead, built.course.widthM / 2);
    const foot = project(r.scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
    const head = project(r.scene.camera, basis, { x: p0.x, y: p0.y, z: HORSE_H_M });
    const hpx = Math.max(1e-6, foot.y - head.y);
    const frameM = (W / hpx) * HORSE_H_M;
    const ss = r.drawn.filter((h) => top5.includes(h.gate)).map((h) => h.s);
    const spread = Math.max(...ss) - Math.min(...ss);
    let onScreen = 0;
    for (const h of r.drawn) {
      if (!top5.includes(h.gate)) continue;
      const p = posOf(built.course, h.s, h.w);
      const f = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      if (f.depth > 0 && f.x >= 0 && f.x <= W) onScreen += 1;
    }
    const need = spread + 2.4 * 1.71;
    console.log('  ' + String(Math.round(remain)).padStart(4) + 'm   ' + r.scene.shot.id.padEnd(19) +
      frameM.toFixed(1).padStart(6) + 'm' + spread.toFixed(1).padStart(12) + 'm' +
      need.toFixed(1).padStart(11) + 'm' + (need <= frameM ? ' ○' : ' ★×') +
      String(onScreen).padStart(8) + '頭' + ((hpx / H) * 100).toFixed(1).padStart(8) + '%');
  }
  console.log('');
}
