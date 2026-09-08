/**
 * ★**デフォルメ馬を、本番が読む「原版」の形で `/art/` に置く**（★2026-09-08）
 *
 * 【★なぜ要るか】
 *   ★本番 `/race` は `tools/bake-race-frames.mjs` が焼いたアトラスを読みます。
 *   ★その道具は ★**`/art/<prefix>-poseNN.png` という原版**を入力にします。
 *   ★私たちの素材は `rig-lab-assets/types/<型>/NN_coat.png` という別の形なので、
 *   ★**原版の形に写して**から焼きます。
 *
 * ⚠️ ★**焼く工程は書き直しません。** ★既にある `bake-race-frames.mjs` に渡すだけです。
 *    ★毛色の焼き分け・アトラス化・anchor の算出は、★すべて向こうがやります。
 *
 * ⚠️ ★**原版は上書きしません。** ★新しい版名（`-v8` / `-v4`）で置きます。
 *    ★`bake-race-frames.mjs` の `pickSet` は ★**先に見つかった名前**を使うので、
 *    ★候補の先頭に足せば切り替わり、★外せば元へ戻せます。
 *
 * ★実行: node tools/publish-deformed-art.mjs
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const ART = 'apps/web/public/art';
const TYPES = 'apps/web/public/rig-lab-assets/types';
/**
 * ★どの型を原版にするか。
 * ⚠️ ★本番の焼き工程は ★**1 体型 × 毛色 7 色**という作りです。
 *    ★個体タイプ（3 体型）を本番へ通すには、★向こうの `SETS` を増やす必要があります。
 *    ★まずは ★**型 A を代表**として通し、★動くことを確かめてから増やします。
 */
const PUBLISH = [
  { from: 'a', to: 'horse-jockey-side-v8' },
  { from: 'a-front', to: 'horse-jockey-diag-front-v4' },
];

/**
 * ★**勝負服を無彩色へ戻します**（★2026-09-08）
 *
 * 【★なぜ要るか — ★実測で確定】
 *   ★本番 `page.tsx` の `silksOverlays()` は、★勝負服を ★**彩度の低い画素**から探します:
 *     ★`spread = max - min` が ★帽子 62 以下 ／ 上着 34 以下
 *   ★同じ所の注記に「★素材の勝負服は ★**無彩色の灰／白**で作らせている（生成プロンプトで指定）」
 *   ★とあります。
 *   ⚠️ ★私たちの素材は ★**勝負服が青**（彩度が高い）。★条件に 1 画素も当たらないので、
 *      ★**勝負服が塗られず、青のまま 12 頭が同じ色**になっていました。
 *
 * → ★本番へ写すときに ★**青を明るさだけ残した灰へ**戻します。
 *   ★検証台側（`/rig-lab/sprite`）は色相で青を選ぶ方式なので、★そちらの素材は変えません。
 *
 * ⚠️ ★**毛と混ぜないこと。** ★毛（茶）は色相 8〜48 度、★勝負服は 176〜268 度で分かれます。
 */
async function desaturateSilks(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 8) continue;
    const r = data[i] ?? 0; const g = data[i + 1] ?? 0; const b = data[i + 2] ?? 0;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    if (d === 0) continue;
    const sat = mx === 0 ? 0 : d / mx;
    let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue *= 60; if (hue < 0) hue += 360;
    if (!(sat >= 0.28 && hue >= 176 && hue <= 268)) continue;
    /** ★明るさだけ残す（★陰影が消えると立体が壊れます） */
    data[i] = mx; data[i + 1] = mx; data[i + 2] = mx;
    n += 1;
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer();
  return { buf: out, n };
}

mkdirSync(ART, { recursive: true });
for (const { from, to } of PUBLISH) {
  const dir = `${TYPES}/${from}`;
  if (!existsSync(`${dir}/sprite.json`)) { console.error(`★ありません: ${dir}`); process.exit(1); }
  const meta = JSON.parse(readFileSync(`${dir}/sprite.json`, 'utf8'));
  for (let f = 1; f <= 8; f += 1) {
    const nn = String(f).padStart(2, '0');
    const src = `${dir}/${nn}_coat.png`;
    const dst = `${ART}/${to}-pose${nn}.png`;
    const { buf, n } = await desaturateSilks(src);
    await sharp(buf).png({ compressionLevel: 9 }).toFile(dst);
    if (f === 1) console.log(`    ★勝負服を無彩色へ ${n} 画素`);
  }
  console.log(`  ★${from} → ${to}-pose01..08.png（${meta.width}x${meta.height}）`);
}
console.log('\n★次: npx tsx tools/bake-race-frames.mjs で本番形式へ焼きます');
