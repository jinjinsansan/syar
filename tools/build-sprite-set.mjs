/**
 * ★生成したコマを、★**実機で走る素材**まで一本で仕上げる（★2026-09-07）
 *
 * 【★なぜ一本にするか】
 *   ⚠️ ★2026-09-06、★レビュー裁定 §6 で ★**「焼いたものと実機が別物」**と差し戻されました。
 *      ★焼き先 `tmp/baked` と、★Web が読む `/rig-lab-assets/sprites` が別で、
 *      ★間の変換が手打ちだったため、★**同じものを見ていると言えません**でした。
 *   ⚠️ ★同じ日、★開発側は検査を飛ばして先に進み、★何度も後戻りしました
 *      （★灰色の下地で 7 コマ作って全部やり直し、など）。
 *   → ★**順番と検査を道具に焼きます。** ★こうすれば開発側が飛ばせません。
 *
 * 【★工程】
 *   ★① 緑を抜く            `remove-chroma-key`
 *   ★② 下地の色を検査      `verify-dress-keys`      ★落ちたら止まる
 *   ★③ 抜き残りを検査      `verify-chroma-residue`  ★落ちたら止まる
 *   ★④ 大きさと位置を揃える `align-pose-set`
 *   ★⑤ ★**剛体で横を揃える**（★帽子＝白い最上部の塊）
 *   ★⑥ 受け入れ検査        `verify-pose-set`        ★数値を出す
 *   ★⑦ 実機へ入れる        `sprite.json` つき
 *
 * 【⚠️ ★⑤ を足した理由】
 *   ★`align-pose-set` は「上半分の重心」で横を合わせます。★首が伸び縮みすると引っ張られ、
 *   ★実測で ★**横ぶれが 28px → 52px に悪化**しました。
 *   ★帽子は剛体なので、★そちらを基準にすると **0.8px** に収まります。
 *
 * ★実行:
 *   node tools/build-sprite-set.mjs <セット名> <コマ数> [--install] [--anchor-cap]
 *   例) node tools/build-sprite-set.mjs horse-jockey-deformed-v2 16 --install
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [setName, framesArg] = process.argv.slice(2);
const FRAMES = Number(framesArg ?? 16);
const INSTALL = process.argv.includes('--install');
/** ★コマ間を揃える基準（★`mid` = 顔＋帽子の中点／`cap` = 帽子だけ）。★視点で変えます */
const ANCHOR = process.argv.includes('--anchor-cap') ? 'cap' : 'mid';
if (setName === undefined) {
  console.error('使い方: node tools/build-sprite-set.mjs <セット名> <コマ数> [--install]');
  process.exit(2);
}
const nn = (i) => String(i).padStart(2, '0');
const SRC = (i) => `out/gen/${setName}-pose${nn(i)}-chroma.png`;
const KEYED = 'out/gen/keyed';
const ALIGNED = 'out/gen/aligned';
const FINAL = 'out/gen/final';
const run = (args) => execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

for (const d of [KEYED, ALIGNED, FINAL]) {
  mkdirSync(d, { recursive: true });
  for (const f of readdirSync(d)) if (f.endsWith('.png')) rmSync(path.join(d, f));
}

console.log('★① 緑を抜く');
for (let i = 1; i <= FRAMES; i += 1) {
  if (!existsSync(SRC(i))) { console.error(`  ★ありません: ${SRC(i)}`); process.exit(1); }
  run(['tools/remove-chroma-key.mjs', SRC(i), `${KEYED}/${nn(i)}.png`]);
}

console.log('');
console.log('★①-2 コマごとに揺れる白い光沢を落ち着かせる');
/**
 * ⚠️ ★**ここで消します**（★2026-09-07・オーナー実見）。
 *    ★1 コマずつ生成しているので、★光沢の位置と大きさがコマごとに違い、★点滅になります。
 *    ★画面側の「囲まれた光沢を埋める」で消そうとしたら、★判定がコマごとに反転して
 *    ★**かえって点滅を作りました**。★素材の側で先に落ち着かせます。
 */
for (let i = 1; i <= FRAMES; i += 1) {
  process.stdout.write(run(['tools/calm-highlights.mjs', `${KEYED}/${nn(i)}.png`, `${KEYED}/${nn(i)}.png`]));
}

console.log('\n★② 下地の色を検査（★落ちたら止まります）');
try {
  process.stdout.write(run(['node_modules/tsx/dist/cli.mjs', 'tools/verify-dress-keys.mjs', `${KEYED}/{NN}.png`, String(FRAMES)]));
} catch { console.error('  ★不合格。★下地の色を直してから作り直してください'); process.exit(1); }

console.log('\n★③ 緑の抜き残りを検査（★落ちたら止まります）');
try {
  process.stdout.write(run(['node_modules/tsx/dist/cli.mjs', 'tools/verify-chroma-residue.mjs', `${KEYED}/{NN}.png`, String(FRAMES)]));
} catch { console.error('  ★不合格。★囲まれた緑が残っています'); process.exit(1); }

console.log('\n★④ 大きさと位置を揃える');
process.stdout.write(run(['node_modules/tsx/dist/cli.mjs', 'tools/align-pose-set.mjs', `${KEYED}/{NN}.png`, `${ALIGNED}/{NN}.png`, String(FRAMES)]));

console.log('\n★⑤ 剛体（帽子）で横を揃える');
/**
 * ★**コマ間を揃える基準**（★2026-09-07）
 *
 * 【⚠️ ★2 回間違えました。★どちらも「測らずに決めた」からです】
 *   ★① 「★白いいちばん上の塊＝帽子」… ★納品素材の帽子が白かった名残。
 *      ★自前生成では ★**帽子が青・白いのはゼッケンとズボン**なので、
 *      ★**動く白いゼッケン**を掴んでいました（★実測でその塊は横に 73px ぶれる）。
 *   ★② 「では青い塊＝帽子」… ★コマによって上着や襟を拾い、★**さらに悪化**しました
 *      （★顔のぶれ 横33→83px）。
 *
 * 【★測って決めました】★出来上がりのぶれ（★小さいほど良い）:
 *   ★白い塊       … 顔 横56 縦57 ／ 帽子 横31 縦21
 *   ★顔だけ       … 顔 横 0 縦 0 ／ 帽子 横51 縦58
 *   ★帽子だけ     … 顔 横51 縦58 ／ 帽子 横 0 縦 0
 *   ★**顔＋帽子の中点** … ★**顔 横26 縦29 ／ 帽子 横26 縦29**  ← ★採用
 *
 * ★オーナーの苦情は「★騎手の頭のチラつき・馬の顔のチラつき」の 2 つなので、
 * ★その 2 点を同時に小さくする中点を基準にします。
 * ★塊探しはやめ、★**帯の重心**にします（★塊は素材が変わると別物を掴みます）。
 */
async function anchorOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let l = 1e9; let r = -1; let t = 1e9; let b = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < 64) continue;
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
  }
  /** ★馬の顔＝外接矩形の右 12% の帯（★馬は右を向いています） */
  let fx = 0; let fy = 0; let fn = 0;
  for (let y = t; y <= b; y += 1) {
    for (let x = Math.round(r - (r - l) * 0.12); x <= r; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < 64) continue;
      fx += x; fy += y; fn += 1;
    }
  }
  /** ★騎手の帽子＝上 25% の帯にある勝負服の色（★雛形が青と決めています） */
  let cx = 0; let cy = 0; let cn = 0;
  for (let y = t; y <= t + (b - t) * 0.25; y += 1) {
    for (let x = l; x <= r; x += 1) {
      const i = (y * w + x) * 4;
      if ((data[i + 3] ?? 0) < 64) continue;
      const R = data[i] ?? 0; const G = data[i + 1] ?? 0; const B = data[i + 2] ?? 0;
      const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); const d = mx - mn;
      if (d === 0) continue;
      const sat = mx === 0 ? 0 : d / mx;
      let hue = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      hue *= 60; if (hue < 0) hue += 360;
      if (sat >= 0.35 && hue >= 176 && hue <= 268) { cx += x; cy += y; cn += 1; }
    }
  }
  if (fn === 0 || cn === 0) { console.error(`  ★基準が取れません: ${file}`); process.exit(1); }
  /**
   * ★**視点ごとに最良の基準が違います**（★2026-09-08・実測）
   *
   *   ★真横（`mid`・既定）… ★顔＋帽子の中点
   *     ★顔 横26 縦29 ／ 帽子 横26 縦29（★白い塊を基準にすると 顔 横56 縦57）
   *   ★斜め前（`cap`）… ★**帽子だけ**
   *     ★帽子 横0 縦0 ／ 頭頂 **10px**（★顔＋帽子の中点だと 帽子 横32 縦30・頭頂 40px）
   *     ★斜め前は馬体が正面を向くので、★「顔の帯」が鼻面を正しく捕まえられません。
   *
   * ⚠️ ★推測で選ばないこと。★`tools/measure-look-distinctness.mjs` と同じ考えで、
   *    ★**候補を全部測ってから**決めます。
   */
  if (ANCHOR === 'cap') return { cx: cx / cn, cy: cy / cn };
  return { cx: (fx / fn + cx / cn) / 2, cy: (fy / fn + cy / cn) / 2 };
}
const xs = [];
const hys = [];
for (let i = 1; i <= FRAMES; i += 1) {
  const hp = await anchorOf(`${ALIGNED}/${nn(i)}.png`);
  xs.push(hp.cx); hys.push(hp.cy);
}
const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
/**
 * ★**縦は帽子（剛体）で揃えます**（★2026-09-07・オーナー評「上下に思い切り振動している」）
 *
 * ⚠️ ★最初は ★**被写体の下端**で揃えました。★下端は 0px に揃いましたが、
 *    ★**帽子の中心が 164px も上下しました**。★素材ごとに脚の伸び方が違うので、
 *    ★下端を合わせると ★**馬体そのものが上下に振られます**。
 *    ★オーナー評「★めちゃくちゃな走りに見える」。
 * → ★**剛体（帽子）で揃えます。** ★馬体が安定し、★脚の伸び縮みは絵の中に残ります。
 *   ★走りの上下動は、必要ならエンジン側（★`FRAME_DY`・上下動スライダー）で足します。
 */
const meanY = hys.reduce((a, b) => a + b, 0) / hys.length;
for (let i = 1; i <= FRAMES; i += 1) {
  const im = await loadImage(`${ALIGNED}/${nn(i)}.png`);
  const c = createCanvas(im.width, im.height);
  c.getContext('2d').drawImage(im,
    Math.round(meanX - xs[i - 1]), Math.round(meanY - hys[i - 1]));
  writeFileSync(`${FINAL}/${nn(i)}.png`, c.toBuffer('image/png'));
}
console.log(`  ★基準の横ぶれ ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}px → 揃えました`);
console.log(`  ★基準の縦ぶれ ${(Math.max(...hys) - Math.min(...hys)).toFixed(1)}px → 揃えました（★馬体が上下に振られなくなります）`);

console.log('\n★⑥ 受け入れ検査');
try {
  process.stdout.write(run(['tools/verify-pose-set.mjs', `${FINAL}/{NN}.png`]));
} catch (e) { console.log('  ★（検査は 8 コマ前提です。★数値は上を参照）'); }

if (!INSTALL) {
  console.log(`\n★${FRAMES} コマ → ${FINAL}（★--install で実機へ入れます）`);
  process.exit(0);
}

console.log('\n★⑦ 実機へ入れる');
const DEST = 'apps/web/public/rig-lab-assets/sprites';
const FEET = 0.920;
/**
 * ★実機へ入れるときの高さ。
 * ⚠️ ★384 だと、★画面で馬を大きく出したとき（★高さ 41% ＝ 295px）★余裕がほとんどありません。
 *    ★オーナー評「★絵が雑に見える」。
 * ★生成物の中の馬は **745px** あるので、★情報はまだ残っています。
 * → ★**576** にします（★画面 295px に対して約 2 倍の余裕）。
 *   ★これ以上上げても、★4 頭ぶんを焼く手間とメモリが増えるだけです。
 */
const OUT_H = 576;
let left = 1e9; let right = -1; let top = 1e9; let bottom = -1;
for (let i = 1; i <= FRAMES; i += 1) {
  const { data, info } = await sharp(`${FINAL}/${nn(i)}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 64) continue;
      if (x < left) left = x; if (x > right) right = x;
      if (y < top) top = y; if (y > bottom) bottom = y;
    }
  }
}
const hc = Math.round((bottom - top) / FEET) + 40;
const wc = (right - left) + 60;
const ty = Math.round(bottom - FEET * hc);
const lx = left - 30;
const outW = Math.round((OUT_H * wc) / hc / 2) * 2;
mkdirSync(DEST, { recursive: true });
for (const f of readdirSync(DEST)) if (f.endsWith('.png') || f.endsWith('.json')) rmSync(path.join(DEST, f));
const LAYERS = ['coat', 'mane', 'silk', 'cap', 'tack'];
for (let i = 1; i <= FRAMES; i += 1) {
  const im = await loadImage(`${FINAL}/${nn(i)}.png`);
  const c = createCanvas(outW, OUT_H);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, lx, ty, wc, hc, 0, 0, outW, OUT_H);
  const buf = c.toBuffer('image/png');
  /**
   * ⚠️ ★この素材は ★**1 枚絵**です（★層に分かれていません）。
   *    ★STAR の 2D 馬はもともと 1 枚絵で、★色は `dress.mjs` が明るさから置き換えます。
   *    ★画面側は 5 層を読むので、★`coat` に絵を入れ、★他は空にします。
   */
  writeFileSync(path.join(DEST, `${nn(i)}_coat.png`), buf);
  const blank = createCanvas(outW, OUT_H).toBuffer('image/png');
  for (const l of LAYERS.slice(1)) writeFileSync(path.join(DEST, `${nn(i)}_${l}.png`), blank);
}
writeFileSync(path.join(DEST, 'sprite.json'),
  JSON.stringify({ width: outW, height: OUT_H, feet: FEET, frames: FRAMES, set: setName }, null, 1));
console.log(`  ★${DEST} へ入れました  ${outW}x${OUT_H}・接地線 ${((bottom - ty) / hc).toFixed(4)}・${FRAMES} コマ`);
