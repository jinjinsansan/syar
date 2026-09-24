/**
 * ★**騎手なしの馬（真横・歩き 8 コマ）を、育成側の画面が読む形で `/art/uma/` に置く**（★2026-09-24）
 *
 * 【★なぜ要るか】
 *   ★オーナー指摘「★誕生・調教・育成の馬がレースの馬と乖離している」。
 *   ★これまで育成用の馬を ★**別に焼いて**いたので、★焼くたびに絵柄がずれました（★3 回差し戻し）。
 *   ★オーナー決定（2026-09-24）「★そもそもレースの馬は生成できる。★真横の馬を見せればいい」。
 *   → ★**レースの歩き 8 コマ（`horse-jockey-side-walk-v1-poseNN.png`）から騎手だけを消した**ものを使います。
 *     ★体・顔・線・陰影はレースの馬そのものなので、★乖離は原理的に起きません。
 *
 * 【★上流（★この道具の入力がどこから来たか）】
 *   ① `design/art/prompts/walk-remove-jockey.txt`（★騎手・鞍・頭絡・手綱**だけ**を消す指示）
 *   ② `node tools/codex-imagegen.mjs <上の指示> out/gen/walk-nojockey-NN.png` を 8 回
 *   ③ `node tools/align-pose-set.mjs 'out/gen/walk-nojockey-{NN}.png' 'out/gen/walk-aligned/{NN}.png'`
 *      ★（★02 と 04 が 11% 大きく戻ってきたため。★揃え後 接地 1.7% / 高さ 2.6%）
 *   ④ ★この道具
 *
 * 【★やること】
 *   ★8 コマ**共通**の外接矩形で切り出し（★コマごとに切るとアニメがガタつく）→ 幅 `OUT_W` へ縮小 → png と webp
 *   ★立ち姿は「★下端の帯にある画素の横幅がいちばん狭いコマ」＝ ★四肢がいちばん体の下に集まっているコマ
 *
 * ⚠️ ★DB に触れません（★画像を書くだけ）。★入力が 8 コマ揃っていなければ ★**何も置きません**。
 * ⚠️ ★毛色は焼き込みません（★画面が `coatCssFilter` で掛けます・★裁定 20260923 §9）。
 *
 * ★実行: node tools/publish-uma-horse-frames.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'out/gen/walk-aligned';
const OUT = 'apps/web/public/art/uma';
/** ★画面での表示幅 272px の 2 倍（★高解像度の端末で滲まない最小） */
const OUT_W = 544;
/** ★外接矩形に足す余白（★幅に対する割合。★drop-shadow が切れないように） */
const PAD = 0.015;
/** ★立ち姿を選ぶときに見る「足元の帯」（★被写体高に対する割合） */
const FOOT_BAND = 0.1;
/**
 * ★顔アップの切り出し（★共通の切り出し矩形に対する割合）。
 * ★**顔も焼き直しません**（★立ち姿と同じ絵から切ります）。★焼くと絵柄がずれるのが今回の差し戻しの原因でした。
 */
const HEAD = { x0: 0.700, y0: 0.01, x1: 1.0, y1: 0.56 };
/** ★顔アップの書き出し幅（★画面の枠 96px の 2.5 倍） */
const HEAD_W = 240;

const nn = (i) => String(i + 1).padStart(2, '0');

const missing = Array.from({ length: 8 }, (_, i) => `${SRC}/${nn(i)}.png`).filter((f) => !existsSync(f));
if (missing.length > 0) {
  console.error(`★入力が揃っていません（${8 - missing.length}/8）。★何も置きませんでした。`);
  console.error(missing.map((f) => `    ${f}`).join('\n'));
  process.exit(1);
}

/** ★1 コマ読んで、外接矩形と足元の帯の横幅を測る */
async function measure(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < 16) continue;
      if (x < l) l = x; if (x > r) r = x;
      if (y < t) t = y; if (y > b) b = y;
    }
  }
  // ★足元の帯（★下端から被写体高の FOOT_BAND ぶん）に載っている画素の左右の幅
  const bandTop = Math.floor(b - (b - t) * FOOT_BAND);
  let fl = w, fr = -1;
  for (let y = bandTop; y <= b; y += 1) {
    for (let x = l; x <= r; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < 16) continue;
      if (x < fl) fl = x; if (x > fr) fr = x;
    }
  }
  return { w, h, l, t, r, b, footSpan: fr - fl };
}

const m = [];
for (let i = 0; i < 8; i += 1) m.push(await measure(`${SRC}/${nn(i)}.png`));

/** ★8 コマ共通の切り出し矩形（★和集合 ＋ 余白） */
const uni = {
  l: Math.min(...m.map((s) => s.l)),
  t: Math.min(...m.map((s) => s.t)),
  r: Math.max(...m.map((s) => s.r)),
  b: Math.max(...m.map((s) => s.b)),
};
const pad = Math.round((uni.r - uni.l) * PAD);
const left = Math.max(0, uni.l - pad);
const top = Math.max(0, uni.t - pad);
const width = Math.min(m[0].w - left, uni.r - uni.l + pad * 2);
const height = Math.min(m[0].h - top, uni.b - uni.t + pad * 2);
const outH = Math.round((height / width) * OUT_W);

console.log('=== 騎手なし 真横 歩き 8 コマ ===');
console.log(`  共通の切り出し: ${width}x${height} @(${left},${top})  →  ${OUT_W}x${outH}`);
console.log('  コマ  足元の帯の横幅');

mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 8; i += 1) {
  const base = sharp(`${SRC}/${nn(i)}.png`).extract({ left, top, width, height })
    .resize(OUT_W, outH, { fit: 'fill', kernel: 'lanczos3' });
  await base.clone().png({ compressionLevel: 9 }).toFile(`${OUT}/horse-walk-${nn(i)}.png`);
  await base.clone().webp({ quality: 90 }).toFile(`${OUT}/horse-walk-${nn(i)}.webp`);
  console.log(`   ${nn(i)}  ${String(m[i].footSpan).padStart(5)}`);
}

/** ★立ち姿 ＝ 足元の帯がいちばん狭いコマ（★四肢が体の下に集まっている） */
const stand = m.reduce((best, s, i) => (s.footSpan < m[best].footSpan ? i : best), 0);
const standSrc = sharp(`${SRC}/${nn(stand)}.png`).extract({ left, top, width, height })
  .resize(OUT_W, outH, { fit: 'fill', kernel: 'lanczos3' });
await standSrc.clone().png({ compressionLevel: 9 }).toFile(`${OUT}/horse-stand.png`);
await standSrc.clone().webp({ quality: 90 }).toFile(`${OUT}/horse-stand.webp`);
console.log(`\n★立ち姿 = コマ ${nn(stand)}（足元 ${m[stand].footSpan}px・いちばん狭い） → ${OUT}/horse-stand.webp`);
console.log(`★歩き 8 コマ → ${OUT}/horse-walk-01..08.webp`);

/** ★顔アップ（★立ち姿と同じコマから切る） */
const headRect = {
  left: left + Math.round(HEAD.x0 * width),
  top: top + Math.round(HEAD.y0 * height),
  width: Math.round((HEAD.x1 - HEAD.x0) * width),
  height: Math.round((HEAD.y1 - HEAD.y0) * height),
};
const headH = Math.round((headRect.height / headRect.width) * HEAD_W);
const head = sharp(`${SRC}/${nn(stand)}.png`).extract(headRect).resize(HEAD_W, headH, { kernel: 'lanczos3' });
await head.clone().png({ compressionLevel: 9 }).toFile(`${OUT}/horse-face.png`);
await head.clone().webp({ quality: 92 }).toFile(`${OUT}/horse-face.webp`);
console.log(`★顔アップ（コマ ${nn(stand)} から切り出し・焼いていない） → ${OUT}/horse-face.webp  ${HEAD_W}x${headH}`);

/**
 * ★横並びのスプライト表（★8 コマを 1 枚に）。
 *   ★画面は `background-position` を `steps(8)` で送ります（★JS のタイマーを持たない・★停止スイッチが効く）。
 *   ⚠️ ★1 枚にするのは ★**読み込みを 1 回にするため**です（★8 枚だと歩き出しの数コマが抜けます）。
 */
const sheet = sharp({
  create: { width: OUT_W * 8, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(await Promise.all(Array.from({ length: 8 }, async (_, i) => ({
  input: await sharp(`${SRC}/${nn(i)}.png`).extract({ left, top, width, height })
    .resize(OUT_W, outH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer(),
  left: OUT_W * i,
  top: 0,
}))));
await sheet.clone().png({ compressionLevel: 9 }).toFile(`${OUT}/horse-walk-sheet.png`);
await sheet.clone().webp({ quality: 90 }).toFile(`${OUT}/horse-walk-sheet.webp`);
console.log(`★スプライト表 → ${OUT}/horse-walk-sheet.webp  ${OUT_W * 8}x${outH}（★画面は background-size: 800% 100%）`);
