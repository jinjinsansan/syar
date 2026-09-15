/**
 * ★**パドックの歩きのコマを、本番が読む「原版」の形で `/art/` に置く**（★2026-09-15）
 *
 * 【★なぜ要るか】
 *   ★発走前の「人気馬の紹介」（★オーナー決定「動画の通り」）で、★馬がパドックを歩きます。
 *   ★歩きのコマは `tools/gen-pose-set.mjs` と雛形 `design/art/prompts/deformed-8frames-walk.txt` で
 *   ★Codex に 1 コマずつ起こさせています（★型A `horse-jockey-side-walk-v1`・★型B `horse-jockey-side-walk-v1b`）。
 *   ★生成物は ★緑の背景つき（`out/gen/<set>-poseNN-chroma.png`）なので、★本番の形へ直します。
 *
 * 【★やること（★既存の道具を順に呼ぶだけ・★式を増やさない）】
 *   ★① 緑を抜く … `tools/remove-chroma-key.mjs`
 *   ★② 胴を基準に揃える … `tools/align-pose-set.mjs`
 *   ★③ 勝負服を無彩色へ戻す … `tools/publish-deformed-art.mjs` と同じ規則（★画面の色替えは彩度の低い画素を探すため）
 *   ★④ `/art/<set>-poseNN.png` に置く
 *   ★⑤ Codex が作業場所として `apps/web/public/art/` に書いた余分なファイルを `out/gen/codex-strays/` へ退避
 *
 * ⚠️ ★8 コマ揃っていないセットは ★**置きません**（★途中の組を読むと画面が欠けたコマで動く）。
 * ⚠️ ★DB に触れません（★画像を書くだけ）。
 *
 * ★実行: node tools/publish-walk-frames.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import sharp from 'sharp';

const ART = 'apps/web/public/art';
const GEN = 'out/gen';
/**
 * ⚠️ ★**型 B（`horse-jockey-side-walk-v1b`）は置きません**（★2026-09-15）。
 *    ★オーナー指示「★足が白ブチの馬を一旦使わないでください」でレースは全枠が型 A（`page.tsx` `HORSE_TYPE_BY_GATE`）。
 *    ★型 B の絵は四肢が白いので、★使わない素材を公開の置き場に入れません。★型 B を戻すときにここへ足すこと。
 */
const SETS = ['horse-jockey-side-walk-v1'];
const nn = (i) => String(i + 1).padStart(2, '0');

/** ★`publish-deformed-art.mjs` の `desaturateSilks` と同じ規則（★色相 176〜268 度・彩度 0.28 以上 → 明るさだけ残す） */
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
    data[i] = mx; data[i + 1] = mx; data[i + 2] = mx;
    n += 1;
  }
  return { buf: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(), n };
}

mkdirSync(`${GEN}/keyed`, { recursive: true });
mkdirSync(`${GEN}/aligned`, { recursive: true });
for (const set of SETS) {
  const missing = Array.from({ length: 8 }, (_, i) => `${GEN}/${set}-pose${nn(i)}-chroma.png`).filter((f) => !existsSync(f));
  if (missing.length > 0) { console.log(`★${set}: ${8 - missing.length}/8 コマ（★揃っていないので置きません）`); continue; }
  for (let i = 0; i < 8; i += 1) {
    execFileSync('node', ['tools/remove-chroma-key.mjs', `${GEN}/${set}-pose${nn(i)}-chroma.png`, `${GEN}/keyed/${set}-pose${nn(i)}.png`], { stdio: 'inherit' });
  }
  execFileSync('node', ['tools/align-pose-set.mjs', `${GEN}/keyed/${set}-pose{NN}.png`, `${GEN}/aligned/${set}-pose{NN}.png`], { stdio: 'inherit' });
  for (let i = 0; i < 8; i += 1) {
    const { buf, n } = await desaturateSilks(`${GEN}/aligned/${set}-pose${nn(i)}.png`);
    await sharp(buf).png({ compressionLevel: 9 }).toFile(`${ART}/${set}-pose${nn(i)}.png`);
    if (i === 0) console.log(`    ★勝負服を無彩色へ ${n} 画素`);
  }
  console.log(`★${set} → ${ART}/${set}-pose01..08.png`);
}

/** ★⑤ Codex の作業場所の余分なファイル（★取り込みは `codex-imagegen.mjs` が別にしている） */
mkdirSync(`${GEN}/codex-strays`, { recursive: true });
for (const f of readdirSync(ART)) {
  if (/^(horse-jockey-type-[ab]-walk-frame\d+|paddock-introduction-v\d+)\.(png|prompt\.txt)$/.test(f)) {
    renameSync(`${ART}/${f}`, `${GEN}/codex-strays/${f}`);
    console.log(`  退避: ${f}`);
  }
}
