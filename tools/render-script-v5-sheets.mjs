/**
 * ★**現行 v4 と候補 v5 の比較シート**（読取専用・実装指示 §比較シート）
 *
 *   ⚠️ ★**同じ時点**を並べます。撮った連番からその時刻のコマを取り出すだけで、
 *      後から時間位置を合わせる調整はしていません。
 *   ⚠️ ★**Canvas 原寸 1280×720** を上下とも**同じ倍率**で縮小します。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { broadcastV2ShotAt, ovalCourse } from '@star/render';
import { buildAuditRace, auditClock, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const OUT = path.resolve('out/2d-script-v5');
const SEQ = path.join(OUT, '_seq');
mkdirSync(OUT, { recursive: true });
if (!existsSync(path.join(OUT, 'gate.json'))) {
  throw new Error('★gate.json が無い。先に tools/capture-script-v5.mjs を走らせること');
}
const G = JSON.parse(readFileSync(path.join(OUT, 'gate.json'), 'utf8'));

const FPS = G.fps;
const W = 1280;
const H = 720;
const SCALE = 0.42;
const CW = Math.round(W * SCALE);
const CH = Math.round(H * SCALE);
const LABEL_H = 34;

/**
 * ★§比較シートの 5 時点（レース進行率）
 * ⚠️ ★**台本の境目に合わせてあります。**（`SCRIPT_STARHORSE_V1` の `until`）
 *      発走 0-0.150 ／ 1 角 -0.330 ／ 横 -0.500 ／ **第4コーナー -0.660** ／
 *      **直線 -0.940** ／ ゴール前 -1.0
 *    最初は第4コーナーを 0.68 で撮っていましたが、それは**境目を越えて直線カット**でした。
 *    → 俯瞰に変えた `fourth-corner-high` が 1 枚も写らないので、0.60 に直しました。
 */
const POINTS = [
  { key: 'start', label: '発走', ratio: 0.04 },
  { key: 'fourth-corner', label: '第4コーナー', ratio: 0.60 },
  { key: 'straight-entry', label: '直線入口', ratio: 0.70 },
  { key: 'straight-mid', label: '直線中盤', ratio: 0.86 },
  { key: 'pre-finish', label: 'ゴール前', ratio: 0.96 },
];

/**
 * ★その時点で実際に選ばれているショット。
 * ⚠️ ★**台本表をここへ写しません。** `@star/render` の判定をそのまま通します
 *    （写すと本体と食い違ったときに気づけません）。
 */
const shotAt = (variant, ratio) => broadcastV2ShotAt(
  ovalCourse(1600, { widthM: 20, turn: 'left' }), ratio * 1600, false, 40,
  { fourthCornerFront: true, script: variant === 'current' ? 'v4' : 'v5' },
).id;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** ★進行率 → 表示秒（二分探索）。撮影ツールと同じ求め方 */
function displaySecOfRatio(built, clock, ratio) {
  const targetM = ratio * built.DIST;
  let lo = 0; let hi = clock.warp.displaySec;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const leader = Math.max(...built.model.at(clock.warp.raceSecAt(mid)).map((h) => h.meters));
    if (leader >= targetM) hi = mid; else lo = mid;
  }
  return hi;
}

const frameFile = (seed, variant, sec) =>
  path.join(SEQ, `seed${seed}-${variant}`, `f${String(Math.round(sec * FPS)).padStart(4, '0')}.jpg`);

async function seedSheet(seed) {
  const built = buildAuditRace({ seed });
  const clock = auditClock(built, RACE_DEFAULTS.ownGate);
  const cols = POINTS.map((p) => ({ ...p, sec: displaySecOfRatio(built, clock, p.ratio) }));
  const width = CW * cols.length + 8;
  const height = (CH + LABEL_H) * 2 + 48;
  const parts = [];
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<text x="8" y="19" fill="#ffd60a" font-size="15" font-family="monospace">`
    + `seed ${seed} — 上: 現行 v4 ／ 下: 候補 v5</text>`
    + `<text x="8" y="35" fill="#8a8a8a" font-size="11" font-family="monospace">`
    + `★変えたのは 2 ショットだけ（第4コーナー 正面→俯瞰 / 直線 正面→横追従）。`
    + `Canvas 原寸 1280x720 を上下とも同じ ${SCALE} 倍で縮小。</text>`;

  for (const [vi, variant] of ['current', 'v5'].entries()) {
    for (const [ci, c] of cols.entries()) {
      const f = frameFile(seed, variant, c.sec);
      if (!existsSync(f)) continue;
      const x = ci * CW + 4;
      const y = vi * (CH + LABEL_H) + 44;
      parts.push({ file: f, left: x, top: y + LABEL_H });
      svg += `<rect x="${x}" y="${y}" width="${CW}" height="${LABEL_H}" fill="#1e1b17"/>`
        + `<rect x="${x}" y="${y}" width="5" height="${LABEL_H}" fill="${variant === 'current' ? '#8a8a8a' : '#3fbf6f'}"/>`
        + `<text x="${x + 10}" y="${y + 14}" fill="#efe9dc" font-size="11" font-family="monospace">`
        + `${esc(c.label)}  進行 ${(c.ratio * 100).toFixed(0)}%  ${c.sec.toFixed(1)}s</text>`
        + `<text x="${x + 10}" y="${y + 28}" fill="#bdb6a8" font-size="10" font-family="monospace">`
        + `${variant === 'current' ? '現行 v4' : '候補 v5'}  ${esc(shotAt(variant, c.ratio))}</text>`;
    }
  }
  svg += '</svg>';
  const composed = [];
  for (const p of parts) {
    composed.push({ input: await sharp(p.file).resize({ width: CW, height: CH }).png().toBuffer(),
      left: p.left, top: p.top });
  }
  await sharp({ create: { width, height, channels: 4, background: '#0d0b09' } })
    .composite([...composed, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(OUT, `seed-${seed}-comparison.png`));
  console.log(`  seed-${seed}-comparison.png`);
  return cols;
}

const seeds = [...new Set(G.videos.map((v) => v.seed))].sort((a, b) => a - b);
for (const seed of seeds) await seedSheet(seed);

/* ★全 seed を 1 枚に（直線中盤だけ、現行 vs 候補） */
if (seeds.length > 1) {
  const rows = [];
  for (const seed of seeds) {
    const built = buildAuditRace({ seed });
    const clock = auditClock(built, RACE_DEFAULTS.ownGate);
    rows.push({ seed, sec: displaySecOfRatio(built, clock, 0.86) });
  }
  const width = CW * 2 + 8;
  const height = (CH + LABEL_H) * rows.length + 44;
  const parts = [];
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<text x="8" y="19" fill="#ffd60a" font-size="15" font-family="monospace">`
    + `全 seed — 直線中盤（進行 86%）／左: 現行 v4  右: 候補 v5</text>`
    + `<text x="8" y="35" fill="#8a8a8a" font-size="11" font-family="monospace">`
    + `★現行の 18.6 秒カットが動いている時点。同じ倍率で縮小。</text>`;
  rows.forEach((r, ri) => {
    ['current', 'v5'].forEach((variant, ci) => {
      const f = frameFile(r.seed, variant, r.sec);
      if (!existsSync(f)) return;
      const x = ci * CW + 4;
      const y = ri * (CH + LABEL_H) + 42;
      parts.push({ file: f, left: x, top: y + LABEL_H });
      svg += `<rect x="${x}" y="${y}" width="${CW}" height="${LABEL_H}" fill="#1e1b17"/>`
        + `<rect x="${x}" y="${y}" width="5" height="${LABEL_H}" fill="${variant === 'current' ? '#8a8a8a' : '#3fbf6f'}"/>`
        + `<text x="${x + 10}" y="${y + 21}" fill="#efe9dc" font-size="12" font-family="monospace">`
        + `seed ${r.seed}  ${variant === 'current' ? '現行 v4' : '候補 v5'}  ${r.sec.toFixed(1)}s</text>`;
    });
  });
  svg += '</svg>';
  const composed = [];
  for (const p of parts) {
    composed.push({ input: await sharp(p.file).resize({ width: CW, height: CH }).png().toBuffer(),
      left: p.left, top: p.top });
  }
  await sharp({ create: { width, height, channels: 4, background: '#0d0b09' } })
    .composite([...composed, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(OUT, 'all-seeds-comparison.png'));
  console.log('  all-seeds-comparison.png');
}

console.log(`\n→ ${OUT}`);
