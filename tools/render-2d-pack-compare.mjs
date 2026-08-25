/**
 * ★**参考とバリアントを並べる**（`DEV_INSTRUCTIONS_P4_2D_LIMIT_TEST_20260822.md` §8）
 *
 *   `render-2d-pack-limit.mjs` が作った mp4 からコマを抜き、
 *   参考映像の該当秒と同じ配置で 1 枚にします。
 *
 * ⚠️ ★参考は**実機をスマートフォンで撮った映像**です。競馬映像が出ている**上画面だけ**を
 *    切り出し、黒枠・反射・撮影者のオーバーレイは持ち込みません（指示書 §3）。
 * ⚠️ ★画像の中に評価を誘導する説明文を書きません。名前と時刻だけです（指示書 §8）。
 *
 * 実行: npx tsx tools/render-2d-pack-compare.mjs
 */
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('out/2d-pack-limit');
const TMP = path.join(OUT, '_tmp');
/**
 * ★**参考映像の場所は環境変数から受け取ります。**
 * ⚠️ ★ここに実ファイル名を書くと、他社製品名がコードへ残ります（正典 §0 憲法1）。
 *    → `REF_VIDEO` に参考映像のパスを入れて実行してください。
 *      例: `REF_VIDEO="<参考映像のパス>" npx tsx tools/render-2d-pack-compare.mjs`
 */
const SRC = process.env.REF_VIDEO;
if (SRC === undefined || SRC === '') {
  throw new Error('★参考映像のパスを環境変数 REF_VIDEO で渡してください');
}
mkdirSync(TMP, { recursive: true });
for (const f of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc']) {
  try { if (GlobalFonts.registerFromPath(f, 'JPUI')) break; } catch { /* 次へ */ }
}

const REF_TIMES = [50.0, 52.0, 54.0, 56.0, 58.0];
/**
 * ⚠️ ★最後は **7.9 秒**です。8.0 秒ちょうどのコマは**存在しません**
 *    （30fps で 240 コマなら最終コマは 239/30 = 7.967 秒）。
 *    8.0 を指定すると抽出が黙って失敗します（実際に失敗しました）。
 */
const OUT_TIMES = [0, 2, 4, 6, 7.9];
/**
 * ★参考映像の中で「上画面（競馬映像）」が占める矩形（1920×1080 の写真に対して）。
 *   実写の写真から目視で取った値です。撮影の枠・反射・オーバーレイを外すのが目的で、
 *   ここを厳密に合わせること自体は目的ではありません。
 */
const REF_CROP = { left: 110, top: 28, width: 1400, height: 566 };

const VARIANTS = [
  ['v0', 'v0-current'], ['v1', 'v1-dense'], ['v2', 'v2-pack'], ['v3', 'v3-integrated'],
];

/** 参考映像から 1 コマ取り、上画面だけを切り出す */
async function refFrame(t) {
  const raw = path.join(TMP, `ref-raw-${t}.png`);
  execFileSync(ffmpegPath, ['-y', '-ss', String(t), '-i', SRC, '-frames:v', '1', '-q:v', '2', raw], { stdio: 'ignore' });
  return sharp(raw).extract(REF_CROP).toBuffer();
}

/** バリアントの mp4 から指定秒のコマを取る */
function variantFrame(name, t) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  if (!existsSync(mp4)) throw new Error(`${mp4} がありません。先に render-2d-pack-limit.mjs を実行してください`);
  const out = path.join(TMP, `${name}-${t}.png`);
  execFileSync(ffmpegPath, ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', out], { stdio: 'ignore' });
  return readFileSync(out);
}

/** 行 × 列のシートを組む（説明文は名前と時刻だけ） */
async function sheet(rows, file, cellW) {
  const cellH = Math.round(cellW * 9 / 16);
  const LBL = 20, PAD = 4;
  const cols = rows[0].frames.length;
  const canvas = createCanvas(cols * (cellW + PAD) + PAD, rows.length * (cellH + LBL + PAD) + PAD);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [r, row] of rows.entries()) {
    for (const [c, item] of row.frames.entries()) {
      const x = PAD + c * (cellW + PAD);
      const y = PAD + r * (cellH + LBL + PAD);
      const img = await loadImage(item.buffer);
      ctx.drawImage(img, x, y + LBL, cellW, cellH);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px JPUI, sans-serif';
      ctx.fillText(`${row.label}  ${item.t.toFixed(1)}s`, x + 3, y + 14);
    }
  }
  writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(file);
}

const refFrames = [];
for (const t of REF_TIMES) refFrames.push({ t, buffer: await refFrame(t) });
await sheet([{ label: 'REFERENCE', frames: refFrames }], path.join(OUT, 'reference-contact-sheet.png'), 700);

const rows = [{ label: 'REFERENCE', frames: refFrames }];
for (const [id, name] of VARIANTS) {
  const frames = OUT_TIMES.map((t) => ({ t, buffer: variantFrame(name, t) }));
  rows.push({ label: name, frames });
  // ★各バリアントのコンタクトシートも**動画から**作る（描き直さずに済む）
  await sheet([{ label: name, frames }], path.join(OUT, `${id}-contact-sheet.png`), 700);
}
await sheet(rows, path.join(OUT, 'compare-contact-sheet.png'), 430);
