/**
 * ★**第4コーナーを「上・後ろから」と「前から」で並べる**（`out/` にしか書きません）
 *
 *   左 = 現行 v5（`fourth-corner-high`・見た目の完歩 9m）
 *   右 = 旧 v4（`fourth-corner-front`・同じ表示秒・同じ seed）
 *   ★どちらも同じ dev サーバーの実画面から撮ったコマです。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const ROOT = path.resolve('out/2d-overhead-stride');
const LEFT = path.join(ROOT, 'stride9');
const RIGHT = path.join(ROOT, process.env.AUDIT_RIGHT ?? 'v4front');
const PAIR = path.join(ROOT, '_pair2');
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
const { fps, startSec, shotFromSec, shotToSec, frames } = JSON.parse(readFileSync(path.join(LEFT, 'meta.json'), 'utf8'));

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
  ctx.fillStyle = '#e8c46a';
  ctx.fillText(process.env.AUDIT_LEFT_LABEL ?? '現行 v5  4角を上・後ろから（胴の上下 9.8%）', 12, BAR / 2);
  ctx.fillStyle = '#7ee081';
  ctx.fillText(process.env.AUDIT_RIGHT_LABEL ?? '旧 v4  4角を前から（胴の上下 6.0%・判定合格）', CW + GUT + 12, BAR / 2);
  ctx.font = '17px JPUI, sans-serif';
  ctx.fillStyle = inCut ? '#c9d1d9' : '#6b7280';
  ctx.fillText(inCut ? `第4コーナーのカット（表示 ${d.toFixed(2)}s）` : `前後のカット（表示 ${d.toFixed(2)}s）`, 12, BAR + CH + FOOT / 2);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('seed 42 / 同じ表示秒・同じ着順 / 実画面から 30fps で取り込み', CW + GUT + 12, BAR + CH + FOOT / 2);
  writeFileSync(path.join(PAIR, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
}

const mp4 = path.join(ROOT, process.env.AUDIT_OUT ?? 'corner4-high-vs-front.mp4');
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(PAIR, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-an', mp4], { stdio: 'ignore' });
const pal = path.join(ROOT, '_palette2.png');
const gif = path.join(ROOT, (process.env.AUDIT_OUT ?? 'corner4-high-vs-front.mp4').replace('.mp4', '.gif'));
execFileSync(FFMPEG, ['-y', '-i', mp4, '-vf', 'fps=15,scale=1000:-1:flags=lanczos,palettegen=max_colors=192', pal], { stdio: 'ignore' });
execFileSync(FFMPEG, ['-y', '-i', mp4, '-i', pal, '-lavfi',
  'fps=15,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'ignore' });
console.log(`★${mp4}`);
console.log(`★${gif}`);
