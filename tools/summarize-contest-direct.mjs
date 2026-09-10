import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'out/contest-direct-review';
const before = JSON.parse(readFileSync(`${root}/baseline-42/frames.json`, 'utf8'));
const after = JSON.parse(readFileSync(`${root}/revised-42/frames.json`, 'utf8'));
const norm = id => id === 'straight-field' ? 'homestretch-front' : id;
const cuts = data => data.frames.filter((f, i, a) => !i || f.diag.shot !== a[i - 1].diag.shot)
  .map(f => ({ sec: f.sec, shot: norm(f.diag.shot) }));
if (JSON.stringify(cuts(before)) !== JSON.stringify(cuts(after))) throw new Error('Cut times changed');
let phases = 0;
for (let i = 0; i < before.frames.length; i++) {
  const a = before.frames[i], b = after.frames[i];
  if (a.sec !== b.sec) throw new Error('Capture times differ');
  for (const h of a.diag.horses) {
    const match = b.diag.horses.find(k => k.gate === h.gate);
    if (match && Math.abs(match.phase - h.phase) > 1e-8) throw new Error('Gait phase changed');
    if (match) phases++;
  }
}
const overlap = (b, r) => Math.max(0, Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x))
  * Math.max(0, Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y));
const summarize = (data, map) => {
  const frames = data.frames.filter(f => f.diag.shot === 'straight-contest');
  let clipped = 0, obscured = 0;
  const heights = [], complete = [];
  for (const f of frames) {
    const boxes = f.diag.boxes ?? [];
    const n = boxes.filter(b => b.x >= 0 && b.x + b.w <= 1280).length;
    complete.push(n);
    if (n < boxes.length) clipped++;
    if (boxes.some(b => overlap(b, map) > 0 || overlap(b, { x: 930, y: 34, w: 314, h: 220 }) > 0)) obscured++;
    heights.push(...boxes.map(b => b.h / 720));
  }
  heights.sort((a, b) => a - b);
  return { frames: frames.length, framesWithClippedBody: clipped, framesWithHudOverlap: obscured,
    minCompleteBodies: Math.min(...complete), medianHorseHeightRatio: heights[Math.floor(heights.length / 2)] };
};
const unchanged = [10, 16, 22, 28, 34, 38, 46, 68, 74].map(sec => {
  const sha = tag => createHash('sha256').update(readFileSync(`out/deformed-review/direct-${tag}-${sec}.png`)).digest('hex');
  return { sec, identical: sha('baseline') === sha('candidate') };
});
const result = { fps: before.fps, cuts: cuts(after), sharedGaitPhasesChecked: phases,
  before: summarize(before, { x: 40, y: 321, w: 264, h: 209 }),
  after: summarize(after, { x: 330, y: 48, w: 200, h: 156 }), unchanged };
writeFileSync(`${root}/comparison.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
