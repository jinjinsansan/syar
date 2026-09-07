/**
 * ★**無彩色で描かれた馬を着せ替える**（★2026-09-07）
 *
 * 【★なぜ要るか】
 *   ★`tools/lib/dress.mjs` は ★**茶色い馬・青い勝負服**を前提にしています
 *   （★毛色 = 彩度 0.18 以上・色相 8〜48 度／★勝負服 = 彩度 0.35 以上・色相 200〜260 度）。
 *   ★実測: ★過去の合格素材は毛色として **67.6%** が拾えます。
 *
 *   ⚠️ ★ところが ★**オーナー承認済みのデフォルメ馬は灰色**です。★同じ測り方だと **1.4%**
 *      しか拾えず、★`dress.mjs` の置換が効きません。
 *   → ★承認済みのデザインを変えずに着せ替えるため、★**無彩色版の経路**を用意します。
 *
 * 【★どう分けるか — ★実測で分離できることを確かめてあります】
 *   ★不透明画素 328,984 のうち:
 *   　★彩度 < 0.18 の無彩色が **277,568**（★毛・白服・黒）
 *   　★その中の明度で
 *   　　★0.00〜0.25 … **28.5%** ★黒（たてがみ・尾・輪郭・長靴）→ ★**触らない**
 *   　　★0.25〜0.72 … **49.9%** ★毛 → ★**毛色ランプへ置換**
 *   　　★0.72〜1.00 … **21.6%** ★白（勝負服・ゼッケン）→ ★**勝負服／枠色へ置換**
 *   　★彩度 0.18 以上 … ★肌・頭絡・ゴーグル・目 → ★**触らない**
 *
 * ⚠️ ★**掛け算にしないこと。** ★`dress.mjs` の冒頭にこう残っています —
 *    ★「私は『元の色に毛色を掛ける』方式にして、★**3 回壊しました**
 *    　（ゼッケンが胴体に化ける／★**騎手の顔が白くなる**／毛色が効かなくなる）」
 *    ★2026-09-06、★開発側は同じ形の失敗（★顔が青くなる）を踏みました。
 *    ★**明暗を保ったまま色だけ置き換える**のが正解です。
 *
 * 【⚠️ ★勝負服とゼッケンを分ける】
 *   ★どちらも白なので、★**位置で分けます**。★ゼッケンは鞍の下＝被写体の下半分側、
 *   ★勝負服は騎手＝上半分側。★境目は被写体の高さの割合で決めます。
 *
 * ★実行:
 *   node tools/dress-greyscale.mjs '<入力{NN}>' '<出力{NN}>' <コマ数> <馬番>
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

const [inPat, outPat, framesArg, gateArg] = process.argv.slice(2);
if (inPat === undefined || outPat === undefined
  || !inPat.includes('{NN}') || !outPat.includes('{NN}')) {
  console.error("使い方: node tools/dress-greyscale.mjs '<入力{NN}>' '<出力{NN}>' <コマ数> <馬番>");
  process.exit(2);
}
const FRAMES = Number(framesArg ?? 8);
const GATE = Number(gateArg ?? 1);

/** ★色は `palette.json` が唯一の出どころ（★16 進をここに書かない） */
const PALETTE = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const COATS = ['kage', 'kurokage', 'kuri', 'ashi', 'ao'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const coatName = COATS[GATE % COATS.length];
/** ★毛色は 4 段。★段の間は補間します（★4 色に潰すと筋肉の陰影が消える・`dress.mjs` の教訓） */
const RAMP = [0, 1, 2, 3].map((i) => hex(PALETTE[`coat-${coatName}-${i}`]));
const SILK = hex(PALETTE[`silk-${((GATE - 1) % 18) + 1}`]);
const FRAME_COLOUR = hex(PALETTE[`frame-${((GATE - 1) % 8) + 1}`]);

/** ★無彩色と見なす彩度の上限（★これ以上は肌・頭絡なので触らない） */
const SAT_MAX = 0.18;
/** ★毛と見なす明度の帯 */
const COAT_LO = 0.25;
const COAT_HI = 0.72;

for (let f = 1; f <= FRAMES; f += 1) {
  const nn = String(f).padStart(2, '0');
  const src = inPat.replaceAll('{NN}', nn);
  const dst = outPat.replaceAll('{NN}', nn);
  if (!existsSync(src)) { console.error(`★ありません: ${src}`); process.exit(1); }
  mkdirSync(dirname(dst), { recursive: true });

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  /** ★被写体の上下端（★勝負服とゼッケンを位置で分けるため） */
  let top = h; let bottom = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) >= 128) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
    }
  }
  /** ★騎手（上）とゼッケン（下）の境目。★被写体高の上から 45% */
  const cut = top + (bottom - top) * 0.45;

  let coatN = 0; let silkN = 0; let clothN = 0;
  for (let i = 0, k = 0; i < data.length; i += 4, k += 1) {
    if ((data[i + 3] ?? 0) < 128) continue;
    const r = data[i] ?? 0; const g = data[i + 1] ?? 0; const b = data[i + 2] ?? 0;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    /** ★色が付いているものは触らない（★肌・頭絡・ゴーグル・目） */
    if (sat >= SAT_MAX) continue;
    const v = mx / 255;
    if (v < COAT_LO) continue;               // ★黒（たてがみ・尾・輪郭・長靴）
    if (v <= COAT_HI) {
      /** ★毛 — ★明暗をそのまま毛色ランプへ写す */
      const t = ((COAT_HI - v) / (COAT_HI - COAT_LO)) * 3;
      const idx = Math.min(2, Math.floor(t));
      const frac = t - idx;
      const a0 = RAMP[idx]; const a1 = RAMP[idx + 1];
      data[i] = Math.round(a0[0] + (a1[0] - a0[0]) * frac);
      data[i + 1] = Math.round(a0[1] + (a1[1] - a0[1]) * frac);
      data[i + 2] = Math.round(a0[2] + (a1[2] - a0[2]) * frac);
      coatN += 1;
      continue;
    }
    /** ★白 — ★上なら勝負服、下ならゼッケン。★明るさを保って色を乗せる */
    const y = (k - (k % w)) / w;
    const c = y < cut ? SILK : FRAME_COLOUR;
    if (y < cut) silkN += 1; else clothN += 1;
    data[i] = Math.round(c[0] * v);
    data[i + 1] = Math.round(c[1] * v);
    data[i + 2] = Math.round(c[2] * v);
  }

  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(dst);
  console.log(`  ${nn}  毛 ${coatN} / 勝負服 ${silkN} / ゼッケン ${clothN} → ${dst}`);
}
console.log(`★馬番 ${GATE}（毛色 ${coatName}）で ${FRAMES} コマを着せ替えました`);
