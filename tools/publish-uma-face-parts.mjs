/**
 * ★**調教の表情を「部品」で作る**（★2026-09-24・オーナー決定 D-4・`DECISIONS_HORSE_LOOK_20260924.md`）
 *
 * 【★なぜ「部品」か】
 *   ★平常の頭部を入力に「★耳・まぶた・口角だけ動かす」画像編集を **2 回**試し、
 *   ★**2 回とも頭の形・鼻先・線が引き直されて別キャラ**になりました（★Codex 自身も失敗と報告）。
 *   ★これはオーナーに **3 回**差し戻された失敗と同じ形です。
 *   → ★頭部（`uma/horse-face.webp`）は **1 枚のまま固定**し、
 *     ★**同じ画布の大きさ**で ★まぶた／眉だけを描いた ★**透過のレイヤー**を重ねます。
 *     ★画面は `inset: 0` で重ねるだけなので、★**座標を持ちません**（★ずれようがない）。
 *
 * 【🔴 ★受け入れ条件】
 *   ★① ★**画布が頭部と同じ**（★1 画素でも違えば重ならない）
 *   ★② ★**不透明な画素が `MAX_INK` 以下**（★頭を描いてきたら落とす）
 *   ★③ ★**頭部の目・眉の在る辺りに掛かっている**（★隅に点を描いただけ、を通さない）
 *   ⚠️ ★1 つでも外れたら ★**1 枚も置きません**（★片方だけ入ると、★表情が 2 段になります）
 *
 * ⚠️ ★DB に触れません（★画像を読み書きするだけ）。
 *
 * ★実行: node tools/publish-uma-face-parts.mjs
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const GEN = 'out/gen';
const OUT = 'apps/web/public/art/uma';
/** ★不透明な画素の上限（★画布に対する割合）。★頭部そのものは 45% 前後あります */
const MAX_INK = 0.1;
/**
 * ★部品が掛かっているべき範囲（★頭部の画布に対する割合）。
 * ★目と眉は ★**右上寄り**に在ります（★`horse-face.png` を測って決めた値）。
 */
const EYE_ZONE = { x0: 0.45, y0: 0.15, x1: 1.0, y1: 0.65 };

const PARTS = [
  { src: `${GEN}/uma-face-part-lid.png`, out: `${OUT}/horse-face-part-tired`, label: '疲れ（半分閉じたまぶた）' },
  { src: `${GEN}/uma-face-part-bright.png`, out: `${OUT}/horse-face-part-happy`, label: '上機嫌（上がった眉）' },
];

const head = await sharp(`${OUT}/horse-face.png`).metadata();
console.log(`=== 表情の部品 ===\n  頭部の画布: ${head.width}x${head.height}`);

const checked = [];
let ok = true;
for (const p of PARTS) {
  if (!existsSync(p.src)) {
    console.error(`  🔴 ${p.label}: ★ありません（${p.src}）`);
    ok = false;
    continue;
  }
  const { data, info } = await sharp(p.src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let ink = 0, inZone = 0;
  const zx0 = EYE_ZONE.x0 * w, zx1 = EYE_ZONE.x1 * w, zy0 = EYE_ZONE.y0 * h, zy1 = EYE_ZONE.y1 * h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < 24) continue;
      ink += 1;
      if (x >= zx0 && x <= zx1 && y >= zy0 && y <= zy1) inZone += 1;
    }
  }
  const inkRatio = ink / (w * h);
  const zoneRatio = ink === 0 ? 0 : inZone / ink;
  const sameCanvas = w === head.width && h === head.height;
  const pass = sameCanvas && inkRatio > 0 && inkRatio <= MAX_INK && zoneRatio >= 0.8;
  console.log(`  ${pass ? '✅' : '🔴'} ${p.label}`);
  console.log(`       画布 ${w}x${h}${sameCanvas ? '' : '  🔴 頭部と違う'}`);
  console.log(`       不透明 ${(inkRatio * 100).toFixed(1)}%（★上限 ${MAX_INK * 100}%）`);
  console.log(`       目と眉の辺りに乗っている割合 ${(zoneRatio * 100).toFixed(1)}%（★下限 80%）`);
  if (!pass) ok = false;
  checked.push({ ...p, w, h });
}

if (!ok) {
  console.error('\n🔴 ★不合格。★**1 枚も置きませんでした**（★片方だけ入ると表情が 2 段になります）。');
  console.error('★焼き直すか、★プロンプト（`design/art/prompts/uma-face-part-*.txt`）を直してください。');
  process.exit(1);
}

for (const p of checked) {
  await sharp(p.src).png({ compressionLevel: 9 }).toFile(`${p.out}.png`);
  await sharp(p.src).webp({ quality: 92 }).toFile(`${p.out}.webp`);
  console.log(`  → ${p.out}.webp`);
}
console.log('\n✅ ★置きました。★画面は `inset: 0` で重ねるだけです（★座標を持たせないこと）。');
