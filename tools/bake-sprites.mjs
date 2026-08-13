/**
 * ★ブラウザ用にスプライトを焼き出す（開発サーバーでレースを見るため）
 *
 * 【なぜ焼くか】
 *   勝負服とゼッケンの塗りは**画素単位の処理**で、オーナーの指摘で5回作り直しました。
 *   ★**ブラウザで書き直すと必ずズレます。** 同じ処理（`tools/lib/dress.mjs`）で
 *     PNG にしてから配ります。
 *
 * 【★DB に触りません】画像を書くだけです。
 *
 * 実行: npx tsx tools/bake-sprites.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { loadFrames, dressed, POST } from './lib/dress.mjs';

const SHEET = 'design/art/assets/horse-gallop-cloth2-sheet.png';
const OUT = join('apps', 'web', 'public', 'sprites');
const GATES = 18;
const FRAMES = 6;

mkdirSync(OUT, { recursive: true });
const frames = await loadFrames(SHEET);

for (let gate = 1; gate <= GATES; gate += 1) {
  // ★1頭ぶんを「6枚横並び」の1枚に（ブラウザは1回の読み込みで済む）
  const cells = [];
  for (let f = 0; f < FRAMES; f += 1) cells.push(await dressed(frames, f, gate));
  const strip = await sharp({
    create: { width: 220 * FRAMES, height: 140, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells.map((buf, f) => ({ input: buf, left: 220 * f, top: 0 })))
    .png().toBuffer();
  writeFileSync(join(OUT, `horse-${gate}.png`), strip);
}

// ★枠順の色も一緒に出す（ブラウザ側で書き写さない）
writeFileSync(join(OUT, 'post-colors.json'), JSON.stringify(POST));

console.log(`  ${GATES} 頭 × ${FRAMES} コマを ${OUT} に焼きました`);
console.log(`  1頭 ${(220 * FRAMES)}×140 の帯 / 色は post-colors.json`);
