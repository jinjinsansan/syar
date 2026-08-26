/**
 * ★**既存ショット適性ゲートのコンタクトシート**（読取専用・指示書 §11/§12）
 *
 * ⚠️ ★**これは写真ではありません。測った幾何を図にしたものです。**
 *    通常 `/race` には任意ショットを強制表示する経路（`?shot=`）が無く、
 *    製品コードを変えずに**実画面の絵**を撮ることができませんでした（報告書 §16）。
 *    ★オフラインで描くと勝負服が白・毛色が単一になり、
 *      過去にその絵から誤った結論を出した経緯があるので**描きません**。
 *
 *   図に出るもの: 12 頭の外接箱（着順で濃淡）／HUD の占有域／画面枠
 *   ラベル: seed・進行率・shot ID・target・完全可視頭数・上位同時可視・最大馬高比・A/B/C
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('out/2d-existing-shot-gate');
mkdirSync(OUT, { recursive: true });
if (!existsSync(path.join(OUT, 'measurements.json'))) {
  throw new Error('★measurements.json が無い。先に tools/audit-existing-shot-gate.mjs を走らせること');
}
const M = JSON.parse(readFileSync(path.join(OUT, 'measurements.json'), 'utf8'));

const W = M.viewport.W;
const H = M.viewport.H;
const SCALE = 0.32;                 // ★1 コマの縮尺
const CW = Math.round(W * SCALE);
const CH = Math.round(H * SCALE);
const LABEL_H = 52;
const ROLE_COLOR = { A: '#3fbf6f', B: '#4d8ee0', C: '#c9503f', baseline: '#8a8a8a' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** ★1 コマぶんの SVG（画面枠・HUD・馬の箱・ラベル） */
function cellSvg(row, seed, x, y) {
  const sx = (v) => x + v * SCALE;
  const sy = (v) => y + LABEL_H + v * SCALE;
  let g = `<rect x="${x}" y="${y}" width="${CW}" height="${CH + LABEL_H}" fill="#14120f"/>`;
  /* ラベル */
  const role = row.role ?? 'C';
  g += `<rect x="${x}" y="${y}" width="${CW}" height="${LABEL_H}" fill="#1e1b17"/>`
    + `<rect x="${x}" y="${y}" width="6" height="${LABEL_H}" fill="${ROLE_COLOR[role]}"/>`
    + `<text x="${x + 11}" y="${y + 15}" fill="#efe9dc" font-size="11" font-family="monospace">`
    + `seed ${seed}  進行 ${(row.progressRatio * 100).toFixed(0)}%  ${esc(row.shotId)}</text>`
    + `<text x="${x + 11}" y="${y + 29}" fill="#bdb6a8" font-size="10" font-family="monospace">`
    + `target=${esc(row.target)}  可視 ${row.fullCount}/${row.partialCount}/${row.offCount}`
    + `  上位2 ${row.top2Visible ? '○' : '×'} 3 ${row.top3Visible ? '○' : '×'} 4 ${row.top4Visible ? '○' : '×'}</text>`
    + `<text x="${x + 11}" y="${y + 43}" fill="#bdb6a8" font-size="10" font-family="monospace">`
    + `最大馬高比 ${row.maxHeightRatio ?? '—'}  空白 ${(row.blankRatio * 100).toFixed(0)}%</text>`
    + `<text x="${x + CW - 10}" y="${y + 20}" fill="${ROLE_COLOR[role]}" font-size="18"`
    + ` font-family="monospace" text-anchor="end">${role === 'baseline' ? '基準' : role}</text>`;
  /* 画面（芝の色は使わない。あくまで図） */
  g += `<rect x="${sx(0)}" y="${sy(0)}" width="${CW}" height="${CH}" fill="#232019" stroke="#4a4438"/>`;
  /* HUD */
  for (const r of M.hudRects) {
    g += `<rect x="${sx(r.x0)}" y="${sy(r.y0)}" width="${(r.x1 - r.x0) * SCALE}" height="${(r.y1 - r.y0) * SCALE}"`
      + ` fill="#ffd60a" fill-opacity="0.10" stroke="#ffd60a" stroke-opacity="0.35" stroke-width="0.6"/>`;
  }
  /* 馬の箱（着順が上ほど明るい） */
  for (const b of [...row.boxes].sort((p, q) => q.rank - p.rank)) {
    if (b.x0 === null || b.v === 'off') continue;
    const bright = Math.max(0.25, 1 - (b.rank - 1) / 12);
    const col = b.rank <= 4 ? '#ffd60a' : '#8de8ff';
    g += `<rect x="${sx(b.x0)}" y="${sy(b.y0)}" width="${Math.max(0.6, (b.x1 - b.x0) * SCALE)}"`
      + ` height="${Math.max(0.6, (b.y1 - b.y0) * SCALE)}" fill="${col}" fill-opacity="${(bright * 0.45).toFixed(2)}"`
      + ` stroke="${col}" stroke-opacity="${bright.toFixed(2)}" stroke-width="0.8"/>`;
  }
  return g;
}

async function sheet(file, title, seedSpec, shotIds) {
  const rows = M.points;
  const width = CW * shotIds.length + 12;
  const height = (CH + LABEL_H + 6) * rows.length + 46;
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="100%" height="100%" fill="#0d0b09"/>`
    + `<text x="8" y="20" fill="#ffd60a" font-size="15" font-family="monospace">${esc(title)}</text>`
    + `<text x="8" y="36" fill="#8a8a8a" font-size="11" font-family="monospace">`
    + `★写真ではありません。測った幾何の図です（黄=上位4頭 / 水色=それ以外 / 薄黄=HUD 占有域）。</text>`;
  rows.forEach((p, ri) => {
    shotIds.forEach((id, ci) => {
      const row = seedSpec.rows.find((r) => r.point === p.key && r.shotId === id);
      if (row === undefined) return;
      svg += cellSvg(row, seedSpec.seed, ci * CW + 6, ri * (CH + LABEL_H + 6) + 44);
    });
    svg += `<text x="${width - 6}" y="${ri * (CH + LABEL_H + 6) + 58}" fill="#6a6a6a" font-size="10"`
      + ` font-family="monospace" text-anchor="end">${esc(p.label)}</text>`;
  });
  svg += '</svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, file));
  console.log(`  ${file}`);
}

const byRole = Object.fromEntries(M.seeds.map((s) => [s.role, s]));
const NAME = { default: 'seed42', contest: 'contest', solo: 'solo', boundary: 'boundary' };

for (const [role, s] of Object.entries(byRole)) {
  await sheet(`side-candidates-${NAME[role]}.png`,
    `横候補 — seed ${s.seed}（${s.label} / 1280m 分類 ${s.classification.style} gap2 ${s.classification.gap2M}m）`,
    s, M.shots.side);
  await sheet(`high-candidates-${NAME[role]}.png`,
    `俯瞰候補 — seed ${s.seed}（${s.label} / 1280m 分類 ${s.classification.style}）`,
    s, M.shots.high);
}

/** ★§12 の中心比較: 同じ地点で基準と横候補を並べる */
await sheet('baseline-vs-candidates.png',
  '基準 vs 候補 — seed 42（homestretch-front / homestretch-side / side-close / side-low）',
  byRole.default, ['homestretch-front', 'homestretch-side', 'side-close', 'side-low']);

console.log(`\n→ ${OUT}`);
