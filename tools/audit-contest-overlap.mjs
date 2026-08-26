/**
 * ★**γ を上げたときの密集の副作用を数える**（指示書 3-4・読取専用）
 *
 *   先頭が締まると 2D の板が重なり、馬番・鞍布が読めなくなる恐れがあります
 *   （side-v9 の検証で既知）。★目視ではなく**画面上の隔たり**で数えます。
 *
 *   「重なり」= 隣り合う 2 頭の画面上の距離が、馬体の幅の半分未満。
 *
 * ⚠️ 乱数・時刻を使いません（憲法 4）。着順・馬の位置は読むだけです（憲法 3）。
 *
 * 実行: npx tsx tools/audit-contest-overlap.mjs
 */
import { DEFAULT_RACE_BALANCE } from '@star/race-engine';
import { cameraBasis, posOf, project, HORSE_LENGTH_M } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
const GAMMAS = [1.0, 1.3, 1.6];
/** ★決着部分だけを見る（比較映像と同じ窓） */
const FROM = 34.0, TO = 46.2;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

console.log(`\n★seed ${RACE_DEFAULTS.seed} / 表示 ${FROM}〜${TO}s（決着部分）/ ${FPS}fps\n`);
console.log('γ      画面内の頭数   重なっている組   いちばん近い 2 頭の隔たり   HUD の裏に入る頭数');
console.log('─'.repeat(92));

for (const g of GAMMAS) {
  const balance = { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: g };
  const built = buildAuditRace({ seed: RACE_DEFAULTS.seed, balance });
  const clock = auditClock(built, RACE_DEFAULTS.ownGate);
  const course = built.course;
  const inFrame = [], overlaps = [], nearest = [], behindHud = [];
  for (let f = 0; FROM + f / FPS <= TO; f += 1) {
    const d = FROM + f / FPS;
    const { scene, drawn } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
    const basis = cameraBasis(scene.camera);
    const pts = [];
    for (const h of drawn) {
      const p = posOf(course, h.s, h.w);
      const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      if (!(q.depth > 0) || q.x < -60 || q.x > W + 60) continue;
      pts.push({ x: q.x, y: q.y, bodyPx: HORSE_LENGTH_M * q.pxPerM });
    }
    if (pts.length === 0) continue;
    inFrame.push(pts.length);
    pts.sort((a, b) => a.x - b.x);
    let ov = 0, near = Infinity;
    for (let i = 1; i < pts.length; i += 1) {
      const dx = Math.abs(pts[i].x - pts[i - 1].x);
      const width = (pts[i].bodyPx + pts[i - 1].bodyPx) / 2;
      if (dx < width * 0.5) ov += 1;
      near = Math.min(near, dx / width);
    }
    overlaps.push(ov);
    if (Number.isFinite(near)) nearest.push(near);
    /**
     * ★左下の COURSE 表示（`drawCourseMinimap`）と右上の順位表の矩形。
     *   ⚠️ ★実測した位置ではなく、実画面の絵から読んだおおよその矩形です（目分量）。
     */
    const hidden = pts.filter((p) =>
      (p.x < 320 && p.y > 320 && p.y < 520) || (p.x > 930 && p.y < 250)).length;
    behindHud.push(hidden);
  }
  console.log(`${g.toFixed(1)} ${med(inFrame).toFixed(1).padStart(11)} 頭 ${med(overlaps).toFixed(1).padStart(13)} 組`
    + ` ${med(nearest).toFixed(2).padStart(20)} 馬体分 ${med(behindHud).toFixed(1).padStart(14)} 頭`);
}
console.log(`
★読み方
   「重なっている組」= 画面上の隔たりが馬体の半分未満の隣接ペア。増えるほど板が重なります。
   「HUD の裏」は★おおよその矩形での目安です（実測ではありません）。`);
