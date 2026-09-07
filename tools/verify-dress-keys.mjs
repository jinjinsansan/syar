/**
 * ★**着せ替えの下地が、engine の条件を満たしているか**を測る（★2026-09-07）
 *
 * 【★なぜ要るか — ★2026-09-07 に外しました】
 *   ★`tools/lib/dress.mjs` は ★**色で部位を見つけます**:
 *   　★毛色   … ★彩度 0.18 以上・★色相 8〜48 度（★茶系）
 *   　★勝負服 … ★彩度 0.35 以上・★色相 200〜260 度（★青）
 *
 *   ⚠️ ★開発側は「灰色の馬・白い勝負服」で 7 コマ生成し、★塗れないことに後で気づきました。
 *   ★実測:
 *   　★過去の合格素材 `side-v7` …… ★毛色として拾える **67.6%**
 *   　★灰色で生成したもの ………… ★**8.5%**（★塗れない）
 *
 *   ★さらに「灰色を明度で分ければよい」と考えましたが、★**分離できませんでした**:
 *   　★どの閾値でも白い塊が **145〜236 個**に散り、★馬の明るい所と服が混ざります。
 *
 * → ★**下地の色は、生成した直後に機械で確かめます。** ★後から気づくと作り直しになります。
 *
 * 【⚠️ ★測る順番】
 *   ★**緑を抜いたあとに測ること。** ★抜く前は全面が不透明なので、★緑背景まで分母に入り、
 *   ★毛色の割合が**不当に低く**出ます（★実測 13.4% → 抜いたあと 52.6%）。
 *   ★2026-09-07、★開発側は抜く前に測って「不合格」と誤判定しました。
 *
 * ★実行: node tools/verify-dress-keys.mjs '<{NN} を含むパス>' [コマ数]
 *   ★① node tools/remove-chroma-key.mjs で緑を抜く
 *   ★② このツールで測る
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const pattern = process.argv[2];
const FRAMES = Number(process.argv[3] ?? 8);
if (pattern === undefined || !pattern.includes('{NN}')) {
  console.error("使い方: node tools/verify-dress-keys.mjs '<{NN} を含むパス>' [コマ数]");
  process.exit(2);
}

/** ★合格線は「過去の合格素材」から取っています（★発明しません） */
const COAT_MIN = 0.40;   // ★side-v7 は 0.676
/**
 * ★勝負服。
 * ⚠️ ★最初 0.005（0.5%）と置いたら、★**合格済みの `side-v7` が落ちました**（★実測 0.06%）。
 *    ★合格線を実物で校正せずに置いたためです。★今日だけで同じ失敗を何度もしています。
 * → ★合格素材の実測 **0.06%** を下回らない線として **0.03%** を置きます。
 *   ★灰色で生成したものは 0.11%… ではなく、★**青が無い**ので実質 0 になります
 *   （★0.11% は目や金具の拾い残し）。★毛色の線で確実に落ちるので、ここは緩めて構いません。
 */
const SILK_MIN = 0.0003;

function hsv(r, g, b) {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, v: mx / 255 };
}

console.log('# ★着せ替えの下地');
console.log('  コマ  不透明    ★毛色として拾える     ★勝負服として拾える');
let worstCoat = 1; let worstSilk = 1; let n = 0;
for (let f = 1; f <= FRAMES; f += 1) {
  const file = pattern.replace('{NN}', String(f).padStart(2, '0'));
  if (!existsSync(file)) continue;
  n += 1;
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let op = 0; let coat = 0; let silk = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue;
    op += 1;
    const { h, s } = hsv(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    if (s >= 0.18 && h >= 8 && h <= 48) coat += 1;
    if (s >= 0.35 && h >= 200 && h <= 260) silk += 1;
  }
  const cR = coat / op; const sR = silk / op;
  worstCoat = Math.min(worstCoat, cR); worstSilk = Math.min(worstSilk, sR);
  const mark = (cR < COAT_MIN || sR < SILK_MIN) ? '  ★' : '';
  console.log(`  ${String(f).padStart(3)}  ${String(op).padStart(7)}  ${(cR * 100).toFixed(1).padStart(8)}%  ${(sR * 100).toFixed(2).padStart(18)}%${mark}`);
}
if (n === 0) { console.error('★ファイルがありません'); process.exit(2); }
console.log();
console.log(`  ★毛色として拾える最小 ${(worstCoat * 100).toFixed(1)}%（合格線 ${COAT_MIN * 100}% 以上・★合格素材 side-v7 は 67.6%）`);
console.log(`  ★勝負服として拾える最小 ${(worstSilk * 100).toFixed(2)}%（合格線 ${SILK_MIN * 100}% 以上）`);
if (worstCoat < COAT_MIN || worstSilk < SILK_MIN) {
  console.error('\n★★不合格 — ★engine が部位を見つけられません（★毛色 12 色・勝負服の塗り分けができません）');
  console.error('  ★下地は「鹿毛の馬（茶・彩度 0.18 以上）」「青い勝負服（色相 200〜260・彩度 0.35 以上）」で作ること');
  process.exit(1);
}
console.log('\n  ★合格 — ★engine が毛色と勝負服を見つけられます');
