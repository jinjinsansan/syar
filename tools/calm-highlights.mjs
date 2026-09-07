/**
 * ★**コマごとに形が変わる白い光沢を落ち着かせる**（★2026-09-07）
 *
 * 【★なぜ要るか — ★オーナー実見】
 *   ★「騎手の帽子のところに出る点滅のようなチラつき」
 *   ★「馬の眉間から鼻にかけて出る白いチラつき」
 *
 *   ★1 コマずつ生成しているので、★**光沢の位置と大きさがコマごとに違います**。
 *   ★実測（★頭と帽子まわりの白い画素）:
 *     ★馬の頭 807〜917px（★差 110）／★帽子 366〜813px（★差 447 ＝ 2.2 倍）
 *   ★止めて見ると気づきませんが、★8 コマを回すと**点滅**になります。
 *
 * 【⚠️ ★最初の直しは間違いでした】
 *   ★画面側の「勝負服に囲まれた光沢を埋める」で消そうとしましたが、
 *   ★**塊が囲まれているかの判定がコマごとに反転**し、★かえって点滅を作っていました
 *   （★実測: 頭の中の埋めが 216 / 227 / **384** / 230 / **384** / 236 …）。
 *   → ★**素材の側で、生成時から消します。** ★画面側の判定に頼りません。
 *
 * 【★どう分けるか — ★測って決めました】
 *   ★白い塊の大きさで分かれます（★全 8 コマ実測）:
 *     ★目          … ★342〜430px（★残す）
 *     ★ゼッケン・ズボン … ★600px 以上（★残す）
 *     ★チラつく光沢 … ★最大 **154px**（★消す）
 *   → ★境目 **248px**。
 *
 * ★消し方は「周りの色で塗り直す」ではなく「明るさを周りに寄せる」です。
 *   ★形を消すのではなく、★**目立たなくする**（★輪郭や陰影を壊しません）。
 *
 * ★実行: node tools/calm-highlights.mjs <入力.png> <出力.png>
 */
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error('使い方: node tools/calm-highlights.mjs <入力.png> <出力.png>');
  process.exit(2);
}

/** ★白とみなす線 */
const WHITE_V = 0.78;
const WHITE_S = 0.20;
/**
 * ★これより小さい白い塊は「チラつく光沢」。
 * ★実測（★処理する `out/gen/keyed` の 1536x1024 で）:
 *   ★ゼッケン・ズボン … 3,169〜7,550px（★残す）
 *   ★目               … 1,105px（★残す）
 *   ★鼻筋・額の白い筋 … ★333〜402px（★消す）
 *   ★帽子の光沢       … ★88px（★消す）
 * ⚠️ ★最初 248px と置いたら、★**鼻筋の筋（333〜402px）が素通り**しました。
 */
const STRAY_MAX = 600;
/**
 * ★どこまで落とすか（★1 = そのまま、0 = 周りと同じ明るさ）。
 * ⚠️ ★0.35 では ★**帽子の点滅が残りました**（★実測: 頭頂に 23〜38px の光沢が 7/8 コマ）。
 *    ★光沢のすぐ周りも明るいので、★寄せ先が明るく、★落としきれませんでした。
 * → ★0.15 まで下げます。★形は残るので、★立体感は失われません。
 */
const KEEP = 0.15;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width; const h = info.height;
const out = Buffer.from(data);

const white = new Uint8Array(w * h);
for (let k = 0; k < w * h; k += 1) {
  const i = k * 4;
  if ((data[i + 3] ?? 0) < 128) continue;
  const r = data[i] ?? 0; const g = data[i + 1] ?? 0; const b = data[i + 2] ?? 0;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const v = mx / 255; const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (v > WHITE_V && sat < WHITE_S) white[k] = 1;
}

const seen = new Uint8Array(w * h);
let calmed = 0; let kept = 0;
for (let k0 = 0; k0 < w * h; k0 += 1) {
  if (white[k0] === 0 || seen[k0] === 1) continue;
  const stack = [k0]; seen[k0] = 1;
  const cells = [];
  while (stack.length > 0) {
    const k = stack.pop();
    cells.push(k);
    const x = k % w; const y = (k - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (white[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; stack.push(nk); }
    }
  }
  if (cells.length > STRAY_MAX) { kept += cells.length; continue; }
  /**
   * ★塊のまわり（★白でない不透明な画素）の ★**平均の色**へ寄せます。
   *
   * ⚠️ ★最初は「平均の**明るさ**」へ寄せました。★実測で ★**帽子の光沢が消えませんでした**。
   *    ★帽子は青（例 #3f8fd8）で、★明るさ（最大チャンネル）が 0.85 と高いので、
   *    ★白い光沢を「同じ明るさ」に寄せても ★**白いまま**だったためです。
   * → ★色そのものに寄せます。★帽子の光沢は「少し明るい青」に、
   *   ★鼻筋の白い筋は「少し明るい茶」になります。★形は残るので立体感は失われません。
   */
  let sr = 0; let sg = 0; let sb = 0; let n = 0;
  for (const k of cells) {
    const x = k % w; const y = (k - x) / w;
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (white[nk] === 1) continue;
      const i = nk * 4;
      if ((out[i + 3] ?? 0) < 128) continue;
      sr += out[i] ?? 0; sg += out[i + 1] ?? 0; sb += out[i + 2] ?? 0;
      n += 1;
    }
  }
  if (n === 0) continue;
  const ar = sr / n; const ag = sg / n; const ab = sb / n;
  for (const k of cells) {
    const i = k * 4;
    out[i] = Math.round(ar + ((out[i] ?? 0) - ar) * KEEP);
    out[i + 1] = Math.round(ag + ((out[i + 1] ?? 0) - ag) * KEEP);
    out[i + 2] = Math.round(ab + ((out[i + 2] ?? 0) - ab) * KEEP);
    calmed += 1;
  }
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`  ★落ち着かせた ${calmed} 画素／残した ${kept} 画素（目・ゼッケン・ズボン）`);
