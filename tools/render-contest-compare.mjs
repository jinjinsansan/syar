/**
 * ★**着差の見せ方（γ）の比較映像**（指示書 §2・`out/` にしか書きません）
 *
 *   γ = 1.0（現行）/ 1.3 / 1.6 を、**同じ seed・同じ台本・同じカメラ・同じ表示秒**で並べます。
 *   ★違うのは写像だけです。1 本でも条件が混ざったら、どちらの効果か切り分けられません。
 *
 * 実行: npx tsx tools/render-contest-compare.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = path.resolve('out/2d-overhead-stride');
/**
 * ★**撮ったコマ置き場と出力先を差し替えられるようにする**（`--dirs` / `--out` / `--tag`）。
 *
 *   ⚠️ ★既定は 2026-08-25 に撮った `g10/g13/g16`（seed 42・台本 v5）のままです。
 *      ★**既定を変えません**（R-27: 省略時は狭い側・従来どおりへ落とす）。
 *   ★2026-08-27 に seed 253・台本 v6 で撮り直したものは `--dirs v6g10,v6g13,v6g16 --tag v6-253`
 *     で並べます。★**古い証拠を上書きしないため、出力名にも tag を付けます。**
 */
const DIRS = String(arg('dirs', 'g10,g13,g16')).split(',');
const TAG = arg('tag', '');
const OUT = path.resolve(arg('out', 'out/2d-finish-contest'));
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
const LABELS = ['γ=1.0（現行）', 'γ=1.3', 'γ=1.6'];
const COLORS = ['#c9d1d9', '#7ee081', '#e8c46a'];
if (DIRS.length !== LABELS.length) throw new Error(`★--dirs は ${LABELS.length} 個です: ${DIRS.join(',')}`);
const VARIANTS = DIRS.map((dir, i) => ({ dir, label: LABELS[i], color: COLORS[i] }));
/** ★出力名の接尾辞。`--tag` を付けたときだけ変わる（既定の出力名は従来どおり） */
const SUF = TAG ? `-${TAG}` : '';
mkdirSync(OUT, { recursive: true });

const meta = JSON.parse(readFileSync(path.join(ROOT, VARIANTS[0].dir, 'meta.json'), 'utf8'));
const { fps, startSec, frames } = meta;
/**
 * ★**画に焼く説明は、撮った条件（`meta.json`）から引く。**
 *
 *   ⚠️ ★以前はここが `seed 42 / 台本 v5` の**べた書き**でした。撮り直すと
 *      ★**測ったものと違う説明が焼き込まれます**（正典 R-30 の「正しく見える誤報」）。
 *   ★seed は `meta.seed`、台本は撮影時 URL の `cinematography` から取ります。
 */
const FOOT_HEAD = (() => {
  const script = new URLSearchParams(String(meta.url).split('?')[1] ?? '').get('cinematography') ?? '?';
  return `seed ${meta.seed} / 台本 ${script}`;
})();
console.log(`★焼き込む説明: ${FOOT_HEAD}`);

/* ── 1 本ずつの動画（指示書 §2 の「3 本」） ─────────────── */
for (const v of VARIANTS) {
  const mp4 = path.join(OUT, `finish-contest-${v.dir}.mp4`);
  execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(ROOT, v.dir, 'f%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-an', mp4], { stdio: 'ignore' });
  console.log(`★${mp4}`);
}

/* ── 3 つ並べた 1 本（見比べ用） ─────────────────────── */
const CW = 620, CH = 348, GUT = 5, BAR = 44, FOOT = 24;   // ★H は偶数にすること（libx264 は奇数を受け付けない）
const W = CW * 3 + GUT * 2, H = BAR + CH + FOOT;
const PAIR = path.join(OUT, `_triple${SUF}`);
if (existsSync(PAIR)) rmSync(PAIR, { recursive: true, force: true });
mkdirSync(PAIR, { recursive: true });
for (let i = 0; i < frames; i += 1) {
  const name = `f${String(i).padStart(4, '0')}.jpg`;
  const imgs = await Promise.all(VARIANTS.map((v) => loadImage(path.join(ROOT, v.dir, name))));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101317';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  for (let k = 0; k < VARIANTS.length; k += 1) {
    const x = k * (CW + GUT);
    ctx.drawImage(imgs[k], x, BAR, CW, CH);
    ctx.font = 'bold 20px JPUI, sans-serif';
    ctx.fillStyle = VARIANTS[k].color;
    ctx.fillText(VARIANTS[k].label, x + 12, BAR / 2);
  }
  ctx.font = '16px JPUI, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText(`${FOOT_HEAD} / 同じ表示秒 ${(startSec + i / fps).toFixed(2)}s / 着順はどれも同一`, 12, BAR + CH + FOOT / 2);
  writeFileSync(path.join(PAIR, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 60 === 0) console.log(`   ${i}/${frames - 1}`);
}
const tri = path.join(OUT, `finish-contest-compare${SUF}.mp4`);
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(PAIR, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-an', tri], { stdio: 'ignore' });
const pal = path.join(OUT, `_palette${SUF}.png`);
const gif = path.join(OUT, `finish-contest-compare${SUF}.gif`);
execFileSync(FFMPEG, ['-y', '-i', tri, '-vf', 'fps=12,scale=1200:-1:flags=lanczos,palettegen=max_colors=160', pal], { stdio: 'ignore' });
execFileSync(FFMPEG, ['-y', '-i', tri, '-i', pal, '-lavfi',
  'fps=12,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'ignore' });
console.log(`★${tri}`);
console.log(`★${gif}`);
