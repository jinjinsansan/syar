/**
 * ★**各カットで何頭が画面に入っているか**（読取専用・製品コードに触れません）
 *
 *   「攻防が見たい」という要望に対して、**いま何頭映っているのか**を先に数えます。
 *   ⚠️ 着順・馬の位置は読むだけ（憲法 3）。乱数・時刻は使いません（憲法 4）。
 *
 * 実行: npx tsx tools/audit-shot-coverage.mjs
 */
import { cameraBasis, posOf, project, HORSE_LENGTH_M } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
const built = buildAuditRace({ seed: RACE_DEFAULTS.seed });
const clock = auditClock(built, RACE_DEFAULTS.ownGate);
const course = built.course;
const totalSec = clock.introSec + clock.warp.displaySec;
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const per = new Map();
for (let f = 0; f / FPS <= totalSec; f += 1) {
  const d = f / FPS;
  const { scene, drawn } = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
  const basis = cameraBasis(scene.camera);
  let n = 0;
  for (const h of drawn) {
    const p = posOf(course, h.s, h.w);
    const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    if (q.depth > 0 && q.x > -40 && q.x < W + 40 && q.y > -40 && q.y < H + 40) n += 1;
  }
  const lead = drawn.reduce((m, x) => (x.s > m.s ? x : m), drawn[0]);
  /** ★先頭から 2 馬身以内・5 馬身以内にいる頭数（＝争っている頭数） */
  const within = (m) => drawn.filter((x) => lead.s - x.s <= m).length;
  const id = scene.shot.id;
  if (!per.has(id)) per.set(id, { frames: 0, inFrame: [], c2: [], c5: [] });
  const r = per.get(id);
  r.frames += 1; r.inFrame.push(n);
  r.c2.push(within(HORSE_LENGTH_M * 2)); r.c5.push(within(HORSE_LENGTH_M * 5));
}

console.log(`\n★seed ${RACE_DEFAULTS.seed} / 台本 ${SCRIPT} / ${FPS}fps（12 頭立て）\n`);
console.log('ショット                 秒   画面内の頭数   先頭から2馬身以内   先頭から5馬身以内');
console.log('─'.repeat(84));
for (const [id, r] of per) {
  console.log(`${id.padEnd(22)} ${(r.frames / FPS).toFixed(1).padStart(5)} ${med(r.inFrame).toFixed(1).padStart(11)} ${med(r.c2).toFixed(1).padStart(16)} ${med(r.c5).toFixed(1).padStart(18)}`);
}
console.log(`
★読み方
   「画面内」が「2馬身以内」より少なければ、★**争っている馬が画面の外**にいます。
   「2馬身以内」が 1 頭なら、そもそもその瞬間に競り合いは起きていません（カメラの問題ではない）。`);
