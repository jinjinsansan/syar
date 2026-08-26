/**
 * ★**第4コーナーのカットを、どこで切ればよいかを測る**（読取専用）
 *
 * 【なぜ要るか】
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §3-2:
 *   「馬が現行素材で自然に見える角度で終える」「**真正面へ向く前に**直線へハードカット」。
 *   ★そのためには**カット境界（`until`）と向きの角度の対応**が要ります。目分量で置かない。
 *
 * 【★測るもの】
 *   先頭馬の位置 s ごとに
 *     ① 向きの角度 viewDeg（斜め前素材は α=12°＝viewDeg 168° で描かれている）
 *     ② 左右反転の符号（`forwardDx`）が変わる地点
 *     ③ その s が台本の `until`（距離の比）でいくつか
 *
 * ⚠️ 製品コードは変更しません。着順・馬の位置も読むだけです（憲法3）。
 * ⚠️ 時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-corner-cut-window.mjs
 */
import { posOf, cameraBasis, project, broadcastV2ShotById, resolveBroadcastV2Scene } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
const SEED = RACE_DEFAULTS.seed;
const built = buildAuditRace({ seed: SEED });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const DIST = built.DIST;

/** そのコマの「先頭馬の向きの角度」と「進行方向の画面上の符号」（scene の実カメラで） */
function viewOf(scene, drawn) {
  const lead = drawn.reduce((a, h) => (h.s > a.s ? h : a));
  const cam = scene.camera;
  const basis = cameraBasis(cam);
  const p0 = posOf(built.course, lead.s, lead.w);
  const p1 = posOf(built.course, lead.s + 1, lead.w);
  const f = { x: p1.x - p0.x, y: p1.y - p0.y };
  const v = { x: p0.x - cam.eye.x, y: p0.y - cam.eye.y };
  const nf = Math.hypot(f.x, f.y), nv = Math.hypot(v.x, v.y);
  const cosT = Math.max(-1, Math.min(1, (f.x * v.x + f.y * v.y) / (nf * nv)));
  const q0 = project(cam, basis, { x: p0.x, y: p0.y, z: 0 });
  const q1 = project(cam, basis, { x: p1.x, y: p1.y, z: 0 });
  return { viewDeg: (Math.acos(cosT) * 180) / Math.PI, forwardDx: q1.x - q0.x, leadS: lead.s };
}

console.log(`★seed ${SEED} / 台本 ${SCRIPT} / ${FPS}fps`);
console.log(`★斜め前素材は α=12°（＝ viewDeg 168°）で描かれています。ここから離れるほど絵が合いません。`);
console.log(`★左右反転は forwardDx の符号が変わる瞬間（＝真正面）に起きます。\n`);

const total = clock.introSec + clock.warp.displaySec;
const rows = [];
for (let f = 0; f / FPS <= total; f += 1) {
  const d = f / FPS;
  const { scene, drawn } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  if (scene.shot.id !== 'fourth-corner-front') continue;
  rows.push({ d, ...viewOf(scene, drawn) });
}
if (rows.length === 0) throw new Error('★fourth-corner-front が出てきません');

console.log('  表示秒   先頭 s(m)  until(比)   向きの角度   168°からのずれ  反転の符号');
for (const [i, r] of rows.entries()) {
  if (i % 3 !== 0 && i !== rows.length - 1) continue;
  console.log(
    `  ${r.d.toFixed(2).padStart(6)}s`
    + `  ${r.leadS.toFixed(0).padStart(8)}`
    + `  ${(r.leadS / DIST).toFixed(4).padStart(9)}`
    + `  ${r.viewDeg.toFixed(1).padStart(10)}°`
    + `  ${(r.viewDeg - 168).toFixed(1).padStart(13)}°`
    + `  ${r.forwardDx < 0 ? '  −（反転）' : '  ＋'}`,
  );
}

/* ── ★反転の地点 ── */
const flips = [];
for (let i = 1; i < rows.length; i += 1) {
  if ((rows[i].forwardDx < 0) !== (rows[i - 1].forwardDx < 0)) flips.push(rows[i]);
}
console.log(`\n★左右反転  ${flips.length} 回`);
for (const f of flips) {
  console.log(`   表示 ${f.d.toFixed(2)}s  先頭 ${f.leadS.toFixed(0)}m  until ${(f.leadS / DIST).toFixed(4)}  向き ${f.viewDeg.toFixed(1)}°`);
}

/* ── ★「168°から ±N° 以内」に収まる窓 ── */
console.log('\n★斜め前素材が使える窓（168°からのずれで測る）');
console.log('  許容ずれ   その窓の until      長さ(秒)   反転を含むか');
for (const tol of [8, 10, 12, 14, 16, 20]) {
  const inWin = rows.filter((r) => Math.abs(r.viewDeg - 168) <= tol);
  if (inWin.length === 0) { console.log(`  ±${String(tol).padStart(2)}°     （該当なし）`); continue; }
  const from = inWin[0], to = inWin[inWin.length - 1];
  /** ★連続しているか（窓が 2 つに割れていないか） */
  const contiguous = inWin.length === rows.filter((r) => r.d >= from.d && r.d <= to.d).length;
  const hasFlip = flips.some((f) => f.d > from.d && f.d <= to.d);
  console.log(
    `  ±${String(tol).padStart(2)}°   ${(from.leadS / DIST).toFixed(4)} 〜 ${(to.leadS / DIST).toFixed(4)}`
    + `   ${((to.d - from.d)).toFixed(2).padStart(6)}s`
    + `   ${hasFlip ? '★含む' : 'なし'}`
    + `${contiguous ? '' : '   ⚠️ 窓が割れています'}`,
  );
}

/* ── ★いまの台本の窓 ── */
const cur = broadcastV2ShotById('fourth-corner-front');
console.log(`\n★いまの台本（v5）でのこのカット`);
console.log(`   until ${(rows[0].leadS / DIST).toFixed(4)} 〜 ${(rows[rows.length - 1].leadS / DIST).toFixed(4)}`
  + `   ${(rows[rows.length - 1].d - rows[0].d).toFixed(2)}s`
  + `   向き ${Math.min(...rows.map((r) => r.viewDeg)).toFixed(1)}° 〜 ${Math.max(...rows.map((r) => r.viewDeg)).toFixed(1)}°`);
console.log(`   ★168°からのずれ 最大 ${Math.max(...rows.map((r) => Math.abs(r.viewDeg - 168))).toFixed(1)}°`);
console.log(`   ★カメラ ${JSON.stringify(cur.camera)}`);
console.log('\n⚠️ 幾何だけの数字です。最終判定は実画面です。');
