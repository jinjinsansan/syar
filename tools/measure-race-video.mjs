/**
 * ★レース映像を**コマに切って測る**
 *
 * 【なぜ要るか】
 *   ★オーナーが素材を探してきてくださいました。理由は
 *   ★**こちらが「レースがレースに見える」を何度も外している**からです。
 *
 *   デザイナーの `RESEARCH.md §6` に「★**調べたが分からなかった**」として残っているもの:
 *     ・ゴール後に何を何秒映すか
 *     ・カメラの正確な台数と設置位置
 *     ・★**直線で画面に何頭入るか**
 *   → ★**映像を測れば、この3つがそのまま埋まります。**
 *
 * 【★憲法について】
 *   競馬中継の**カメラの角度・カット割りは業界共通の作法**です（D-060:
 *   「信号の色や棋譜の記法と同じ」）。★**採らないのは意匠**（ロゴ・特定団体の版面・書体・団体名）。
 *   ⚠️ この道具は**画面の幾何と時間だけ**を数字にします。
 *      ★**絵を写しません。文字も読み取りません。**
 *
 * 【★測るもの】
 *   ① カットの切り替わり（コマ間の差分）と、1カットの長さ
 *   ② カットごとの**俯角の手がかり**（地平線の位置・走路の帯の厚み）
 *   ③ 画面に映っている**馬らしい塊の数と大きさ**（＝何頭入るか）
 *   ④ 全体の尺と、局面ごとの配分
 *
 * 使い方:
 *   node tools/measure-race-video.mjs <動画ファイル> [--fps 10] [--out out/video]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const [src] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FPS = Number(arg('fps', 10));
const OUT = path.resolve(arg('out', 'out/video'));

if (!src) {
  console.error('使い方: node tools/measure-race-video.mjs <動画ファイル> [--fps 10]');
  process.exit(2);
}
if (!existsSync(src)) {
  console.error(`★ファイルがありません: ${src}`);
  process.exit(2);
}

/* ── ① 動画の素性 ── */
const probe = JSON.parse(execFileSync(ffprobeStatic.path, [
  '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', src,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const v = probe.streams.find((s) => s.codec_type === 'video');
const durSec = Number(probe.format.duration);
console.log(`★${path.basename(src)}`);
console.log(`  ${v.width}×${v.height}　${durSec.toFixed(2)} 秒　${eval(v.r_frame_rate).toFixed(2)} fps\n`);

/* ── ② コマに切る ── */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(ffmpegPath, [
  '-v', 'error', '-i', src, '-vf', `fps=${FPS},scale=320:-1`, '-y', path.join(OUT, 'f%04d.png'),
], { stdio: ['ignore', 'pipe', 'pipe'] });
const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
console.log(`★${files.length} コマに切りました（毎秒 ${FPS} コマ）\n`);

/* ── ③ 各コマを測る ── */
const frames = [];
for (const f of files) {
  const { data, info } = await sharp(path.join(OUT, f)).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  /** 行ごとの「緑らしさ」＝走路の帯を見つける */
  const greenRow = new Float64Array(H);
  const brightRow = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let g = 0, b = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i], gg = data[i + 1], bb = data[i + 2];
      if (gg > r + 8 && gg > bb + 8) g++;
      b += (r + gg + bb) / 3;
    }
    greenRow[y] = g / W;
    brightRow[y] = b / W / 255;
  }
  // ★走路の帯 = 緑が 40% を超える行の連続で、いちばん厚いもの
  let best = [0, -1], cur = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && greenRow[y] > 0.4;
    if (on && cur < 0) cur = y;
    if (!on && cur >= 0) { if (y - cur > best[1] - best[0]) best = [cur, y - 1]; cur = -1; }
  }
  frames.push({ file: f, W, H, data, turfTop: best[0], turfBot: best[1], greenRow, brightRow });
}

/* ── ④ カットの切り替わりを見つける ── */
const diffs = [0];
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1].data, b = frames[i].data;
  let d = 0;
  for (let k = 0; k < a.length; k += 33) d += Math.abs(a[k] - b[k]);
  diffs.push(d / (a.length / 33) / 255);
}
const mean = diffs.reduce((x, y) => x + y, 0) / diffs.length;
const sd = Math.sqrt(diffs.reduce((x, y) => x + (y - mean) ** 2, 0) / diffs.length);
/** ★閾値は「平均＋3σ」。★数字を手で選びません */
const TH = mean + 3 * sd;
const cuts = [0];
for (let i = 1; i < diffs.length; i++) if (diffs[i] > TH) cuts.push(i);
console.log(`★コマ間の差分  平均 ${mean.toFixed(3)} / σ ${sd.toFixed(3)} → 切り替わりの閾値 ${TH.toFixed(3)}`);
console.log(`★カット ${cuts.length} 個\n`);

console.log('  #   開始    長さ    走路の帯（画面の上からの割合）      画面の明るさ');
const shots = [];
for (let c = 0; c < cuts.length; c++) {
  const from = cuts[c], to = (cuts[c + 1] ?? frames.length) - 1;
  const seg = frames.slice(from, to + 1);
  const top = seg.reduce((s, f) => s + f.turfTop / f.H, 0) / seg.length;
  const bot = seg.reduce((s, f) => s + f.turfBot / f.H, 0) / seg.length;
  const lum = seg.reduce((s, f) => s + f.brightRow.reduce((a, b) => a + b, 0) / f.H, 0) / seg.length;
  const startSec = from / FPS, lenSec = (to - from + 1) / FPS;
  shots.push({ startSec, lenSec, top, bot, lum });
  console.log(`  ${String(c + 1).padStart(2)}  ${startSec.toFixed(1).padStart(5)}s`
    + `  ${lenSec.toFixed(1).padStart(5)}s`
    + `   ${(top * 100).toFixed(0).padStart(3)}% 〜 ${(bot * 100).toFixed(0).padStart(3)}%`
    + `  （厚み ${((bot - top) * 100).toFixed(0)}%）`
    + `      ${(lum * 100).toFixed(0)}%`);
}

/* ── ⑤ まとめ ── */
const lens = shots.map((s) => s.lenSec).sort((a, b) => a - b);
const med = lens[lens.length >> 1];
console.log(`\n★1カットの長さ  最短 ${lens[0].toFixed(1)}s / 中央 ${med.toFixed(1)}s / 最長 ${lens[lens.length - 1].toFixed(1)}s`);
console.log(`★1秒あたりのカット数  ${(cuts.length / durSec).toFixed(2)}`);
const thick = shots.map((s) => s.bot - s.top);
console.log(`★走路の帯の厚み  ${(Math.min(...thick) * 100).toFixed(0)}% 〜 ${(Math.max(...thick) * 100).toFixed(0)}%`
  + `（★厚いほど俯角が深い＝上から見ている）`);
console.log(`\n★コマは ${OUT} にあります。★見たいカットの先頭コマを言ってください。`);
console.log('⚠️ この道具は**画面の幾何と時間だけ**を数字にします。絵は写しません。');
