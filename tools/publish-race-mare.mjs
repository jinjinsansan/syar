/**
 * ★**牝馬のレースの絵を `/art/` に置く**（★2026-10-02・`tools/gen-race-mare.mjs` の続き）。
 *
 *   `out/gen/race-mare/<系列>/01..08.png`（★元のコマと同じ大きさ・同じ位置に重ねたもの）を
 *   `apps/web/public/art/horse-jockey-<系列>m-poseNN.png` と `.webp`（★`build-art-webp.mjs` と同じ設定）へ。
 *   ★8 コマ揃っていない系列は ★置かない（★画面は 揃っていない型を 牡馬の絵に落とす）。
 *
 * 実行: node tools/publish-race-mare.mjs [系列 ...]
 */
import { existsSync, copyFileSync } from 'node:fs';
import sharp from 'sharp';

const ALL = ['side-v8', 'side-walk-v1', 'diag-front-v4', 'diag-rear-v5', 'high-diag-v4'];
const fams = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ALL;
const nn = (i) => String(i).padStart(2, '0');
let bad = 0;
for (const fam of fams) {
  const src = Array.from({ length: 8 }, (_, i) => `out/gen/race-mare/${fam}/${nn(i + 1)}.png`);
  const missing = src.filter((f) => !existsSync(f));
  if (missing.length > 0) { console.log(`✗ ${fam}: ${8 - missing.length}/8 → 置かない`); bad += 1; continue; }
  for (let i = 0; i < 8; i += 1) {
    const png = `apps/web/public/art/horse-jockey-${fam}m-pose${nn(i + 1)}.png`;
    /** ★元のコマと 大きさが違えば 置かない（★重ね合わせの漏れ） */
    const [a, b] = await Promise.all([sharp(src[i]).metadata(), sharp(`apps/web/public/art/horse-jockey-${fam}-pose${nn(i + 1)}.png`).metadata()]);
    if (a.width !== b.width || a.height !== b.height) throw new Error(`★${fam} ${nn(i + 1)}: 大きさが元と違う ${a.width}x${a.height} ≠ ${b.width}x${b.height}`);
    copyFileSync(src[i], png);
    await sharp(png).webp({ quality: 88, alphaQuality: 95, effort: 5 }).toFile(png.replace(/\.png$/, '.webp'));
  }
  console.log(`✓ ${fam} → horse-jockey-${fam}m-pose01..08（png・webp）`);
}
process.exitCode = bad > 0 ? 1 : 0;
