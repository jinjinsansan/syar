/**
 * ★**実画面の既存ショット比較シート**（読取専用・追加指示 §8/§11）
 *
 *   ⚠️ ★**Canvas 原寸 1280×720 のまま**並べます。片方だけ拡大しません。
 *   ⚠️ ★採否は書きません。ラベルは幾何監査の測定値をそのまま載せます。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('out/2d-existing-shot-gate');
const SRC = path.join(OUT, '_actual');
mkdirSync(OUT, { recursive: true });
if (!existsSync(path.join(OUT, 'actual-capture.json'))) {
  throw new Error('★actual-capture.json が無い。先に tools/capture-existing-shot-actual.mjs を走らせること');
}
const C = JSON.parse(readFileSync(path.join(OUT, 'actual-capture.json'), 'utf8'));

const W = 1280;
const H = 720;
const SCALE = 0.5;              // ★全ショットを**同じ**倍率で縮小（片方だけ拡大しない）
const CW = Math.round(W * SCALE);
const CH = Math.round(H * SCALE);
const LABEL_H = 40;
const ROLE_COLOR = { A: '#3fbf6f', B: '#4d8ee0', C: '#c9503f', baseline: '#8a8a8a' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sheet(file, title, rows, shotIdsDefault) {
  const colsOf = (r) => r.shotIds ?? shotIdsDefault;
  const width = CW * Math.max(...rows.map((r) => colsOf(r).length)) + 8;
  const height = (CH + LABEL_H + 6) * rows.length + 44;
  const parts = [];
  /**
   * ⚠️ ★ここに全面の背景矩形を置くと**写真を覆い隠します**（一度それで真っ黒になりました）。
   *    下地は composite の base 側で塗ってあるので、ここは文字と枠だけにします。
   */
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<text x="8" y="19" fill="#ffd60a" font-size="15" font-family="monospace">${esc(title)}</text>`
    + `<text x="8" y="35" fill="#8a8a8a" font-size="11" font-family="monospace">`
    + `★実ブラウザの通常 /race（勝負服・毛色・鞍布・HUD すべて有効）。Canvas 原寸 1280x720 を`
    + ` 同じ ${SCALE} 倍で縮小。ラベルは幾何監査の測定値。</text>`;

  rows.forEach((r, ri) => {
    colsOf(r).forEach((id, ci) => {
      const c = C.captured.find((x) => x.seed === r.seed && x.point === r.point && x.shotId === id);
      if (c === undefined) return;
      const x = ci * CW + 4;
      const y = ri * (CH + LABEL_H + 6) + 42;
      parts.push({ input: path.join(SRC, c.file), left: x, top: y + LABEL_H, ...{} });
      const role = c.geometryRole ?? 'C';
      svg += `<rect x="${x}" y="${y}" width="${CW}" height="${LABEL_H}" fill="#1e1b17"/>`
        + `<rect x="${x}" y="${y}" width="5" height="${LABEL_H}" fill="${ROLE_COLOR[role]}"/>`
        + `<text x="${x + 10}" y="${y + 15}" fill="#efe9dc" font-size="11" font-family="monospace">`
        + `seed ${c.seed}  ${esc(c.pointLabel)}  進行 ${(c.progressRatio * 100).toFixed(0)}%  ${esc(id)}</text>`
        + `<text x="${x + 10}" y="${y + 31}" fill="#bdb6a8" font-size="10" font-family="monospace">`
        + `target=${esc(c.target)}  可視 ${c.fullCount}/${c.partialCount}/${c.offCount}`
        + `  上位2 ${c.top2Visible ? '○' : '×'} 3 ${c.top3Visible ? '○' : '×'} 4 ${c.top4Visible ? '○' : '×'}`
        + `  馬高比 ${c.maxHeightRatio}</text>`
        + `<text x="${x + CW - 8}" y="${y + 22}" fill="${ROLE_COLOR[role]}" font-size="17"`
        + ` font-family="monospace" text-anchor="end">${role === 'baseline' ? '基準' : role}</text>`;
    });
  });
  svg += '</svg>';

  const resized = [];
  for (const p of parts) {
    resized.push({ input: await sharp(p.input).resize({ width: CW, height: CH }).png().toBuffer(),
      left: p.left, top: p.top });
  }
  await sharp({ create: { width, height, channels: 4, background: '#0d0b09' } })
    .composite([...resized, { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(OUT, file));
  console.log(`  ${file}`);
}

const NAME = { default: 'seed42', contest: 'contest', solo: 'solo', boundary: 'boundary' };
const bySeed = {};
for (const c of C.captured) (bySeed[c.seed] ??= { role: c.role, points: new Set() }).points.add(c.point);

for (const [seed, info] of Object.entries(bySeed)) {
  const pts = [...info.points];
  const rows = pts.map((point) => ({ seed: Number(seed), point }));
  await sheet(`actual-side-${NAME[info.role]}.png`,
    `実画面 横候補 — seed ${seed}`, rows, C.shots.side);
  await sheet(`actual-high-${NAME[info.role]}.png`,
    `実画面 俯瞰候補 — seed ${seed}`, rows, C.shots.high);
}

/** ★§8 の 3 つの比較を 1 枚に */
await sheet('actual-baseline-vs-candidates.png',
  '実画面 §8 の比較 — 直線中盤 / 第4コーナー / 向正面（seed 42）',
  [
    /* ★行ごとに比べる相手が違います（§8） */
    { seed: 42, point: 'straight-mid',
      shotIds: ['homestretch-front', 'homestretch-side', 'side-low', 'side-close'] },
    { seed: 42, point: 'fourth-corner',
      shotIds: ['fourth-corner-front', 'fourth-corner-high', 'aerial'] },
    { seed: 42, point: 'backstretch',
      shotIds: ['homestretch-side', 'backstretch-side', 'side-low'] },
  ],
  ['homestretch-front', 'homestretch-side', 'side-low', 'side-close']);

console.log(`\n→ ${OUT}`);
