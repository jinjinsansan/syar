/**
 * ★「跳ねる」「前後にガクガクする」を**素材だけの問題として切り出して測る**
 *
 * 【考え方】
 *   馬を**世界の同じ場所に固定**したまま、走行コマだけを 1→8 と送ります。
 *   世界の位置も、カメラも、投影も**一切動きません**。
 *   それでも描かれた馬が上下左右に動くなら、★**それは素材と描画の当て方だけが原因**です。
 *
 *   ⚠️ 実レースの映像で見ると、カメラの追従・馬の前進・コマ送りが混ざるので、
 *      どれが犯人か切り分けられません。**動くものを 1 つだけにして測ります。**
 *
 * 【出るもの】
 *   接地Y のぶれ … コマ間で足元が上下にどれだけ動くか（跳ね）
 *   胴体X のぶれ … コマ間で胴が前後にどれだけ動くか（前後のガクガク）
 *   どちらも**描画される馬の高さに対する割合**で出します（px の絶対値は大きさで変わるため）。
 *
 * 実行: npx tsx tools/verify-horse-motion.mjs
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { drawBroadcastV2Scene, frameRoleOf, ovalCourse, resolveBroadcastV2Scene } from '@star/render';

const W = 1280, H = 720, FIELD = 12, DIST = 1600;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/motion');
mkdirSync(OUT, { recursive: true });
const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/**
 * ★描画側と同じ接地補正の表（`apps/web/src/app/race/page.tsx`）。
 *   ここを変えて測り直せるように、道具側にも持たせます。
 */
const LIFT_REFERENCE_HEIGHT_PX = 1536;
const HORSE_GROUND_LIFTS = [55, 90, 25, 0, 0, 0, 0, 55];

async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 12) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left
    ? { x: 0, y: 0, width: info.width, height: info.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function library(prefix, withLift) {
  const files = Array.from({ length: 8 }, (_, i) => path.join(ART, `${prefix}${String(i + 1).padStart(2, '0')}.png`));
  const measured = await Promise.all(files.map(async (file) => ({
    image: await loadImage(file), source: await alphaBounds(file),
  })));
  const referenceHeight = Math.max(...measured.map((f) => f.source.height));
  const frames = measured.map((f, i) => ({
    ...f, referenceHeight,
    ...(withLift
      ? { groundLiftSourcePx: HORSE_GROUND_LIFTS[i] * (f.image.height / LIFT_REFERENCE_HEIGHT_PX) }
      : {}),
  }));
  return {
    sheet: frames[0].image, sheetWidth: frames[0].source.width,
    spec: { frames: 1, cellH: referenceHeight, anchorXRatio: 0.5, anchorYRatio: 1 },
    frameImages: frames,
    frameImagesByGate: Array.from({ length: FIELD }, () => frames),
  };
}

/** 1 頭だけを、世界の同じ場所に固定して描き、コマだけ送る */
async function measureSet(label, prefix, shotSpec, withLift) {
  const lib = await library(prefix, withLift);
  const libraries = {
    'side-v6': lib, 'diag-front-v2': lib, 'diag-rear-v2': lib, 'high-diag-v2': lib, 'winner-v1': lib,
  };
  const rows = [];
  for (let frame = 0; frame < 8; frame += 1) {
    // ★1 頭だけ。位置は固定。動かすのは `frameOf` だけ
    const horses = [{ gate: 1, s: shotSpec.s, w: 10, staminaRatio: 1 }];
    const scene = resolveBroadcastV2Scene(course, horses, { width: W, height: H }, false, {
      forceShotId: shotSpec.shotId,
    });
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // ★背景を描かない（測るのは馬だけ）
    drawBroadcastV2Scene(ctx, course, scene, {
      palette, libraries, fieldSize: FIELD,
      frameOf: () => frame,
      frameRoleOf, surface: 'turf', condition: 'good', kickupColor: '#738b43',
    });
    const d = ctx.getImageData(0, 0, W, H).data;
    // 馬体（茶系）だけを拾う。芝も影も拾わないよう `_motion.mjs` と同じ条件
    let top = H, bottom = -1, sx = 0, n = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (!(r > g + 18 && r > b + 30 && r > 55 && r < 215 && g < 165)) continue;
        if (y < top) top = y; if (y > bottom) bottom = y;
        sx += x; n += 1;
      }
    }
    if (n < 200) { rows.push(null); continue; }
    rows.push({ bottom, height: bottom - top, cx: sx / n });
  }
  const ok = rows.filter(Boolean);
  if (ok.length < 8) { console.log(`  ${label}: 測れませんでした（${ok.length}/8 コマ）`); return; }
  const hMean = ok.reduce((a, r) => a + r.height, 0) / ok.length;
  const span = (xs) => Math.max(...xs) - Math.min(...xs);
  const yWander = span(ok.map((r) => r.bottom));
  const xWander = span(ok.map((r) => r.cx));
  // ★隣接コマ間の最大跳び。周期的な上下ではなく「1 コマで飛ぶ量」が跳ねに見える
  let yStep = 0, xStep = 0;
  for (let i = 1; i < ok.length; i += 1) {
    yStep = Math.max(yStep, Math.abs(ok[i].bottom - ok[i - 1].bottom));
    xStep = Math.max(xStep, Math.abs(ok[i].cx - ok[i - 1].cx));
  }
  console.log(`  ${label.padEnd(26)}`
    + `接地Y ぶれ ${(yWander / hMean * 100).toFixed(1).padStart(5)}%  1コマ最大 ${(yStep / hMean * 100).toFixed(1).padStart(5)}%   `
    + `胴体X ぶれ ${(xWander / hMean * 100).toFixed(1).padStart(5)}%  1コマ最大 ${(xStep / hMean * 100).toFixed(1).padStart(5)}%`);
}

console.log('\n=== 馬を世界に固定し、走行コマだけ送ったときのぶれ ===');
console.log('  （動くものはコマ番号だけ。ここで動く＝素材と当て方だけが原因）\n');
const SETS = [
  /**
   * ★真横だけ ぶれが大きい（接地Y 1コマ最大 4.2% / 胴体X 2.2%）。
   *   `align-pose-set.mjs` で胴体基準に整列し直す案を試しましたが、
   *   **4.2%→3.0% / 2.2%→2.1% にしかならず、接地Y の全体のぶれはむしろ悪化しました（4.2→4.7%）。**
   *   ★整列では直りません。素材は差し替えず、原因の切り分けを続けます。
   */
  ['真横 side-v7', 'horse-jockey-side-v7-pose', { shotId: 'finish-line', s: 1560 }],
  ['斜め前 diag-front-v3', 'horse-jockey-diag-front-v3-pose', { shotId: 'first-corner-front', s: 200 }],
  ['背後 diag-rear-v5', 'horse-jockey-diag-rear-v5-pose', { shotId: 'third-corner-rear', s: 700 }],
  ['俯瞰 high-diag-v4', 'horse-jockey-high-diag-v4-pose', { shotId: 'aerial', s: 500 }],
];
console.log('★接地補正の表（HORSE_GROUND_LIFTS）を当てた場合＝いまの本番');
for (const [label, prefix, spec] of SETS) await measureSet(label, prefix, spec, true);
console.log('\n★接地補正を外した場合＝素材そのもの');
for (const [label, prefix, spec] of SETS) await measureSet(label, prefix, spec, false);
console.log('\n  ★「跳ね」は接地Y の 1 コマ最大、「前後のガクガク」は胴体X の 1 コマ最大に出ます。');
