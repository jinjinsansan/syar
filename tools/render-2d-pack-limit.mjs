/**
 * ★**2D 馬群描画の限界テスト**（`DEV_INSTRUCTIONS_P4_2D_LIMIT_TEST_20260822.md`）
 *
 * 【この道具の目的】
 *   完成版のレースを作る道具ではありません。
 *   ★**現行の 2D スプライト方式で「密集した馬群が高速で走る画」が成立するか**だけを、
 *     隔離した短い比較で判定するための証拠を作ります。
 *
 * 【★通常レースには触れません】
 *   ・`/race` の台本・既定値・着順・進行を一切変えません
 *   ・ここで行う密集化は**表示座標の変換**で、レース結果（`resolveRace`）は素通しです
 *   ・レース結果・乱数・ポイント・DB・認証・worker には接続しません
 *
 * 【固定条件（指示書 §5）】
 *   1920×1080 / 8.0 秒 / 30fps / 12 頭 / 芝 / 光は 1 種類 / シード固定 /
 *   真横追従・カット切替なし・HUD なし
 *
 * 実行:
 *   npx tsx tools/render-2d-pack-limit.mjs            （全バリアント）
 *   npx tsx tools/render-2d-pack-limit.mjs --only v3  （1 つだけ）
 *   npx tsx tools/render-2d-pack-limit.mjs --frames 30（短く試す）
 */
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  BROADCAST_STRIDE_M,
  cameraBasis, drawBroadcastV2Scene, finalOrderOf, frameRoleOf, ovalCourse,
  paintCrowd, posOf, project, replayPositionModel, resolveBroadcastV2Scene,
  seatBandFromPixels, seatMaskFromPixels,
  packDensify, packPhaseOffsets, packStrideScale, PACK_LIMIT_TEST,
  applyCoat, isHorseCoat, COAT_TRANSFORMS,
} from '@star/render';

/* ── 固定条件（指示書 §5） ─────────────────────────────── */
const W = 1920, H = 1080, FPS = 30, FIELD = 12, DIST = 1600, SEED = 42;
const DURATION_SEC = 8.0;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/2d-pack-limit');
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : dflt; };
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined;
const FRAMES = flag('--frames', Math.round(DURATION_SEC * FPS));

for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/* ── レース（★本番と同じ経路。結果は読むだけ） ───────────── */
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
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
  throw new Error('★D-059: 位置モデルの最終順が着順と違います');
}

/**
 * ★**時間は実時間**（時間圧縮を掛けません）。
 *   このテストが見るのは馬群の画であって尺ではないので、脚は実物の速さで回します。
 *   ★向正面の直線（走路 200〜600m）を使います。コーナーだと真横カメラが回り込み、
 *     「馬群の見え方」以外の要素が混ざるためです。
 */
const START_LEADER_M = 300;
const startRaceSec = (() => {
  let lo = 0, hi = Math.max(...boundaries.map((b) => b.finishSec));
  for (let i = 0; i < 44; i += 1) {
    const mid = (lo + hi) / 2;
    const lead = Math.max(...model.at(mid).map((h) => h.meters));
    if (lead < START_LEADER_M) lo = mid; else hi = mid;
  }
  return hi;
})();

/* ── 素材（★`tools/shot-race-at.mjs` と同じものを同じ手順で読む） ── */
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
/**
 * ★**毛色を馬ごとに焼く**（画面 `page.tsx` の `bakeCoat` と同じ規則）。
 *
 * ⚠️ ★これが無いと **12 頭が完全に同じ絵**になり、
 *    「馬群が同じ動きに見える」のが**位相のせいなのか、同じ絵だからなのか**を
 *    区別できません。判定を濁らせないために入れます。
 *
 * ⚠️ ★勝負服（枠色）は**この道具では焼いていません**（画面には付きます）。
 *    したがって、このテストの絵は**画面より「同じ馬に見えやすい」側**に振れています。
 */
const COAT_BY_GATE = ['bay', 'chestnut', 'dark-bay', 'bay', 'grey', 'bay', 'chestnut', 'blue-black', 'bay', 'dark-bay', 'chestnut', 'bay'];
function bakeCoat(image, source, coat) {
  const t = COAT_TRANSFORMS[coat];
  if (t === undefined) return image;
  const c = createCanvas(image.width, image.height);
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  const data = cx.getImageData(0, 0, image.width, image.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!isHorseCoat(r, g, b)) continue;
    const [R, G, B] = applyCoat(r, g, b, t);
    d[i] = R; d[i + 1] = G; d[i + 2] = B;
  }
  cx.putImageData(data, 0, 0);
  void source;
  return c;
}
/** 馬番ごとのコマ（毛色を焼いたもの）。同じ毛色は焼き直さない */
function byGate(base) {
  const cache = new Map();
  return COAT_BY_GATE.map((coat) => {
    if (!cache.has(coat)) {
      cache.set(coat, base.frameImages.map((f) => ({ ...f, image: bakeCoat(f.image, f.source, coat) })));
    }
    return cache.get(coat);
  });
}

const libraries = {
  'side-v6': await library('horse-jockey-side-v7-pose'),
  'diag-front-v2': await library('horse-jockey-diag-front-v3-pose'),
  'diag-rear-v2': await library('horse-jockey-diag-rear-v5-pose'),
  'high-diag-v2': await library('horse-jockey-high-diag-v4-pose'),
  'winner-v1': await library('horse-jockey-side-v7-pose'),
};
for (const key of Object.keys(libraries)) {
  libraries[key] = { ...libraries[key], frameImagesByGate: byGate(libraries[key]) };
}

const PX = path.join(ART, 'parallax', 'backstretch-side-v1');
const manifest = JSON.parse(readFileSync(path.join(PX, 'manifest.json'), 'utf8'));
function withCrowd(image) {
  const c = createCanvas(image.width, image.height);
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  const data = cx.getImageData(0, 0, image.width, image.height).data;
  const band = seatBandFromPixels(data, image.width, image.height);
  paintCrowd(cx, image.width, image.height, seatMaskFromPixels(data, image.width, image.height, band));
  return c;
}
const layerImages = await Promise.all(manifest.layers.map(async (l) => {
  const img = await loadImage(path.join(PX, l.file));
  return l.name === 'stand' ? withCrowd(img) : img;
}));
const objectImages = await Promise.all(manifest.objects.map((o) => loadImage(path.join(PX, o.file))));
const parallaxPlate = {
  plateWidth: manifest.plateWidth,
  plateHeight: manifest.plateHeight,
  layers: manifest.layers.map((l, i) => ({
    image: layerImages[i], width: layerImages[i].width, height: layerImages[i].height,
    plateY0: l.plateY0, plateY1: l.plateY1, depthOffsetM: l.depthOffsetM,
  })),
  objects: manifest.objects
    .map((o, i) => ({ o, image: objectImages[i] }))
    .filter(({ o }) => !o.name.startsWith('start-'))
    .map(({ o, image }) => ({
      image, width: image.width, height: image.height,
      plateY0: o.plateY0, anchorXRatio: o.anchorXRatio,
      worldS: o.worldS === 'finish' ? DIST : o.worldS,
      depthOffsetM: o.depthOffsetM,
      ...(o.zOrder !== undefined ? { zOrder: o.zOrder } : {}),
      ...(o.worldW !== undefined ? { worldW: o.worldW } : {}),
      ...(o.anchorYRatio !== undefined ? { anchorYRatio: o.anchorYRatio } : {}),
      ...(o.scale !== undefined ? { scale: o.scale } : {}),
    })),
};

/* ── バリアント ────────────────────────────────────── */
const VARIANTS = [
  { id: 'v0', name: 'v0-current', dense: false, phase: 'gate', occlude: false, integrate: false },
  { id: 'v1', name: 'v1-dense', dense: true, phase: 'gate', occlude: false, integrate: false },
  { id: 'v2', name: 'v2-pack', dense: true, phase: 'hash', occlude: true, integrate: false },
  { id: 'v3', name: 'v3-integrated', dense: true, phase: 'hash', occlude: true, integrate: true },
];

/** その時刻の 12 頭（バリアントごとの表示座標変換つき） */
function horsesAt(raceSec, variant) {
  const raw = model.at(raceSec).map((h) => ({ gate: h.gate, s: h.meters, w: h.w }));
  return variant.dense ? packDensify(raw, PACK_LIMIT_TEST) : raw;
}

/** 走行位相（バリアントごと） */
function phaseFns(variant, horses) {
  const byGate = new Map(horses.map((h) => [h.gate, h.s]));
  if (variant.phase === 'gate') {
    // ★V0/V1: 現行のまま（進んだ距離 ÷ 完歩長 ＋ 馬番 × 0.37）
    return {
      phaseOf: (gate) => (((byGate.get(gate) ?? 0) / BROADCAST_STRIDE_M) + gate * 0.37) % 1,
      frameOf: (gate) => Math.floor(((byGate.get(gate) ?? 0) / BROADCAST_STRIDE_M) * 8 + gate * 2.96) % 8,
    };
  }
  // ★V2/V3: 位相をハッシュで散らし、完歩長にも個体差（平均速度・着順は変えない）
  const offsets = packPhaseOffsets(FIELD, PACK_LIMIT_TEST.phaseSeed);
  const strides = packStrideScale(FIELD, PACK_LIMIT_TEST.phaseSeed);
  const phase = (gate) => {
    const stride = BROADCAST_STRIDE_M * (strides.get(gate) ?? 1);
    return ((((byGate.get(gate) ?? 0) / stride) + (offsets.get(gate) ?? 0)) % 1 + 1) % 1;
  };
  return { phaseOf: phase, frameOf: (gate) => Math.floor(phase(gate) * 8) % 8 };
}

/** 1 コマ描く（背景と馬を別々の画布にも出せる） */
function drawFrame(raceSec, variant, target) {
  const horses = horsesAt(raceSec, variant);
  const scene = resolveBroadcastV2Scene(
    course, horses.map((h) => ({ ...h, finished: false })),
    { width: W, height: H }, false, { forceShotId: 'side-low' },
  );
  const { phaseOf, frameOf } = phaseFns(variant, horses);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawBroadcastV2Scene(ctx, course, target === 'background' ? { ...scene, visibleHorses: [] } : scene, {
    palette, libraries, fieldSize: FIELD,
    frameOf, phaseOf, frameRoleOf,
    surface: 'turf', condition: 'good', kickupColor: '#738b43',
    parallaxPlate: { plate: parallaxPlate, zoom: 1.14, verticalAnchor: 1.0, scrollM: scene.focusS },
    // ★HUD もカット切替も無し（指示書 §5）
    mowStripes: true, distancePoles: false, finishPost: false,
  });
  return { canvas, scene, horses };
}

/**
 * ★V3 の統合処理。
 *   ⚠️ 画面全体へ一様なぼかしを掛けません。**背景と馬を別々**に処理して合成します。
 *   ⚠️ 被写体ブラーは**1 回の方向性ぼかし**で作ります（残像を複数枚重ねません）。
 */
async function integrate(raceSec, variant) {
  const full = drawFrame(raceSec, variant, 'full');
  const bg = drawFrame(raceSec, variant, 'background');
  const cfg = PACK_LIMIT_TEST.integrate;
  const bgBuf = bg.canvas.toBuffer('image/png');
  const fullBuf = full.canvas.toBuffer('image/png');
  // ① 背景を軽くぼかす（被写界深度）
  const bgSoft = await sharp(bgBuf).blur(cfg.backgroundBlurPx).toBuffer();
  // ② 馬の層 ＝ 全体 − 背景（差分をαにする）
  const [a, b] = await Promise.all([
    sharp(fullBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(bgBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const n = a.info.width * a.info.height;
  const horseLayer = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const d = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]);
    horseLayer[o] = a.data[o]; horseLayer[o + 1] = a.data[o + 1]; horseLayer[o + 2] = a.data[o + 2];
    horseLayer[o + 3] = d > cfg.horseMaskThreshold ? 255 : 0;
  }
  // ③ 馬だけに方向性ブラー（横方向）。★1 回だけ。残像を重ねない
  const horseSoft = await sharp(horseLayer, { raw: { width: a.info.width, height: a.info.height, channels: 4 } })
    .png().blur(cfg.horseBlurPx).toBuffer();
  // ④ 合成 → ⑤ 全画面の色調を揃える
  const composed = await sharp(bgSoft).composite([{ input: horseSoft, blend: 'over' }])
    .modulate({ brightness: cfg.grade.brightness, saturation: cfg.grade.saturation, hue: cfg.grade.hueDeg })
    .png().toBuffer();
  return { buffer: composed, scene: full.scene, horses: full.horses };
}

/* ── 生成 ─────────────────────────────────────────── */
mkdirSync(OUT, { recursive: true });
/**
 * ⚠️ ★`--only` で 1 つだけ回したときに、**他のバリアントの測定値を消さない**こと。
 *    最初は毎回まっさらに書いていたので、部分実行のたびに測定が 1 件に減っていました。
 */
let previous = {};
try { previous = JSON.parse(readFileSync(path.join(OUT, 'measurements.json'), 'utf8')).variants ?? {}; } catch { previous = {}; }
const measurements = {
  reference_times_sec: [50.0, 52.0, 54.0, 56.0, 58.0],
  output_times_sec: [0, 2, 4, 6, 7.9],
  resolution: [W, H],
  fps: FPS,
  seed: SEED,
  window: { start_leader_m: START_LEADER_M, start_race_sec: Number(startRaceSec.toFixed(3)), duration_sec: DURATION_SEC },
  variants: { ...previous },
};

for (const variant of VARIANTS) {
  if (only !== undefined && only !== variant.id) continue;
  const dir = path.join(OUT, `_frames-${variant.id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const sheetFrames = [];
  let sample;
  for (let f = 0; f < FRAMES; f += 1) {
    const t = (f / FPS) * (DURATION_SEC / (FRAMES / FPS));
    const raceSec = startRaceSec + t;
    let buffer, scene, horses;
    if (variant.integrate) {
      ({ buffer, scene, horses } = await integrate(raceSec, variant));
    } else {
      const drawn = drawFrame(raceSec, variant, 'full');
      buffer = drawn.canvas.toBuffer('image/png');
      scene = drawn.scene; horses = drawn.horses;
    }
    writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), buffer);
    if (f === 0) sample = { scene, horses };
    for (const mark of measurements.output_times_sec) {
      if (Math.abs(t - mark) < 0.5 / FPS) sheetFrames.push({ t: mark, buffer });
    }
    if (f % 30 === 0) process.stdout.write(`\r  ${variant.name} ${f}/${FRAMES}   `);
  }
  process.stdout.write(`\r  ${variant.name} ${FRAMES}/${FRAMES} 完了      \n`);

  // 動画
  const mp4 = path.join(OUT, `${variant.name}.mp4`);
  execFileSync(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', mp4], { stdio: 'ignore' });

  // コンタクトシート（0/2/4/6/8 秒・同一サイズ同一配置・説明文なし）
  const CW = 640, CH = Math.round(CW * H / W), LBL = 22;
  const sheet = createCanvas(CW, sheetFrames.length * (CH + LBL));
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [i, item] of sheetFrames.entries()) {
    const img = await loadImage(item.buffer);
    sctx.drawImage(img, 0, i * (CH + LBL) + LBL, CW, CH);
    sctx.fillStyle = '#fff'; sctx.font = 'bold 15px JPUI, sans-serif';
    sctx.fillText(`${variant.name}  ${item.t.toFixed(1)}s`, 6, i * (CH + LBL) + 16);
  }
  writeFileSync(path.join(OUT, `${variant.id}-contact-sheet.png`), sheet.toBuffer('image/png'));

  // 測定
  const hs = [...sample.horses].sort((a, b) => b.s - a.s);
  const top8 = hs.slice(0, 8);
  const offsets = variant.phase === 'hash'
    ? [...packPhaseOffsets(FIELD, PACK_LIMIT_TEST.phaseSeed).entries()].map(([g, v]) => [g, Number(v.toFixed(4))])
    : Array.from({ length: FIELD }, (_, i) => [i + 1, Number(((i + 1) * 0.37 % 1).toFixed(4))]);
  measurements.variants[variant.id] = {
    name: variant.name,
    top8_span_m: Number((top8[0].s - top8[top8.length - 1].s).toFixed(2)),
    all12_span_m: Number((hs[0].s - hs[hs.length - 1].s).toFixed(2)),
    lateral_span_m: Number((Math.max(...hs.map((h) => h.w)) - Math.min(...hs.map((h) => h.w))).toFixed(2)),
    lateral_distinct_columns: new Set(hs.map((h) => Math.round(h.w / 1.2))).size,
    directional_sets_used: ['side-v7 (真横 8 コマ)'],
    frames_per_horse: 8,
    phase_offsets: offsets,
    stride_scale: variant.phase === 'hash'
      ? [...packStrideScale(FIELD, PACK_LIMIT_TEST.phaseSeed).entries()].map(([g, v]) => [g, Number(v.toFixed(4))])
      : 'すべて 1.0（個体差なし）',
    camera: {
      shot: 'side-low', fov_deg: Number(((sample.scene.camera.fovY * 180) / Math.PI).toFixed(3)),
      back_m: 44, up_m: 3.5, side_m: 9, follows: '馬群（先頭を画面内に置く注視）',
    },
    blur: variant.integrate
      ? { horse_blur_px: PACK_LIMIT_TEST.integrate.horseBlurPx, background_blur_px: PACK_LIMIT_TEST.integrate.backgroundBlurPx, method: '1 回の方向性ぼかし（残像の重ねではない）' }
      : 'なし',
    command: `npx tsx tools/render-2d-pack-limit.mjs --only ${variant.id}`,
  };
  rmSync(dir, { recursive: true, force: true });
}

writeFileSync(path.join(OUT, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);
console.log(`\n★出力: ${OUT}`);
