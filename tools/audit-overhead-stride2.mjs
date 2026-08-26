/** ★#1 の追加材料（読取専用・製品コードは変えていません） */
import {
  cameraBasis, posOf, project, broadcastCamera, broadcastV2ShotById,
  BROADCAST_STRIDE_M, HORSE_LENGTH_M,
} from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
const IDEAL = BROADCAST_STRIDE_M / HORSE_LENGTH_M;
const built = buildAuditRace({ seed: RACE_DEFAULTS.seed });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const course = built.course;
const med = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length === 0 ? NaN : a[Math.floor(a.length / 2)]; };
const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : '—';

function ratioAt(camera, s, w, strideM) {
  const basis = cameraBasis(camera);
  const pa = posOf(course, s, w), pb = posOf(course, s + strideM, w);
  const a = project(camera, basis, { x: pa.x, y: pa.y, z: 0 });
  const b = project(camera, basis, { x: pb.x, y: pb.y, z: 0 });
  if (!(a.depth > 0) || !(b.depth > 0)) return NaN;
  return Math.hypot(b.x - a.x, b.y - a.y) / (HORSE_LENGTH_M * a.pxPerM);
}
const speedOf = (raceSec, gate) => {
  const a = built.model.at(raceSec).find((x) => x.gate === gate);
  const b = built.model.at(raceSec + 0.1).find((x) => x.gate === gate);
  return a === undefined || b === undefined ? NaN : (b.meters - a.meters) / 0.1;
};

/* ── ★走っているコマだけで測り直す（発走待機を除く） ───────── */
const totalSec = clock.introSec + clock.warp.displaySec;
const byShot = new Map();
const cutFrames = [];
for (let f = 0; ; f++) {
  const d = f / FPS;
  if (d > totalSec) break;
  const { scene, drawn, raceSec } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  const lead = drawn.reduce((m, h) => (h.s > m.s ? h : m), drawn[0]);
  if (lead === undefined) continue;
  const v = speedOf(raceSec, lead.gate);
  const r = ratioAt(scene.camera, lead.s, lead.w, BROADCAST_STRIDE_M);
  if (!Number.isFinite(r)) continue;
  if (!byShot.has(scene.shot.id)) byShot.set(scene.shot.id, { all: [], run: [], order: byShot.size });
  const rec = byShot.get(scene.shot.id);
  rec.all.push(r);
  if (v > 8) rec.run.push(r);
  if (scene.shot.id === 'fourth-corner-high') cutFrames.push({ raceSec, scene, lead });
}
console.log(`\n★走っているコマだけ（先頭 8m/秒 超）で測り直す — 実馬 = ${fmt(IDEAL)} 馬身/完歩\n`);
console.log('ショット                全コマ   走行中のみ   実馬比');
console.log('─'.repeat(56));
for (const [id, r] of [...byShot.entries()].sort((a, b) => a[1].order - b[1].order)) {
  const run = med(r.run);
  console.log(`${id.padEnd(22)} ${fmt(med(r.all)).padStart(6)} ${fmt(run).padStart(11)}   ${fmt(run / IDEAL * 100, 0).padStart(4)}%`);
}

/* ── ★どの成分が効いているのか（真の梃子を探す） ───────────── */
const HIGH = broadcastV2ShotById('fourth-corner-high');
const P = HIGH.camera;
console.log(`\n\n★何が走路方向の動きを潰しているのか（${HIGH.id} / view=${HIGH.view}）`);
console.log(`   along = -backM×0.45 = ${fmt(-P.backM * 0.45, 1)}m,  across = max(sideM, backM×0.55) = ${fmt(Math.max(P.sideM, P.backM * 0.55), 1)}m,  up = ${P.upM}m\n`);
console.log('backM  upM sideM  along  across   仰角   馬身/完歩  実馬比  頭数  ねらい');
console.log('─'.repeat(88));
const CAND = [
  [P.backM, P.upM, P.sideM, '現行'],
  [P.backM, 26,    P.sideM, '高さだけ上げる'],
  [24,      P.upM, P.sideM, '後ろ成分を減らす'],
  [14,      P.upM, P.sideM, '後ろ成分をさらに減らす'],
  [14,      P.upM, 22,      '後ろを減らし横へ離す'],
  [14,      18,    22,      '後ろを減らし＋高く'],
  [24,      18,    22,      '折衷'],
];
for (const [backM, upM, sideM, note] of CAND) {
  const preset = { ...P, backM, upM, sideM };
  const along = -backM * 0.45, across = Math.max(sideM, backM * 0.55);
  const rs = [], counts = [], elev = [];
  for (const fr of cutFrames) {
    const cam = broadcastCamera(course, { atS: fr.scene.focusS, atW: fr.scene.focusW, width: W, height: H, view: HIGH.view, preset });
    const r = ratioAt(cam, fr.lead.s, fr.lead.w, BROADCAST_STRIDE_M);
    if (!Number.isFinite(r)) continue;
    rs.push(r);
    const c = posOf(course, fr.scene.focusS, fr.scene.focusW);
    elev.push(Math.atan2(cam.eye.z, Math.hypot(cam.eye.x - c.x, cam.eye.y - c.y)) * 180 / Math.PI);
    const basis = cameraBasis(cam);
    let n = 0;
    for (const h of built.model.at(fr.raceSec)) {
      const p = posOf(course, h.meters, h.w ?? course.widthM / 2);
      const q = project(cam, basis, { x: p.x, y: p.y, z: 0 });
      if (q.depth > 0 && q.x > 0 && q.x < W && q.y > 0 && q.y < H) n++;
    }
    counts.push(n);
  }
  const r = med(rs);
  console.log(
    `${String(backM).padStart(5)} ${String(upM).padStart(4)} ${String(sideM).padStart(5)}`
    + ` ${fmt(along, 1).padStart(6)} ${fmt(across, 1).padStart(7)} ${fmt(med(elev), 1).padStart(6)}°`
    + ` ${fmt(r).padStart(10)} ${fmt(r / IDEAL * 100, 0).padStart(5)}% ${fmt(med(counts), 1).padStart(5)}  ${note}`,
  );
}
