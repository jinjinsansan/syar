/**
 * ★P4 の最初の実測 — シート契約 / 1頭あたりのバイト数 / 勝負服の画素
 *
 * 【指示書 A-3 が確定させろと言っているもの】
 *   1. スプライトシートの契約（フレーム寸法・列数・フレーム数・基準点）
 *   2. **1頭あたりの実バイト数** ← C-3（初回ロード）の上限を決めるのに要る
 *   3. 18頭を同時に描いたときのフレーム時間（← これは別途）
 *
 * 【★この道具が言えないこと】
 *   「馬体を共通にして違和感が無いか」は**絵を見て決めること**です。
 *   ここが出すのは**数字だけ**です。
 *
 * 実行: node tools/measure-sprite-sheet.mjs <sheet.png> --frames 6 --cell 32
 */
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const src = process.argv[2];
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
if (src === undefined) {
  console.error('使い方: node tools/measure-sprite-sheet.mjs <sheet.png> [--frames 6] [--cell 32]');
  process.exit(2);
}
const FRAMES = arg('frames', 6);
/** ★セルは正方形ではありません（D-058: 220×140） */
const CELL_W = arg('cell-w', arg('cell', 220));
const CELL_H = arg('cell-h', 140);

const hsv = (r, g, b) => {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max };
};
/** ★勝負服は色相で見分ける。彩度だけだと鹿毛の茶を勝負服として数えます（実際に踏みました） */
const isSilk = (r, g, b) => {
  const { h, s } = hsv(r, g, b);
  return s >= 0.35 && !(h <= 60 || h >= 330);
};

const meta = await sharp(src).metadata();
const W = meta.width ?? 0;
const H = meta.height ?? 0;
const cellW = Math.floor(W / FRAMES);

console.log('# ★スプライトシートの実測（指示書 A-3）');
console.log('');
console.log('【1. シート契約】');
console.log(`  原画       : ${W} × ${H} / ${statSync(src).size.toLocaleString()} バイト`);
console.log(`  レイアウト : ${FRAMES} 列 × 1 行`);
console.log(`  1セル      : ${cellW} × ${H}`);
if (W % FRAMES !== 0) {
  console.log(`  ⚠️ 横幅が ${FRAMES} で割り切れません（余り ${W % FRAMES}px）。切り出しが1px ずれます`);
}
console.log('');

const outDir = join(dirname(src), 'frames');
mkdirSync(outDir, { recursive: true });

console.log(`【2. ${CELL_W}×${CELL_H} に落とす】★正典 §12.1・D-058 の契約`);
let totalBytes = 0;
let silkTotal = 0;
let opaqueTotal = 0;
/** ★基準点（footline）: 不透明画素の最下端。**フレーム間でこれが揃っていないと馬が上下に跳ねます** */
const footlines = [];

for (let f = 0; f < FRAMES; f += 1) {
  // ★切り出しと余白除去を**1本の処理で繋ぐと落ちます**（extract_area: bad extract area）。
  //   段階を分けます。
  const cut = await sharp(src)
    .extract({ left: f * cellW, top: 0, width: cellW, height: H })
    .png()
    .toBuffer();
  const trimmed = await sharp(cut).trim().png().toBuffer();
  /**
   * ★**接地線を揃える。**
   *   `trim` は各フレームを個別に詰めるので、脚の伸びが違うと**接地線がずれます**
   *   （実測で 13px ずれ、そのままだと再生時に馬が上下に跳ねます）。
   *   → **下端を合わせて**配置します（`position: 'bottom'`）。
   */
  const buf = await sharp(trimmed)
    .resize(CELL_W, CELL_H, {
      fit: 'contain', position: 'bottom', kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  const out = join(outDir, `${basename(src, '.png')}-${f}.png`);
  await sharp(buf).toFile(out);
  totalBytes += buf.length;

  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let silk = 0, opaque = 0, bottom = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    opaque += 1;
    const y = Math.floor((i / info.channels) / CELL_W);
    if (y > bottom) bottom = y;
    if (isSilk(data[i], data[i + 1], data[i + 2])) silk += 1;
  }
  silkTotal += silk;
  opaqueTotal += opaque;
  footlines.push(bottom);
  console.log(`  frame ${f}: ${String(buf.length).padStart(4)}B / 不透明 ${String(opaque).padStart(3)}px / 勝負服 ${String(silk).padStart(3)}px / 接地線 y=${bottom}`);
}

console.log('');
console.log('【3. 判定】');
console.log(`  ★1頭あたり（${FRAMES}フレーム・${CELL_W}×${CELL_H}）: ${totalBytes.toLocaleString()} バイト`);
console.log(`  ★勝負服の平均: ${(silkTotal / FRAMES).toFixed(1)} px（不透明部の ${((silkTotal / opaqueTotal) * 100).toFixed(1)}%）`);

/**
 * ★接地線が揃っているか。
 *   揃っていないと**再生時に馬が上下に跳ねます**。
 *   アートバイブル §3「接地の瞬間が分かることを優先」の前提です。
 */
const fMin = Math.min(...footlines), fMax = Math.max(...footlines);
console.log(`  接地線のばらつき: y ${fMin}〜${fMax}（差 ${fMax - fMin}px）`);
if (fMax - fMin > 1) {
  console.log('  ★★接地線が揃っていません。このまま再生すると馬が上下に跳ねます');
  console.log('     → シート契約に「基準点をそろえる」を入れる必要があります');
}

console.log('');
console.log('【★ロード予算の見積もり】');
for (const [label, patterns] of [['勝負服18色（馬体は共通）', 18], ['馬ごとに別スプライト（18頭）', 18]]) {
  console.log(`  ${label}: ${((totalBytes * patterns) / 1024).toFixed(0)} KB`);
}
console.log('  ★上は同じ数字になります — **色替えなら1枚で済む**ので、実際は下記です:');
console.log(`     色替え方式: ${(totalBytes / 1024).toFixed(1)} KB（★シート1枚＋パレット）`);
console.log(`     個別方式  : ${((totalBytes * 18) / 1024).toFixed(0)} KB（18倍）`);
