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

const ROOT = path.resolve('out/2d-overhead-stride');
const OUT = path.resolve('out/2d-finish-contest');
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
const VARIANTS = [
  { dir: 'g10', label: 'γ=1.0（現行）', color: '#c9d1d9' },
  { dir: 'g13', label: 'γ=1.3', color: '#7ee081' },
  { dir: 'g16', label: 'γ=1.6', color: '#e8c46a' },
];
mkdirSync(OUT, { recursive: true });

const meta = JSON.parse(readFileSync(path.join(ROOT, VARIANTS[0].dir, 'meta.json'), 'utf8'));
const { fps, startSec, frames } = meta;

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
const PAIR = path.join(OUT, '_triple');
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
  ctx.fillText(`seed 42 / 台本 v5 / 同じ表示秒 ${(startSec + i / fps).toFixed(2)}s / 着順はどれも同一`, 12, BAR + CH + FOOT / 2);
  writeFileSync(path.join(PAIR, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 60 === 0) console.log(`   ${i}/${frames - 1}`);
}
const tri = path.join(OUT, 'finish-contest-compare.mp4');
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(PAIR, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-an', tri], { stdio: 'ignore' });
const pal = path.join(OUT, '_palette.png');
const gif = path.join(OUT, 'finish-contest-compare.gif');
execFileSync(FFMPEG, ['-y', '-i', tri, '-vf', 'fps=12,scale=1200:-1:flags=lanczos,palettegen=max_colors=160', pal], { stdio: 'ignore' });
execFileSync(FFMPEG, ['-y', '-i', tri, '-i', pal, '-lavfi',
  'fps=12,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'ignore' });
console.log(`★${tri}`);
console.log(`★${gif}`);
