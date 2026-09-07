/**
 * ★購入リグのテクスチャを、★**正しい規則で** `/rig-lab` 用に書き出す
 *
 * 【⚠️ ★なぜ要るか — ★1 度目の変換で色が全部飛んでいました】
 *   ★購入素材の TGA は ★**RGB が淡い下地、アルファに毛の陰影**という作りです。
 *   ★アルファを捨てて RGB だけを PNG にすると、★**ほぼ真っ白**になります。
 *   ★実際、それで馬が「牛のような斑」に見えていました（★2026-09-03・実画面）。
 *
 * 【★規則（★実測して決めました。★推測ではありません）】
 *   | 素材 | アルファの中身 | 変換 |
 *   |---|---|---|
 *   | ★`horse_body*.tga` | ★毛の陰影 | ★**RGB × アルファ**（不透明で書き出す） |
 *   | ★`casaque_*.tga`（勝負服）| ★布の陰影 | ★**RGB × アルファ** |
 *   | ★`jockey_body.tga` | ★体と長靴の陰影 | ★**RGB × アルファ** |
 *   | ★`horse_hair.tga`（たてがみ・尾）| ★**切り抜き** | ★**そのまま**（透過を保つ）|
 *
 *   ★確かめ方: `alphaextract` した絵を見ると、★毛色は「馬の皮」、★たてがみは「白い房の型」。
 *
 * 【★権利】
 *   ⚠️ ★購入素材です。★出力先 `apps/web/public/rig-lab-assets/` は **`.gitignore` 済み**。
 *   ★リポジトリにも本番にも出しません（`/rig-lab` は本番で 404）。
 *
 * ★実行: node tools/build-rig-lab-textures.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const FFMPEG = path.resolve('node_modules/ffmpeg-static/ffmpeg.exe');
const SRC = path.resolve('assets-spike/3d/race-horse-jockey-lod-source/fbx/Textures');
const OUT = path.resolve('apps/web/public/rig-lab-assets');

if (!existsSync(SRC)) {
  console.error(`★購入素材が展開されていません: ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const run = (args) => execFileSync(FFMPEG, args, { stdio: 'pipe' });

/**
 * ★**毛色・勝負服・騎手**。★RGB をそのまま使い、★**アルファを落として不透明で書き出す**。
 *
 * 【⚠️ ★ここを 3 回外しました。★実測で確定した経緯を残します】
 *   ★① 1 度目（codex）… RGB をそのまま PNG に。★**アルファが残ったまま**だったので、
 *      ★ブラウザで **半透明**になり、★背景の白が透けて「牛のような斑」に見えました。
 *   ★② 2 度目（私）… 「アルファに毛の陰影がある」と読んで ★**RGB × アルファ**に。
 *      ★→ ★**暗く潰れました**（★書き出しの平均輝度 24〜42 / 255）。
 *   ★③ 3 度目（私）… 灰色の下地を毛色で染める案。★→ ★**全頭が黒く沈みました**。
 *
 *   ★**測って決着**（`signalstats` の平均輝度・毛皮の領域）:
 *   | | RGB | アルファ |
 *   |---|---|---|
 *   | `horse_body`    | ★**47.6** | 38.8 |
 *   | `horse_body_02` | ★**35.6** | 38.8 |
 *   | `horse_body_03` | ★**88.7** | 38.8 |
 *
 *   → ★**アルファは 3 変種で完全に同一**＝毛色ではなく ★**共通の陰影（AO）**。
 *     ★**毛色は RGB 側**（鹿毛 / 黒鹿毛 / 芦毛）。★掛け算は要りませんでした。
 *   → ★やることは ★**アルファを落とすだけ**です。
 */
const DIFFUSE = [
  ['horse_body.tga', 'horse-body.png'],
  ['horse_body_02.tga', 'horse-body-02.png'],
  ['horse_body_03.tga', 'horse-body-03.png'],
  ['jockey_body.tga', 'jockey-body.png'],
];
for (let i = 1; i <= 6; i += 1) {
  const n = String(i).padStart(2, '0');
  DIFFUSE.push([`casaque_${n}.tga`, `silks-${n}.png`]);
}
for (const [from, to] of DIFFUSE) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) { console.log(`  skip（無い）: ${from}`); continue; }
  /** ⚠️ ★`rgb24` にすることで**アルファを落とします**（★透けさせない） */
  run(['-y', '-i', src, '-vf', 'format=rgb24', '-frames:v', '1', path.join(OUT, to)]);
  console.log(`  ★毛色（不透明）: ${from} → ${to}`);
}

/** ★アルファ側は「共通の陰影」。★AO として使えるように別名で出しておきます */
for (const [from, to] of DIFFUSE) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) continue;
  const out = to.replace(/\.png$/, '-ao.png');
  run(['-y', '-i', src, '-filter_complex', '[0:v]alphaextract,format=gbrp', '-frames:v', '1', path.join(OUT, out)]);
}
console.log('  ★陰影（AO）も別名で書き出しました');

/** ★そのまま（★アルファが切り抜き） */
const KEEP_ALPHA = [['horse_hair.tga', 'horse-hair.png']];

/** ★もともと PNG のもの */
const COPY = [['Saddle.png', 'saddle.png']];

for (const [from, to] of KEEP_ALPHA) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) { console.log(`  skip（無い）: ${from}`); continue; }
  run(['-y', '-i', src, '-frames:v', '1', path.join(OUT, to)]);
  console.log(`  ★そのまま（透過を保つ）: ${from} → ${to}`);
}

/**
 * ★**法線マップと光沢マップ**（★購入素材に入っているのに、★1 枚も使っていませんでした）。
 *   ★これが無いと、★馬体が ★**のっぺりした樹脂**に見えます（★2026-09-03・オーナー評）。
 *   ★光沢は「艶」なので、★three では ★**粗さ（roughness）の逆**として使います。
 */
const NORMALS = [
  ['horse_body_nmap.png', 'horse-body-nmap.png'],
  ['horse_hair_nmap.png', 'horse-hair-nmap.png'],
  ['jockey_body_nmap.png', 'jockey-body-nmap.png'],
  ['Saddle_nmap.png', 'saddle-nmap.png'],
];
for (const [from, to] of NORMALS) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) { console.log(`  skip（無い）: ${from}`); continue; }
  run(['-y', '-i', src, '-frames:v', '1', path.join(OUT, to)]);
  console.log(`  ★法線: ${from} → ${to}`);
}

/** ★光沢 → ★**粗さ**（★白黒を反転して書き出す） */
const SPECULAR = [
  ['horse_body_SPEC.tga', 'horse-body-rough.png'],
  ['jockey_body_spec.tga', 'jockey-body-rough.png'],
];
for (const [from, to] of SPECULAR) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) { console.log(`  skip（無い）: ${from}`); continue; }
  run(['-y', '-i', src, '-vf', 'format=gray,negate,format=gbrp', '-frames:v', '1', path.join(OUT, to)]);
  console.log(`  ★光沢→粗さ（反転）: ${from} → ${to}`);
}

for (const [from, to] of COPY) {
  const src = path.join(SRC, from);
  if (!existsSync(src)) { console.log(`  skip（無い）: ${from}`); continue; }
  run(['-y', '-i', src, '-frames:v', '1', path.join(OUT, to)]);
  console.log(`  ★そのまま: ${from} → ${to}`);
}

console.log(`★書き出し先: ${OUT}（★.gitignore 済み・★購入素材なので配信しません）`);
