/**
 * ★**実レースの任意の秒数**を、本番と同じ描画で静止画にする
 *
 * 【なぜ要るか（2026-08-21）】
 *   `audit-broadcast-v2.mjs` は馬の位置を**合成データ**で置いています
 *   （`s: 基準 - i/3*3.2`, `w: 2.4 + (i%4)*3.4`）。**横に 3.4m 刻みで綺麗に散ります。**
 *   ところが実レースは、発走後どの馬もラチを取りにいくので
 *   ★**残り 1350m で 12 頭の横の広がりが 0.85m** しかありません。
 *   つまり監査の絵は**実際の画面より遥かに良く見えていました**。
 *
 *   ★オーナーの指摘は毎回**実画面**に対するものです。**同じものを見なければ話になりません。**
 *
 * 【この道具がやること】
 *   `shot-cuts.mjs` と同じく**本番のエンジン**（resolveRace → replayOf → 位置モデル → 時間ワープ）を通し、
 *   `broadcast-v2` の描画で、指定した**表示秒**の絵を出します。発馬機の看板も渡します。
 *
 * 実行:
 *   npx tsx tools/shot-race-at.mjs 9 10 12 14 16
 *   npx tsx tools/shot-race-at.mjs --from 9 --to 30 --step 3
 * 出力: out/race-at/NN-<秒>s-<ショット>.png と contact-sheet.png
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  BROADCAST_STRIDE_M, MOTION_BLUR_EXPOSURE_SEC, MOTION_BLUR_SAMPLES,
  cameraBasis, drawBroadcastV2Scene, finalOrderOf, frameRoleOf, knotsFor, ovalCourse,
  posOf, project, ratesForTarget, replayPositionModel, resolveBroadcastV2Scene,
  targetDisplaySec, timeWarpFor, withFinishRunOut,
} from '@star/render';

/**
 * ★このカットで馬がどれだけの大きさで描かれ、何頭が画面に収まるか
 *
 *   合格の基準は `finish-line`（オーナー承認）で、**馬の高さは画面の 25.2%**＝約 181px。
 *   カットが変わるたびに大きさが跳ねると「一気にクオリティが下がる」と見えます。
 */
function measureShot(course, camera, horses, width, height) {
  const basis = cameraBasis(camera);
  const heights = [];
  let inside = 0;
  for (const h of horses) {
    const p = posOf(course, h.s, h.w);
    const foot = project(camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(camera, basis, { x: p.x, y: p.y, z: 2.5 });
    if (foot === undefined || head === undefined) continue;
    const px = Math.abs(foot.y - head.y);
    heights.push(px);
    // ★左右がはみ出していないか（上下は空が入るので横だけ見る）
    if (foot.x >= 0 && foot.x <= width && foot.y >= 0 && foot.y <= height) inside += 1;
  }
  heights.sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 0;
  return { medianPx: median, ratio: median / height, inside, total: horses.length };
}

const W = 1280, H = 720, FIELD = 12, DIST = 1600, SEED = 42;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/race-at');
const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/** ★発走からの表示秒（`raceDisplaySec`）。ゲート待機の 7.8 秒はここに含めない */
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : dflt; };
const INTRO_SEC = 7.8;  // race-intro.ts の RACE_INTRO_RACE_START_SEC
let displaySecs = argv.filter((a) => /^[0-9.]+$/.test(a)).map(Number);
if (argv.includes('--from')) {
  const from = flag('--from', 9), to = flag('--to', 30), step = flag('--step', 3);
  displaySecs = [];
  for (let t = from; t <= to + 1e-9; t += step) displaySecs.push(Number(t.toFixed(2)));
}
if (displaySecs.length === 0) displaySecs = [9, 12, 15, 18, 21, 24];

/* ── ★本番と同じ経路（shot-cuts.mjs と同一） ─────────────── */
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = {
  raceId: `c${SEED}`, distance: DIST, surface: 'turf',
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 映像の着順が確定着順と違います');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  // ★横位置はエンジンが引いたものを読むだけ（D-071）。ここで並べ直さないこと
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
  throw new Error('★D-059: 位置モデルの最終順が着順と違います');
}
const knots = knotsFor(boundaries, 1);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));
const finishSec = new Map(boundaries.map((b) => [b.gate, b.finishSec]));

/* ── 素材（★Web 画面と同じものを読むこと） ─────────────── */
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
async function library(prefix) {
  const files = Array.from({ length: 8 }, (_, i) => path.join(ART, `${prefix}${String(i + 1).padStart(2, '0')}.png`));
  const measured = await Promise.all(files.map(async (file) => ({
    image: await loadImage(file), source: await alphaBounds(file),
  })));
  const referenceHeight = Math.max(...measured.map((f) => f.source.height));
  const frames = measured.map((f) => ({ ...f, referenceHeight }));
  return {
    sheet: frames[0].image, sheetWidth: frames[0].source.width,
    spec: { frames: 1, cellH: referenceHeight, anchorXRatio: 0.5, anchorYRatio: 1 },
    frameImages: frames,
  };
}
const libraries = {
  'side-v6': await library('horse-jockey-side-v7-pose'),
  'diag-front-v2': await library('horse-jockey-diag-front-v3-pose'),
  'diag-rear-v2': await library('horse-jockey-diag-rear-v5-pose'),
  'high-diag-v2': await library('horse-jockey-high-diag-v4-pose'),
  // ★勝馬追従だけ 1 枚素材。渡さないと `spec` が undefined になって落ちる
  'winner-v1': await (async () => {
    const file = path.join(ART, 'horse-jockey-winner-v1.png');
    const image = await loadImage(file), source = await alphaBounds(file);
    return {
      sheet: image, sheetWidth: source.width,
      spec: { frames: 1, cellH: source.height, anchorXRatio: 0.5, anchorYRatio: 1 },
      frameImages: [{ image, source, referenceHeight: source.height }],
    };
  })(),
};
const plates = {
  backstretch: await loadImage(path.join(ART, 'race-backstretch-side-v1.png')),
  homestretch: await loadImage(path.join(ART, 'race-corner-exit-side-v1.png')),
  finish: await loadImage(path.join(ART, 'race-finish-side-v2.png')),
  cornerRear: await loadImage(path.join(ART, 'race-corner-rear-v2.png')),
  cornerHigh: await loadImage(path.join(ART, 'race-corner-high-v2.png')),
};
/**
 * ★横視点**以外**は `texturedWorld`（立体の世界）。Web 画面と同じ条件にすること。
 *
 * ⚠️ 2026-08-21: ここで横視点用の平面プレートを貼っていたため、**空撮が真横の背景**で描かれ、
 *    「空撮に見えない／構図が悪い」と誤診しかけました。**道具が違う画を出していました。**
 */
const PX = path.join(ART, 'parallax', 'backstretch-side-v1');
const manifest = JSON.parse(readFileSync(path.join(PX, 'manifest.json'), 'utf8'));
const layerImages = await Promise.all(manifest.layers.map((l) => loadImage(path.join(PX, l.file))));
const layerTexture = (name, pxPerM) => {
  const i = manifest.layers.findIndex((l) => l.name === name);
  if (i < 0) return undefined;
  const image = layerImages[i];
  return { image, width: image.width, height: image.height, pxPerM };
};
const worldTurf = await loadImage(path.join(PX, manifest.world.turf.file));
const worldPano = await loadImage(path.join(PX, manifest.world.panorama.file));
const worldTrees = manifest.world.trees === undefined
  ? null : await loadImage(path.join(PX, manifest.world.trees.file));
const texturedWorld = {
  turf: { image: worldTurf, width: worldTurf.width, height: worldTurf.height, pxPerM: manifest.world.turf.pxPerM },
  panorama: { image: worldPano, width: worldPano.width, height: worldPano.height, horizonY: manifest.world.panorama.horizonY },
  scenery: {
    ...(layerTexture('hedge', 60) !== undefined ? { hedge: layerTexture('hedge', 60) } : {}),
    ...(worldTrees !== null
      ? { trees: { image: worldTrees, width: worldTrees.width, height: worldTrees.height, pxPerM: 20 } }
      : layerTexture('trees', 20) !== undefined ? { trees: layerTexture('trees', 20) } : {}),
    ...(layerTexture('stand', 12) !== undefined ? { stand: layerTexture('stand', 12) } : {}),
  },
};

const gateOpenFile = path.join(ART, 'starting-gate-front-open-v1.png');
const gateOpen = { image: await loadImage(gateOpenFile), source: await alphaBounds(gateOpenFile) };

mkdirSync(OUT, { recursive: true });
const files = [];
console.log('  表示秒   先頭m   ショット      横広がり   馬の高さ  画面比  画面内');
console.log('  ★合格の finish-line は 181px / 25.2%');
for (const [index, displaySec] of displaySecs.entries()) {
  const raceD = Math.max(0, displaySec - INTRO_SEC);
  const sec = warp.raceSecAt(raceD);
  const at = model.at(sec);
  const allFinished = at.every((h) => h.meters >= DIST - 1e-6);
  const visual = withFinishRunOut(at, (g) => finishSec.get(g), sec, DIST, 0);
  const horses = visual.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: h.staminaRatio ?? 1 }));
  const lead = Math.max(...horses.map((h) => h.s));
  const spread = Math.max(...horses.map((h) => h.w)) - Math.min(...horses.map((h) => h.w));
  // ⚠️ 第4引数は `allFinished`（真偽値）。ここに object を渡すと**常に真**になり、
  //    全時刻が `winner-follow` になります（2026-08-21 に踏んだ）。
  const scene = resolveBroadcastV2Scene(
    course, horses, { width: W, height: H }, allFinished, { raceDisplaySec: raceD },
  );

  const plate = scene.shot.id === 'finish-line' || scene.shot.id === 'winner-follow' ? plates.finish
    : scene.shot.id === 'homestretch-side' ? plates.homestretch
      : scene.shot.id === 'third-corner-rear' ? plates.cornerRear
        : scene.shot.id === 'first-corner-front' || scene.shot.id === 'second-corner-high'
          || scene.shot.id === 'fourth-corner-high' ? plates.cornerHigh
          : plates.backstretch;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  /**
   * ★被写体ブラーの速度（m/s）。**レース時計**で微分します（画面 `page.tsx` と同じ 1 つの量）。
   *   ⚠️ **表示時計で微分してはいけません。** 時間圧縮ぶん過大になり（道中 125m/s）、
   *      ここで作る絵だけ尾が長くなります（R-30: オーナーと別の画を測る）。
   */
  const PROBE = 0.08;
  const nowByGate = new Map(at.map((h) => [h.gate, h.meters]));
  const aheadByGate = new Map(model.at(sec + PROBE).map((h) => [h.gate, h.meters]));
  const speedMpsOf = (g) => {
    if (raceD <= 0) return 0;
    const now = nowByGate.get(g); const next = aheadByGate.get(g);
    if (now === undefined || next === undefined) return 0;
    return Math.max(0, (next - now) / PROBE);
  };
  drawBroadcastV2Scene(ctx, course, scene, {
    palette, libraries, fieldSize: FIELD,
    /**
     * ★走行位相は進んだ距離から。★完歩長は**パッケージの定数**を読みます
     *   （以前ここだけ 2.4m と書いてあり、画面の 7m と 2.9 倍ずれていました）。
     */
    frameOf: (g) => Math.floor((horses.find((h) => h.gate === g)?.s ?? 0) / BROADCAST_STRIDE_M * 8 + g * 2.96) % 8,
    phaseOf: (g) => (((horses.find((h) => h.gate === g)?.s ?? 0) / BROADCAST_STRIDE_M) + g * 0.37) % 1,
    // ★被写体ブラー: 画面と同じ定数・同じ速度の作り方
    motionBlur: { exposureSec: MOTION_BLUR_EXPOSURE_SEC, samples: MOTION_BLUR_SAMPLES, speedMpsOf },
    frameRoleOf, surface: 'turf', condition: 'good', kickupColor: '#738b43',
    // ★Web 画面と同じ分岐（page.tsx: shot.view === 'side' ? undefined : texturedWorld）
    texturedWorld: scene.shot.view === 'side' ? undefined : texturedWorld,
    backgroundPlate: scene.shot.view !== 'side' || plate === undefined ? undefined : {
      image: plate, width: plate.width, height: plate.height,
      progress: (scene.focusS % 400) / 400, zoom: 1.14,
    },
    // ★発走 90m までは開いた発馬機が後ろに残る（本番と同じ条件）
    worldBillboards: lead < 90 ? [{
      image: gateOpen.image, width: gateOpen.image.width, height: gateOpen.image.height,
      source: gateOpen.source, worldS: 1.6, worldW: 0.5, widthM: 14.8, zOrder: 'behind',
    }] : undefined,
  });
  const m = measureShot(course, scene.camera, horses, W, H);
  ctx.fillStyle = 'rgba(5,10,8,0.84)'; ctx.fillRect(18, 18, 700, 58);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${displaySec}s / ${scene.shot.id} / 馬 ${m.medianPx.toFixed(0)}px(${(m.ratio * 100).toFixed(0)}%) / 画面内 ${m.inside}/${m.total} / 横 ${spread.toFixed(1)}m`, 34, 52);
  const file = path.join(OUT, `${String(index + 1).padStart(2, '0')}-${displaySec}s-${scene.shot.id}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  files.push(file);
  console.log(`${String(displaySec).padStart(7)}${lead.toFixed(0).padStart(8)}   ${scene.shot.id.padEnd(20)}${spread.toFixed(2).padStart(6)}${(m.medianPx.toFixed(0) + 'px').padStart(9)}${((m.ratio * 100).toFixed(1) + '%').padStart(8)}${(m.inside + '/' + m.total).padStart(8)}`);
}

/** 一覧（2 列） */
const cols = 2, rows = Math.ceil(files.length / cols);
const sheet = createCanvas(W * cols, H * rows);
const sctx = sheet.getContext('2d');
for (const [i, f] of files.entries()) {
  sctx.drawImage(await loadImage(f), (i % cols) * W, Math.floor(i / cols) * H);
}
const out = path.join(OUT, 'contact-sheet.png');
await sharp(sheet.toBuffer('image/png')).resize({ width: 1280 }).png().toFile(out);
console.log(`\n${out}`);
