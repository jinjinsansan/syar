/**
 * ★**俯瞰で馬が「ぴょんぴょん」する件の判断材料**（読取専用・#1）
 *
 *   ⚠️ ★製品コードを一切変えません。カメラ定義・台本・素材・着順・馬の位置に触れません。
 *      仮の値（見た目の完歩・代替カメラ）は**この道具の中だけ**で組み、画面には影響しません。
 *   ⚠️ ★乱数・時刻を使いません（憲法 4）。レース結果は読むだけです（憲法 3）。
 *
 * 【測る量を 2 つに分けます】
 *   (A) 画面基準 … 馬が**画面の中**をどれだけ動くか（引き継ぎ書 §3 と同じ量）
 *   (B) 地面基準 … 馬が**足元の地面に対して**どれだけ進んで見えるか
 *
 *   ★追従カメラでは (A) はほぼ 0 になります（カメラが馬を追うので当然）。
 *     走って見えるかを決めるのは (B) です。実馬は 1 完歩 7m ＝ 馬体 2.4m の
 *     **約 2.9 個ぶん**進みます。この値が小さいほど「その場で足踏み」に見えます。
 */
import {
  cameraBasis, posOf, project, broadcastCamera, broadcastV2ShotById,
  BROADCAST_STRIDE_M, HORSE_LENGTH_M,
} from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720;
const FPS = 30;
const SCRIPT = 'v5';
const IDEAL = BROADCAST_STRIDE_M / HORSE_LENGTH_M;   // 実馬 = 2.92 馬身/完歩

const built = buildAuditRace({ seed: RACE_DEFAULTS.seed });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const course = built.course;

/** ★その瞬間のカメラで「馬」と「1 完歩先の地面」を投影し、画面上の隔たりを測る */
function groundTravelPx(camera, s, w, strideM) {
  const basis = cameraBasis(camera);
  const pa = posOf(course, s, w);
  const pb = posOf(course, s + strideM, w);
  const a = project(camera, basis, { x: pa.x, y: pa.y, z: 0 });
  const b = project(camera, basis, { x: pb.x, y: pb.y, z: 0 });
  if (!(a.depth > 0) || !(b.depth > 0)) return undefined;
  return { travelPx: Math.hypot(b.x - a.x, b.y - a.y), bodyPx: HORSE_LENGTH_M * a.pxPerM, x: a.x };
}

const totalSec = clock.introSec + clock.warp.displaySec;
const perShot = new Map();

let prev;
for (let f = 0; ; f++) {
  const d = f / FPS;
  if (d > totalSec) break;
  const { scene, drawn, raceSec } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  const lead = drawn.reduce((m, h) => (h.s > m.s ? h : m), drawn[0]);
  if (lead === undefined) continue;
  const g = groundTravelPx(scene.camera, lead.s, lead.w, BROADCAST_STRIDE_M);
  if (g === undefined) continue;

  const id = scene.shot.id;
  if (!perShot.has(id)) perShot.set(id, { id, frames: 0, ratio: [], screenPx: [], fovDeg: [], sMin: Infinity, sMax: -Infinity });
  const rec = perShot.get(id);
  rec.frames++;
  rec.ratio.push(g.travelPx / g.bodyPx);
  rec.fovDeg.push(scene.camera.fovY * 180 / Math.PI);
  rec.sMin = Math.min(rec.sMin, lead.s);
  rec.sMax = Math.max(rec.sMax, lead.s);
  // (A) 画面基準: 同じ馬の画面上の x が 1 コマでどれだけ動いたか（カット内のみ）
  if (prev !== undefined && prev.id === id && prev.gate === lead.gate) {
    rec.screenPx.push(Math.abs(g.x - prev.x) * FPS);   // px/秒
  }
  prev = { id, gate: lead.gate, x: g.x, s: lead.s, raceSec };
}

const med = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length === 0 ? NaN : a[Math.floor(a.length / 2)]; };
const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : '—';

console.log(`\n★seed ${RACE_DEFAULTS.seed} / 台本 ${SCRIPT} / ${FPS}fps / 実馬の基準 = ${fmt(IDEAL)} 馬身per完歩\n`);
console.log('ショット                 秒    画角     (B)馬身/完歩  実馬比   (A)画面px/秒');
console.log('─'.repeat(78));
const rows = [...perShot.values()].sort((a, b) => a.sMin - b.sMin);
for (const r of rows) {
  const ratio = med(r.ratio);
  console.log(
    `${r.id.padEnd(22)} ${fmt(r.frames / FPS, 1).padStart(5)} ${fmt(med(r.fovDeg), 1).padStart(6)}°  `
    + `${fmt(ratio).padStart(10)}   ${fmt(ratio / IDEAL * 100, 0).padStart(4)}%  ${fmt(med(r.screenPx), 0).padStart(10)}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ★選択肢 1 / 2 の比較材料（`fourth-corner-high` のカット内で測る）
   ⚠️ 仮の値はこの道具の中だけ。製品のカメラ定義・完歩は変えていません。
   ══════════════════════════════════════════════════════════════════ */

const HIGH = broadcastV2ShotById('fourth-corner-high');
const P = HIGH.camera;

/** ★そのカットの代表コマ（先頭馬の位置と、そのとき実際に使われたカメラ）を集める */
const cutFrames = [];
for (let f = 0; ; f++) {
  const d = f / FPS;
  if (d > totalSec) break;
  const { scene, drawn, raceSec } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  if (scene.shot.id !== 'fourth-corner-high') continue;
  const lead = drawn.reduce((m, h) => (h.s > m.s ? h : m), drawn[0]);
  if (lead !== undefined) cutFrames.push({ d, raceSec, scene, lead });
}

/** ★真の走速（レース時計・m/秒）。表示時計では時間圧縮が乗るので使わない */
const trueSpeedOf = (raceSec, gate) => {
  const h = 0.1;
  const a = built.model.at(raceSec).find((x) => x.gate === gate);
  const b = built.model.at(raceSec + h).find((x) => x.gate === gate);
  return a === undefined || b === undefined ? NaN : (b.meters - a.meters) / h;
};

const speeds = cutFrames.map((c) => trueSpeedOf(c.raceSec, c.lead.gate)).filter(Number.isFinite);
const speed = med(speeds);

console.log(`\n\n★選択肢 1 — 「その俯瞰だけ見た目の完歩を長くする」`);
console.log(`   ${HIGH.id} のカット ${fmt(cutFrames.length / FPS, 1)} 秒 / 真の走速 ${fmt(speed)} m/秒\n`);
console.log('見た目の完歩   馬身/完歩   実馬比   完歩/秒   他カットとの差');
console.log('─'.repeat(66));
for (const X of [7, 9, 11, 14, 18, 22]) {
  const rs = cutFrames.map((c) => {
    const g = groundTravelPx(c.scene.camera, c.lead.s, c.lead.w, X);
    return g === undefined ? NaN : g.travelPx / g.bodyPx;
  }).filter(Number.isFinite);
  const r = med(rs);
  const hz = speed / X;
  const mark = X === BROADCAST_STRIDE_M ? '  ← 現行（全カット共通）' : `  脚が ${fmt(BROADCAST_STRIDE_M / X, 2)} 倍の速さになる`;
  console.log(`${String(X).padStart(9)} m ${fmt(r).padStart(11)}  ${fmt(r / IDEAL * 100, 0).padStart(5)}%  ${fmt(hz).padStart(8)}${mark}`);
}

console.log(`\n\n★選択肢 2 — 「俯瞰の位置を変えて走路方向の動きを増やす」`);
console.log(`   現行 preset: backM ${P.backM} / upM ${P.upM} / sideM ${P.sideM} / fovDeg ${P.fovDeg}`);
console.log(`   ⚠️ high-diag は along = -backM×0.45, across = max(sideM, backM×0.55), up = upM\n`);
console.log('backM  upM  sideM   仰角   馬身/完歩  実馬比   画面内の頭数');
console.log('─'.repeat(66));

const CAND = [
  { backM: P.backM, upM: P.upM,  sideM: P.sideM },   // 現行
  { backM: P.backM, upM: 12,     sideM: P.sideM },
  { backM: P.backM, upM: 18,     sideM: P.sideM },
  { backM: P.backM, upM: 26,     sideM: P.sideM },
  { backM: 30,      upM: 18,     sideM: P.sideM },
  { backM: 30,      upM: 26,     sideM: P.sideM },
  { backM: P.backM, upM: 18,     sideM: 24 },
];
for (const c of CAND) {
  const preset = { ...P, ...c };
  const rs = [], counts = [], elev = [];
  for (const fr of cutFrames) {
    const cam = broadcastCamera(course, {
      atS: fr.scene.focusS, atW: fr.scene.focusW, width: W, height: H,
      view: HIGH.view, preset,
    });
    const g = groundTravelPx(cam, fr.lead.s, fr.lead.w, BROADCAST_STRIDE_M);
    if (g === undefined) continue;
    rs.push(g.travelPx / g.bodyPx);
    const basis = cameraBasis(cam);
    let n = 0;
    for (const h of fr.lead === undefined ? [] : built.model.at(fr.raceSec)) {
      const p = posOf(course, h.meters, h.w ?? course.widthM / 2);
      const q = project(cam, basis, { x: p.x, y: p.y, z: 0 });
      if (q.depth > 0 && q.x > 0 && q.x < W && q.y > 0 && q.y < H) n++;
    }
    counts.push(n);
    const flat = Math.hypot(cam.eye.x - posOf(course, fr.scene.focusS, fr.scene.focusW).x,
                            cam.eye.y - posOf(course, fr.scene.focusS, fr.scene.focusW).y);
    elev.push(Math.atan2(cam.eye.z, flat) * 180 / Math.PI);
  }
  const r = med(rs);
  const cur = c.backM === P.backM && c.upM === P.upM && c.sideM === P.sideM ? '  ← 現行' : '';
  console.log(
    `${String(preset.backM).padStart(5)} ${String(preset.upM).padStart(4)} ${String(preset.sideM).padStart(6)}`
    + ` ${fmt(med(elev), 1).padStart(6)}° ${fmt(r).padStart(10)}  ${fmt(r / IDEAL * 100, 0).padStart(5)}%`
    + ` ${fmt(med(counts), 1).padStart(11)}${cur}`,
  );
}
