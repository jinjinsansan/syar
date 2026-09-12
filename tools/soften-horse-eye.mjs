/**
 * ★**馬の白目を落として、目が光らないようにする**（★2026-09-12・オーナー指摘）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★前からカーブバージョンの ★**馬の目が赤色になる現象**があり、
 *   ★**怒っているように見えています**」。
 *
 * 【★測った事実】★原版 `horse-jockey-diag-front-v4-pose01.png`（442×576）:
 *     ★頭の中に ★**ほぼ白（平均 rgb(234,227,222)）の塊が 234 画素**あります（★白目）。
 *   ★画面では馬の高さが ★およそ 160px で、★原版は ★**3.6 倍に縮みます**。
 *   ★白目は ★**18 画素ほどの明るい点**になり、★周りの鹿毛（橙）と混ざって
 *   ★**琥珀色に光る目**に見えます。★眉が下がった絵柄なので、★怒った顔に読めます。
 *
 * 【★何をするか】★白目だけを ★**暗く**します。★瞳・眉・輪郭は触りません。
 *   ★大きく写る検証台では白目のままが正しい絵ですが、★レース画面の大きさでは
 *   ★点光源になります。★**縮小して使う素材の側**を直します。
 *
 * ⚠️ ★**探すのは「頭の中の、白くて小さい塊」だけ**です。★騎手の白い勝負服・帽子・
 *    ★ゼッケンは ★**別の場所にあり、かつ大きい**ので、★位置と面積で外します。
 *    ★見つからなければ ★**何も書きません**（★R-27・狭い側へ倒す）。
 * ⚠️ ★元のファイルを上書きします。★戻すのは `git checkout` です。
 *    ★`--dry` で ★書かずに測るだけにできます。
 *
 * ★実行: node tools/soften-horse-eye.mjs [--prefix horse-jockey-diag-front-v4] [--dry]
 */
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const PREFIX = arg('prefix', 'horse-jockey-diag-front-v4');
const DRY = process.argv.includes('--dry');
const DIR = 'apps/web/public/art';

/** ★白目を塗り替える色。★暗く、★彩度は低め（★どの毛色でも暗いままにする） */
const EYE_DARK = [58, 40, 32];
/** ★白と見なす条件 */
/**
 * ★白目と見なす下限。★pose04（正面向き・両目）の白目は ★**rgb(112〜144)** の灰色で、
 * ★pose01（横向き・片目）は ★**rgb(240)** の白でした（★実測）。★両方を拾う値にします。
 */
const WHITE_MAX = 100;
const WHITE_SAT = 0.30;
/** ★頭のある範囲（★絵の右上。★騎手の白い服・帽子は左上にある） */
const HEAD = { x0: 0.60, x1: 1.0, y0: 0.20, y1: 0.52 };
/** ★1 つの塊として許す面積（★原版の画素数）。★これを超えるものは服・鞍布とみなす */
const MAX_BLOB = 1200;
const MIN_BLOB = 60;

const files = readdirSync(DIR)
  .filter((f) => f.startsWith(`${PREFIX}-pose`) && f.endsWith('.png'))
  .sort();
if (files.length === 0) throw new Error(`★${PREFIX} の原版が見つかりません`);

console.log(`★${PREFIX} ／ ${files.length} 枚${DRY ? '（★書きません）' : ''}`);
for (const file of files) {
  const img = await loadImage(path.join(DIR, file));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, img.width, img.height);
  const d = image.data;
  const W = img.width, H = img.height;
  const box = {
    x0: Math.round(W * HEAD.x0), x1: Math.round(W * HEAD.x1),
    y0: Math.round(H * HEAD.y0), y1: Math.round(H * HEAD.y1),
  };
  /** ★白い画素の印 */
  const white = new Uint8Array(W * H);
  for (let y = box.y0; y < box.y1; y += 1) for (let x = box.x0; x < box.x1; x += 1) {
    const i = (y * W + x) * 4;
    if ((d[i + 3] ?? 0) < 200) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx < WHITE_MAX) continue;
    if ((mx - mn) / mx > WHITE_SAT) continue;
    white[y * W + x] = 1;
  }
  /** ★連結した塊に分ける（★4 近傍） */
  const seen = new Uint8Array(W * H);
  const blobs = [];
  for (let y = box.y0; y < box.y1; y += 1) for (let x = box.x0; x < box.x1; x += 1) {
    const start = y * W + x;
    if (white[start] !== 1 || seen[start] === 1) continue;
    const stack = [start];
    const cells = [];
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop();
      cells.push(p);
      const px = p % W, py = (p - px) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < box.x0 || nx >= box.x1 || ny < box.y0 || ny >= box.y1) continue;
        const q = ny * W + nx;
        if (white[q] !== 1 || seen[q] === 1) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    blobs.push(cells);
  }
  /**
   * ⚠️ ★**いちばん大きい塊 1 つだけ**を塗ります（★2026-09-12）。
   *    ★閾値を下げて灰色まで拾うと、★**面繋（金具）・鼻の照り・耳の内側**まで 30 個近く
   *    ★引っかかります（★実測）。★それを塗ると素材を壊します。
   *    ★白目は ★**頭の中でいちばん大きな低彩度の塊**で、★実測 170〜327 画素・
   *    ★位置も x 265〜347 / y 166〜262 に固まっています。★そこだけ塗ります。
   * ⚠️ ★正面向きの pose04 は両目ですが、★白目が灰色（rgb 112〜144）なので
   *    ★もともと光りません。★片目だけ暗くしても画面の大きさでは差が出ません。
   */
  const largest = blobs.reduce((m, b) => (m === undefined || b.length > m.length ? b : m), undefined);
  const eyes = largest !== undefined && largest.length >= MIN_BLOB && largest.length <= MAX_BLOB
    ? [largest] : [];
  const painted = eyes.reduce((a, b) => a + b.length, 0);
  const bounds = eyes.length === 0 ? null : (() => {
    const xs = eyes.flat().map((p) => p % W), ys = eyes.flat().map((p) => Math.floor(p / W));
    return `x ${Math.min(...xs)}〜${Math.max(...xs)} / y ${Math.min(...ys)}〜${Math.max(...ys)}`;
  })();
  if (DRY) console.log(`     塊の大きさ: ${blobs.map((b) => b.length).sort((a, b) => b - a).join(' ')}`);
  console.log(`  ${file}  白い塊 ${blobs.length} 個 → ★目とみなした ${eyes.length} 個 ／ ${painted} 画素`
    + (bounds === null ? '' : `（${bounds}）`));
  if (eyes.length === 0 || DRY) continue;
  for (const cells of eyes) for (const p of cells) {
    const i = p * 4;
    d[i] = EYE_DARK[0]; d[i + 1] = EYE_DARK[1]; d[i + 2] = EYE_DARK[2];
  }
  g.putImageData(image, 0, 0);
  writeFileSync(path.join(DIR, file), c.toBuffer('image/png'));
}
console.log(DRY ? '★書いていません（--dry）' : '★書き換えました。★戻すには git checkout');
