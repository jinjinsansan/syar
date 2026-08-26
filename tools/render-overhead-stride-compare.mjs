/**
 * ★**#1 の直しを並べて見る**（`out/` にしか書きません）
 *
 *   左 = 直す前（見た目の完歩 7m）／右 = 現行（9m）。
 *   ★どちらも**同じ dev サーバーの実画面**から、同じ表示秒・同じ seed で撮ったコマです
 *   （`tools/capture-overhead-stride.mjs`）。後から時間を合わせ直していません。
 *
 * 実行: npx tsx tools/render-overhead-stride-compare.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const ROOT = path.resolve('out/2d-overhead-stride');
const LEFT = path.join(ROOT, 'stride7');
const RIGHT = path.join(ROOT, 'stride9');
const PAIR = path.join(ROOT, '_pair');
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');

const meta = JSON.parse(readFileSync(path.join(RIGHT, 'meta.json'), 'utf8'));
const { fps, startSec, shotFromSec, shotToSec, frames } = meta;

/* ── 並べた 1 枚を組む ───────────────────────────── */
const CW = 640, CH = 360, GUT = 6, BAR = 46, FOOT = 26;
const W = CW * 2 + GUT, H = BAR + CH + FOOT;

if (existsSync(PAIR)) rmSync(PAIR, { recursive: true, force: true });
mkdirSync(PAIR, { recursive: true });

for (let i = 0; i < frames; i += 1) {
  const name = `f${String(i).padStart(4, '0')}.jpg`;
  const [a, b] = await Promise.all([loadImage(path.join(LEFT, name)), loadImage(path.join(RIGHT, name))]);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101317';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(a, 0, BAR, CW, CH);
  ctx.drawImage(b, CW + GUT, BAR, CW, CH);

  const d = startSec + i / fps;
  const inCut = d >= shotFromSec && d <= shotToSec;

  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px JPUI, sans-serif';
  ctx.fillStyle = '#c9d1d9';
  ctx.fillText('直す前  完歩 7m（1.82 馬身/完歩・実馬比 62%）', 12, BAR / 2);
  ctx.fillStyle = '#7ee081';
  ctx.fillText('現行  完歩 9m（2.25 馬身/完歩・実馬比 77%）', CW + GUT + 12, BAR / 2);

  ctx.font = '17px JPUI, sans-serif';
  ctx.fillStyle = inCut ? '#e8c46a' : '#6b7280';
  ctx.fillText(
    inCut
      ? `第4コーナー俯瞰 fourth-corner-high（表示 ${d.toFixed(2)}s）`
      : `前後のカット（表示 ${d.toFixed(2)}s・ここは両者バイト一致）`,
    12, BAR + CH + FOOT / 2,
  );
  ctx.fillStyle = '#6b7280';
  ctx.fillText('seed 42 / 通常 /race（既定 v5）/ 実画面から 30fps で取り込み', CW + GUT + 12, BAR + CH + FOOT / 2);

  writeFileSync(path.join(PAIR, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 30 === 0) console.log(`   ${i}/${frames - 1}`);
}

/* ── 動画と GIF ─────────────────────────────────── */
const mp4 = path.join(ROOT, 'overhead-stride-7m-vs-9m.mp4');
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(PAIR, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-an', mp4], { stdio: 'ignore' });

const pal = path.join(ROOT, '_palette.png');
const gif = path.join(ROOT, 'overhead-stride-7m-vs-9m.gif');
execFileSync(FFMPEG, ['-y', '-i', mp4, '-vf', 'fps=15,scale=1000:-1:flags=lanczos,palettegen=max_colors=192', pal], { stdio: 'ignore' });
execFileSync(FFMPEG, ['-y', '-i', mp4, '-i', pal, '-lavfi',
  'fps=15,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'ignore' });

console.log(`★${mp4}`);
console.log(`★${gif}`);
