/**
 * ★**撮ったコマを 1 本の動画にする**（`out/` にしか書きません）
 *
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §8-A / §8-C。
 *
 *   ⚠️ ★**静止画シートでは判定できません。** カクつき・進出・差し返しは時系列でしか読めないので、
 *      指示書は動画を必須にしています。ここは撮ったコマを並べて符号化するだけです。
 *
 * ⚠️ ★製品コードには触れません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/render-climax-clip.mjs --label climax-after [--title "…"]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const LABEL = arg('label', undefined);
if (LABEL === undefined) throw new Error('★--label が要ります（例: --label climax-after）');

const ROOT = path.resolve('out/2d-overhead-stride');
const SRC = path.join(ROOT, LABEL);
const WORK = path.join(ROOT, `_clip-${LABEL}`);
const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
if (!existsSync(path.join(SRC, 'meta.json'))) throw new Error(`★${SRC} がありません`);
const meta = JSON.parse(readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const { fps, startSec, frames, seed } = meta;
const TITLE = arg('title', `seed ${seed} / 通常 /race（台本 v5）/ 第4コーナー → 直線の攻防 → ゴール → 勝馬`);

/** 元のコマ（1280×720）に、表示秒と説明の帯を付ける */
const CW = 1280, CH = 720, BAR = 40, FOOT = 30;
const W = CW, H = BAR + CH + FOOT;
if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

for (let i = 0; i < frames; i += 1) {
  const img = await loadImage(path.join(SRC, `f${String(i).padStart(4, '0')}.jpg`));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101317';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, BAR, CW, CH);
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 19px JPUI, sans-serif';
  ctx.fillStyle = '#7ee081';
  ctx.fillText(TITLE, 12, BAR / 2);
  ctx.font = '17px JPUI, sans-serif';
  ctx.fillStyle = '#e8c46a';
  ctx.fillText(`表示 ${(startSec + i / fps).toFixed(2)}s`, 12, BAR + CH + FOOT / 2);
  ctx.fillStyle = '#6b7280';
  ctx.fillText('★実画面から 30fps で取り込み（オフライン描画ではありません）', 180, BAR + CH + FOOT / 2);
  writeFileSync(path.join(WORK, `p${String(i).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 60 === 0) console.log(`   ${i}/${frames - 1}`);
}

const mp4 = path.join(ROOT, `${LABEL}.mp4`);
execFileSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(WORK, 'p%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-an', mp4], { stdio: 'ignore' });
rmSync(WORK, { recursive: true, force: true });
console.log(`★${mp4}`);
