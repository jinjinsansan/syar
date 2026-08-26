/**
 * ★**直線の画角を広げた前後を並べて見る**（`out/` にしか書きません）
 *
 *   左 = 直す前（`withinM: 12` / 上限 13°）／右 = 現行（`withinM: 16` / 上限 22°）。
 *   ★どちらも**同じ dev サーバーの実画面**から、同じ表示秒・同じ seed で撮ったコマです
 *   （`tools/capture-overhead-stride.mjs`・`AUDIT_SHOT=homestretch-side`）。
 *   ★後から時間を合わせ直していません。
 *
 * ⚠️ ★**コマのバイト比較で判定しないでください。** 同じ条件で 2 回撮ると
 *    カットの境目付近で食い違います（`capture-overhead-stride.mjs` の注記）。
 *    ショットと画角の同一性は `auditSceneAt`（決定論）で見ること。
 *
 * 実行: npx tsx tools/render-stretch-fov-compare.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const ROOT = path.resolve('out/2d-overhead-stride');
const LEFT = path.join(ROOT, 'fov-before');
const RIGHT = path.join(ROOT, 'fov-after');
const PAIR = path.join(ROOT, '_pairfov');
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');

for (const dir of [LEFT, RIGHT]) {
  if (!existsSync(path.join(dir, 'meta.json'))) {
    throw new Error(`★${dir} がありません。先に capture-overhead-stride.mjs で撮ってください`);
  }
}
const meta = JSON.parse(readFileSync(path.join(RIGHT, 'meta.json'), 'utf8'));
const { fps, startSec } = meta;
const metaL = JSON.parse(readFileSync(path.join(LEFT, 'meta.json'), 'utf8'));
/** ★短い方に合わせる（撮り損ねたコマで落ちないように） */
const frames = Math.min(meta.frames, metaL.frames);
if (metaL.startSec !== startSec || metaL.fps !== fps) {
  throw new Error('★左右で撮影条件が違います（表示秒か fps）。撮り直してください');
}

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
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 19px JPUI, sans-serif';
  ctx.fillStyle = '#c9d1d9';
  ctx.fillText('直す前  帯 12m / 上限 13°　（馬 6.7% ・中央 5 頭）', 12, BAR / 2);
  ctx.fillStyle = '#7ee081';
  ctx.fillText('現行  帯 16m / 上限 22°　（馬 2.8% ・中央 8 頭）', CW + GUT + 12, BAR / 2);

  ctx.font = '17px JPUI, sans-serif';
  ctx.fillStyle = '#e8c46a';
  ctx.fillText(`最後の直線 homestretch-side（表示 ${d.toFixed(2)}s）`, 12, BAR + CH + FOOT / 2);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('seed 42 / 通常 /race（既定 v5・γ=1.3）/ 実画面から 30fps', CW + GUT + 12, BAR + CH + FOOT / 2);

  writeFileSync(path.join(PAIR, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 30 === 0) console.log(`   ${i}/${frames - 1}`);
}

const mp4 = path.join(ROOT, 'stretch-fov-before-after.mp4');
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(PAIR, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-an', mp4], { stdio: 'ignore' });

const pal = path.join(ROOT, '_palettefov.png');
const gif = path.join(ROOT, 'stretch-fov-before-after.gif');
execFileSync(FFMPEG, ['-y', '-i', mp4, '-vf', 'fps=15,scale=1000:-1:flags=lanczos,palettegen=max_colors=192', pal], { stdio: 'ignore' });
execFileSync(FFMPEG, ['-y', '-i', mp4, '-i', pal, '-lavfi',
  'fps=15,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'ignore' });

console.log(`★${mp4}`);
console.log(`★${gif}`);
