/**
 * ★**2D の参考映像を測る**（第3便の §6 を埋めるため）
 *
 * 【⚠️ 前回の失敗をここで防ぎます】
 *   ★前回、参考動画の測定が**全部無効**でした。
 *     **スマホの枠と、字幕の黒帯を測っていた**からです。
 *   → ★**まずゲームの画がどこかを機械で決めて**から測ります。
 *     決めた範囲は PNG に書き出すので、★**目で確かめられます**。
 *
 * 【★測るもの】
 *   ① ゲームの画の範囲と縦横比
 *   ② 走路の帯（内ラチ〜外ラチ）が画面の高さの何割か
 *   ③ 馬の幅が画面の幅の何割か（★これは切り出しを見て人が測る）
 *
 * 実行: npx tsx tools/measure-ref2d.mjs --src <参考映像> [--at 45]
 */
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * ★参考映像のパスは**引数で受け取ります**。
 *
 * ⚠️ ★ここに**他社製品の名前を直接書いていました**（憲法違反）。
 *    「★他社製品の固有名称（製品名・機能名）を**コード内の変数名・コメント・出力にも書かない**」。
 *    ファイル名だからと書いてしまい、★**出力にもそのまま出ていました。**
 * → ★**参考素材は追跡しません**（`.gitignore`）。パスは実行時に渡します。
 */
const SRC = (() => {
  const i = process.argv.indexOf('--src');
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  throw new Error('★参考映像のパスを --src で渡してください（このコードには書きません）');
})();
const OUT = path.resolve('out/ref2d');
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const ATS = argv.includes('--at') ? [num('--at', 45)] : [8, 15, 22, 30, 38, 45, 50];

mkdirSync(OUT, { recursive: true });

/**
 * ★1行のうち「**芝の緑**」がどれだけ占めるか。
 *
 * ⚠️ ★最初は「横方向の変化の量」で画の範囲を決めようとして、**失敗しました**。
 *    字幕の**巨大な黄色文字**のほうが変化が大きく、ゲームの画が閾値に届かず、
 *    ★**範囲が1画素**になりました。
 *    ★**前回とまったく同じ罠**です（スマホの枠と黒帯を測っていた）。
 * → ★競馬の画にあって Shorts の UI に無いもの＝**芝の緑**で決めます。
 */
function greenRatio(data, info, y) {
  let n = 0;
  for (let x = 0; x < info.width; x += 1) {
    const o = (y * info.width + x) * info.channels;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    // ★緑が他の2色より明確に強く、暗すぎない
    if (g > r + 12 && g > b + 12 && g > 40) n += 1;
  }
  return n / info.width;
}

console.log('# ★2D の参考映像を測る');
// ⚠️ ★パスは出しません（他社製品の名前が**出力**に混じるため。憲法）
console.log('  （参考素材のパスは出力しません）\n');

/**
 * ★**画の範囲は動画を通して一定**です（Shorts の枠は動きません）。
 *
 * ⚠️ ★1コマだけで決めようとして失敗しました。実況帯・砂・スタンドで
 *    **緑が途切れる**ので、コマごとに範囲が 24px〜102px とバラバラに出ました。
 * → ★**多くのコマの「和」**で決めます。どこかのコマで芝が写っていれば、そこは画の中です。
 */
const PROBE = [5, 10, 14, 18, 24, 28, 33, 36, 40, 43, 47, 51];
let acc = null;
for (const t of PROBE) {
  const f = path.join(OUT, `probe-${t}.png`);
  execFileSync(ffmpeg, ['-y', '-ss', String(t), '-i', SRC, '-frames:v', '1', f], { stdio: 'pipe' });
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (acc === null) acc = new Array(info.height).fill(0);
  for (let y = 0; y < info.height; y += 1) acc[y] = Math.max(acc[y], greenRatio(data, info, y));
}
const gTop = acc.findIndex((v) => v > 0.25);
const gBottom = acc.length - 1 - [...acc].reverse().findIndex((v) => v > 0.25);
console.log(`★ゲームの画の範囲（${PROBE.length}コマの和）: y = ${gTop} .. ${gBottom}`
  + `（高さ ${gBottom - gTop + 1}px）\n`);

for (const t of ATS) {
  const raw = path.join(OUT, `raw-${t}.png`);
  execFileSync(ffmpeg, ['-y', '-ss', String(t), '-i', SRC, '-frames:v', '1', raw], { stdio: 'pipe' });
  const { data, info } = await sharp(raw).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  /**
   * ★**ゲームの画の範囲**を決める。
   *   Shorts の画面は、上下が**黒に近く、横の変化がほとんど無い**帯です
   *   （字幕は明るいので「黒い」だけでは切れません → ★**変化の量**も見ます）。
   */
  const top = gTop, bottom = gBottom;
  const gh = bottom - top + 1;

  // ★切り出して見られるようにする（★数字だけで済ませない）
  await sharp(raw).extract({ left: 0, top, width: info.width, height: gh })
    .resize({ width: info.width * 4, kernel: 'nearest' })
    .toFile(path.join(OUT, `game-${t}.png`));

  /**
   * ★**走路の帯**。ラチは**明るい線**なので、列ごとに「明るい線」を上下2本探します。
   *   ⚠️ 走路は斜めなので、**列によって帯の高さが違います**。中央の列で測ります。
   */
  const cx = Math.floor(info.width / 2);
  const col = [];
  for (let y = top; y <= bottom; y += 1) {
    const o = (y * info.width + cx) * info.channels;
    col.push((data[o] + data[o + 1] + data[o + 2]) / 3);
  }
  const mx = Math.max(...col);
  const bright = col.map((v, i) => ({ v, i })).filter((p) => p.v > mx * 0.82).map((p) => p.i);
  const band = bright.length >= 2 ? bright[bright.length - 1] - bright[0] : 0;
  // ★中央の列で「芝の緑」が連続する範囲（＝走路がどれだけ縦を占めるか）
  let gRun = 0, run = 0;
  for (let y = top; y <= bottom; y += 1) {
    const o = (y * info.width + cx) * info.channels;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (g > r + 12 && g > b + 12 && g > 40) { run += 1; if (run > gRun) gRun = run; } else run = 0;
  }

  console.log(`  ${String(t).padStart(2)}秒  ラチ間 ${String(band).padStart(3)}px = ${String((band / gh * 100).toFixed(0)).padStart(2)}%`
    + `　芝が連続 ${String(gRun).padStart(3)}px = ${(gRun / gh * 100).toFixed(0)}%`);
}

console.log(`\n★${OUT}/game-*.png に切り出しました（4倍）。`);
console.log('⚠️ ★馬の幅は自動で測りません。**切り出しを見て測ります**（圧縮で輪郭が溶けるため）。');
