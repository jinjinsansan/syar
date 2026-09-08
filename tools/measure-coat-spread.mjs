/**
 * ★**毛色 7 色が見分けられるか**を測る（★2026-09-08）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★オレンジに偏る」「★暗い 2 色が同じに見える」。
 *   ★毛色は `DEFORMED_COAT_TRANSFORMS`（`packages/render/src/coat.ts`）で決まりますが、
 *   ★**焼いた結果を見ないと分かりません**（★変換の数値だけでは判断できません）。
 *
 * 【★どう測るか】
 *   ★① `side-v6-bay.webp` で ★**馬体と判定される画素**の位置を取る（`isHorseCoat` と同条件）
 *   ★② 各毛色のアトラスから ★**その位置だけ**の平均色を出す
 *      ⚠️ ★画面全体で測ると ★騎手・鞍・ゼッケンが混ざります（★開発側は 1 度これで誤りました）
 *   ★③ 全組の見分けやすさを出し、★いちばん近い組を報告する
 *
 * ⚠️ ★合格線は発明しません。★オーナーが「区別できない」と言った組の実測値を下限に使います。
 *
 * ★実行: node tools/measure-coat-spread.mjs [役割]
 */
import sharp from 'sharp';

const role = process.argv[2] ?? 'side-v6';
const DIR = 'apps/web/public/art/baked';
const COATS = ['bay', 'chestnut', 'liver-chestnut', 'dark-bay', 'seal-brown', 'blue-black', 'grey'];

/** ★見分けやすさ。★明るさの差を重めに見ます（★小さい画面では明暗が先に効くため） */
function dist(a, b) {
  const dl = (0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]) - (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]);
  return Math.sqrt(dl * dl * 2
    + ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 0.3);
}
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const base = await sharp(`${DIR}/${role}-bay.webp`).ensureAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const w = base.info.width; const h = base.info.height;
/** ★馬体の画素（★`isHorseCoat` と同条件） */
const mask = new Uint8Array(w * h);
let masked = 0;
for (let k = 0; k < w * h; k += 1) {
  const i = k * 4; const d = base.data;
  if ((d[i + 3] ?? 0) < 128) continue;
  const r = d[i] ?? 0; const g = d[i + 1] ?? 0; const b = d[i + 2] ?? 0;
  if (!(r > g && g > b)) continue;
  if (r < 24 || r - g < 12 || g / r > 0.70) continue;
  mask[k] = 1; masked += 1;
}
console.log(`# ★毛色の見分けやすさ（${role}）  ★馬体と判定した画素 ${masked}`);
console.log();

const mean = {};
for (const c of COATS) {
  const { data } = await sharp(`${DIR}/${role}-${c}.webp`).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let k = 0; k < w * h; k += 1) {
    if (mask[k] === 0) continue;
    const i = k * 4;
    r += data[i] ?? 0; g += data[i + 1] ?? 0; b += data[i + 2] ?? 0; n += 1;
  }
  mean[c] = [r / n, g / n, b / n];
  console.log(`  ${c.padEnd(16)} ${hex(mean[c])}`);
}

console.log();
console.log('★近い順（★小さいほど見分けにくい）');
const pairs = [];
for (let i = 0; i < COATS.length; i += 1) {
  for (let j = i + 1; j < COATS.length; j += 1) {
    pairs.push({ a: COATS[i], b: COATS[j], d: dist(mean[COATS[i]], mean[COATS[j]]) });
  }
}
pairs.sort((x, y) => x.d - y.d);
for (const p of pairs.slice(0, 6)) {
  console.log(`  ${p.a} ↔ ${p.b}`.padEnd(40) + p.d.toFixed(0));
}
console.log();
/**
 * ★合格線。
 * ⚠️ ★発明していません。★オーナーが「区別できない」と言った組の実測が **20** でした
 *    （★以前の palette 実測: 黒鹿毛 ↔ 青毛 = 20）。★それを ★**超えること**を線にします。
 */
const FLOOR = 20;
const worst = pairs[0];
console.log(`★いちばん近い組 ${worst.a} ↔ ${worst.b} = ${worst.d.toFixed(0)}（★合格線 ${FLOOR} 超）`);
if (worst.d <= FLOOR) {
  console.error('\n★★不合格 — ★この 2 色は画面で区別できません');
  process.exit(1);
}
console.log('\n  ★合格');
