/**
 * ★整列済みの駆歩シート → **本番で使うシート**（8コマ × 8枠色）
 *
 * 【なぜ要るか】
 *   D-060「★色は枠、数字は個体」。枠色8色ぶんの馬が要ります。
 *   ⚠️ ★**8色ぶんを描いてもらう必要はありません。** 勝負服だけ塗り替えます。
 *      （毛色・馬体は共通。第1便からの方針）
 *
 * 【★塗り替え方】
 *   勝負服の画素の**明るさを保ったまま**、色相と彩度だけ枠色に置き換えます。
 *   ⚠️ 単純に塗りつぶすと**陰影が消えて板になります**。実際に一度そうなりました。
 *
 * 実行: npx tsx tools/bake-oblique-sheet.mjs <整列済み.png> <出力.png> [--frames 8] [--width 300]
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const [inFile, outFile] = argv;
if (inFile === undefined || outFile === undefined) {
  console.error('使い方: npx tsx tools/bake-oblique-sheet.mjs <整列済み.png> <出力.png>');
  process.exit(2);
}
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const FRAMES = num('--frames', 8);
/** ★出力の1コマの幅。省略時は入力のまま */
const TARGET_W = argv.includes('--width') ? num('--width', 300) : null;

const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
/** ★枠色8色（D-060）。palette から取ります。★ここで色を作りません */
const FRAME_ROLES = ['frame-1', 'frame-2', 'frame-3', 'frame-4',
  'frame-5', 'frame-6', 'frame-7', 'frame-8'];

const hexRgb = (h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** ★勝負服（青）か。契約の色域 */
function isSilk(r, g, b, a) {
  if (a < 120) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === 0) return false;
  if ((mx - mn) / mx < 0.35) return false;
  return b === mx && b > r + 30;
}

const src = sharp(inFile);
const meta = await src.metadata();
const scale = TARGET_W === null ? 1 : TARGET_W / (meta.width / FRAMES);
const cw = Math.round((meta.width / FRAMES) * scale);
const ch = Math.round(meta.height * scale);

console.log('# ★本番シートを焼く（8コマ × 8枠色）');
console.log(`  入力 ${inFile}  ${meta.width} × ${meta.height}`);
console.log(`  出力 1コマ ${cw} × ${ch}　シート ${cw * FRAMES} × ${ch * 8}\n`);

const base = await sharp(inFile)
  .resize({ width: cw * FRAMES, height: ch, kernel: 'nearest' })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const rows = [];
console.log('  行  枠色        塗り替えた画素');
for (let row = 0; row < 8; row += 1) {
  const role = FRAME_ROLES[row];
  const [tr, tg, tb] = hexRgb(pal[role] ?? '#888888');
  const [th, ts] = rgbToHsl(tr, tg, tb);
  const buf = Buffer.from(base.data);
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
    if (!isSilk(r, g, b, a)) continue;
    const [, , l] = rgbToHsl(r, g, b);
    /**
     * ★明るさは**元の陰影のまま**。色相と彩度だけ枠色にします。
     * ⚠️ 白（frame-1）や黒（frame-2）は彩度が 0 なので、
     *    ★**明るさを枠色の明るさに寄せないと、青いままに見えます**。
     */
    const [nr, ng, nb] = ts < 0.15
      ? (() => { const v = Math.round((l * 0.45 + rgbToHsl(tr, tg, tb)[2] * 0.55) * 255);
        return [v, v, v]; })()
      : hslToRgb(th, Math.max(ts, 0.45), l);
    buf[i] = nr; buf[i + 1] = ng; buf[i + 2] = nb;
    n += 1;
  }
  rows.push(await sharp(buf, { raw: { width: base.info.width, height: base.info.height, channels: 4 } })
    .png().toBuffer());
  console.log(`  ${String(row + 1).padStart(2)}  ${role.padEnd(9)}  ${n.toLocaleString()}`);
}

await sharp({
  create: {
    width: cw * FRAMES, height: ch * 8, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite(rows.map((input, i) => ({ input, left: 0, top: i * ch }))).png().toFile(outFile);

console.log(`\n★${outFile}`);
console.log('⚠️ ★色が出ているかは**絵を見て**確かめます。数字だけで済ませません。');
