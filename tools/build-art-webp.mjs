/**
 * ★読むだけ（DB に触れない）。`apps/web/public/art/**\/*.png`（`-chroma` 原版を除く）を WebP に変換して隣に置く。
 *
 *   node tools/build-art-webp.mjs
 *
 * 目的: 透過 PNG（1 枚 1〜2MB・約 120 枚）でページ初回ロードが重い（ユーザー指摘）。WebP（q88・α95）で約 1/7。
 * Web 側は `.webp` を先に読み、失敗したら `.png` に落ちる（`page.tsx` の loadImg）。
 * PNG は原版として残す（Node 側のツールは PNG を読む）。決定論: 同じ入力から同じ出力（sharp の設定固定）。
 */
import sharp from 'sharp';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'apps', 'web', 'public', 'art');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const targets = walk(ART).filter((p) => extname(p) === '.png' && !basename(p).endsWith('-chroma.png'));
let converted = 0, skipped = 0, before = 0, after = 0;
for (const png of targets) {
  const webp = png.slice(0, -4) + '.webp';
  const srcStat = statSync(png);
  before += srcStat.size;
  if (existsSync(webp) && statSync(webp).mtimeMs >= srcStat.mtimeMs) { skipped += 1; after += statSync(webp).size; continue; }
  await sharp(png).webp({ quality: 88, alphaQuality: 95, effort: 5 }).toFile(webp);
  after += statSync(webp).size;
  converted += 1;
}
console.log(`converted ${converted}, up-to-date ${skipped}, png ${(before / 1048576).toFixed(1)}MB → webp ${(after / 1048576).toFixed(1)}MB`);
