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
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import { DEFAULT_RACE_SCRIPT,
  BROADCAST_STRIDE_M, DEMO_CONTEST_GAMMA, MOTION_BLUR_ENABLED, MOTION_BLUR_EXPOSURE_SEC, MOTION_BLUR_SAMPLES, HORSE_HEIGHT_M,
  drawFormationBar, drawHorseNamePlates, drawOwnHorseMarker, referenceNamePlateRows,
  paintCrowd, seatMaskFromPixels, seatBandFromPixels,
  cameraBasis, drawBroadcastV2Scene, finalOrderOf, frameRoleOf, knotsFor, ovalCourse,
  posOf, project, ratesForTarget, replayPositionModel, resolveBroadcastV2Scene,
  targetDisplaySec, timeWarpFor, withFinishRunOut, GATE_FRONT_STALL_PLATES,
  dustExposureCurve, INFIELD_REVERSED_DEFAULT,
  broadcastV2StartLagM,
} from '@star/render';

/** ★書体。★画面（`page.tsx`）と同じ形にすること。ここだけ違えるとこの道具が別の絵を測る（R-30） */
const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px JPUI, system-ui, sans-serif`;

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

const W = 1280, H = 720, FIELD = 12, DIST = 1600;
const ART = path.resolve('apps/web/public/art');
const OUT = path.resolve('out/race-at');
/**
 * ★**和文フォントを登録する。**
 *
 * ⚠️ `@napi-rs/canvas` は既定で和文の字形を持たないので、馬名が**全部豆腐（□）**になります。
 *    ★それでも「HUD は出ている」ようには見えるので、**読めるかどうかを判定できません。**
 *    画面（ブラウザ）は和文を出すので、登録しないとこの道具は別の画を出します（R-30）。
 */
for (const file of ['C:/Windows/Fonts/YuGothB.ttc', 'C:/Windows/Fonts/meiryob.ttc', 'C:/Windows/Fonts/msgothic.ttc']) {
  try { if (GlobalFonts.registerFromPath(file, 'JPUI')) break; } catch { /* 次の候補へ */ }
}

const palette = JSON.parse(readFileSync(path.join(ART, 'palette.json'), 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });

/** ★発走からの表示秒（`raceDisplaySec`）。ゲート待機の 7.8 秒はここに含めない */
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : dflt; };
/**
 * ★**どの台本で描くか**（2026-08-28 追加）。
 *
 * ⚠️ ★以前この道具は `script` を**一度も渡していません**でした。`broadcast-v2.ts` の
 *    既定引数は **v4** のままなので、★**画面（既定 v5）と違う台本の絵を描いていました**（R-30）。
 *    ★4 角の前後を撮ると、画面には無い `fourth-corner-front` が出ます。
 * ★既定は**画面の既定**（v5）にします。エンジン側の既定ではありません。
 */
const SCRIPT = (() => { const i = argv.indexOf('--script'); return i >= 0 ? argv[i + 1] : DEFAULT_RACE_SCRIPT; })();
/** ★どのレースを描くか。★以前は 42 固定でした */
const SEED = flag('--seed', 42);
/**
 * ★**自馬の枠**。★画面（`page.tsx` の `useState(3)`）と同じにすること。
 *
 * ⚠️ ★ここは 2026-08-28 まで**二重に壊れて**いました。
 *    ★時間の伸縮を組む基準馬は `knotsFor(boundaries, 1)` の**1 番固定**、
 *    ★自馬の印だけが**4 番固定**でした。
 *    ★`knotsFor` は**その馬の節目を実時間に寄せる**ので、基準馬が違うと
 *    ★**同じ表示秒が別の瞬間を指します**。実測で **2.33 秒**ずれていました
 *    （この道具の 33.47s が、画面の 35.8s）。★測定値を秒で照合できませんでした（R-30）。
 */
const OWN_GATE = flag('--own', 3);
/** ★馬場（`--surface dirt`）。★画面の既定（`useState('turf')`）と同じ */
const SURFACE = (() => { const i = argv.indexOf('--surface'); return i >= 0 ? argv[i + 1] : 'turf'; })();
if (SURFACE !== 'turf' && SURFACE !== 'dirt') throw new Error(`★--surface は turf / dirt: ${SURFACE}`);
/**
 * ★馬場状態（`--condition yielding|soft|bad`）。★画面の既定（`useState('good')`）と同じ。
 * ⚠️ ★ここは `'good'` が**直書き**されていました。★道具が良しか撮れないので、
 *    ★**濡れた馬場の絵をオーナーに出せませんでした**（R-31 の家族）。
 */
const CONDITION = (() => { const i = argv.indexOf('--condition'); return i >= 0 ? argv[i + 1] : 'good'; })();
if (!['good', 'yielding', 'soft', 'bad'].includes(CONDITION)) throw new Error(`★--condition は good/yielding/soft/bad: ${CONDITION}`);
/** ★砂煙の色。★`page.tsx:2008` と同じ値 */
const KICKUP_COLOR = SURFACE === 'dirt' ? '#796047' : '#738b43';
/** ★舞い上がった砂煙の色。★`page.tsx` と同じ値（R-30） */
const DUST_COLOR = SURFACE === 'dirt' ? '#cdb494' : undefined;
/**
 * ★**着差の見せ方（γ）**。
 *
 * ⚠️ ★以前この道具は `DEFAULT_RACE_BALANCE`（γ=1.0）固定でした。
 *    ★画面の既定は `DEMO_CONTEST_GAMMA`（=1.3）なので、
 *    ★**画面と別のレースを描いていました**（R-30 / R-31）。
 * ★既定は**画面側**に倒します。エンジン既定で描きたいときは `--gamma 1` を明示すること。
 */
const GAMMA = flag('--gamma', DEMO_CONTEST_GAMMA);
const BALANCE = GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
  ? DEFAULT_RACE_BALANCE
  : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: GAMMA };
const INTRO_SEC = 7.8;  // race-intro.ts の RACE_INTRO_RACE_START_SEC
/** ★立ち上がりの基準にする走速（m/s）。★`page.tsx` と同じ値 */
const RACE_SPEED_MPS = 15.6;
const startShownMeters = (meters, raceDisplaySec) =>
  Math.max(0, meters - broadcastV2StartLagM(raceDisplaySec, RACE_SPEED_MPS));
/**
 * ⚠️ ★`--shot` / `--fov` の**値**を秒数と取り違えないこと。
 *    取り違えると、指定していない時刻の絵が黙って 1 枚増えます（実際に増えました）。
 */
/**
 * ★**オプションの値を「秒数」と取り違えないための除外**。
 *
 *   ⚠️ ★ここは 2026-08-28 まで**名前を並べた一覧**でした。
 *      ★新しいオプションを足してこの一覧に入れ忘れると、
 *      ★**その値が黙って秒数になり、指定していない時刻の絵が 1 枚増えます**。
 *      ★実際に `--seed 14 --gamma 1.6` を足した直後、**14 秒と 1.6 秒の絵が増えました**。
 * ★一覧をやめ、**`--` で始まるものの次**を一律で値と見なします（数え上げは必ず漏れる・R-29）。
 *   ※ `--noblur` のような値を取らないオプションの次は、それ自体が `--` で始まるか
 *     秒数なので、次が数字なら値と見なされます。★値を取らないオプションは
 *     ★**秒数より後ろに書くか、先頭にまとめて書くこと**。
 */
/** ★値を取らないオプション。★ここへ入れ忘れると★**次の秒数が食われます** */
const VALUELESS = new Set(['--noblur', '--infield-reversed', '--infield-dirt', '--no-soil']);
const optionValueIndexes = new Set();
argv.forEach((a, i) => {
  if (a.startsWith('--') && !VALUELESS.has(a)) optionValueIndexes.add(i + 1);
});
let displaySecs = argv
  .filter((a, i) => /^[0-9.]+$/.test(a) && !optionValueIndexes.has(i))
  .map(Number);
if (argv.includes('--from')) {
  const from = flag('--from', 9), to = flag('--to', 30), step = flag('--step', 3);
  displaySecs = [];
  for (let t = from; t <= to + 1e-9; t += step) displaySecs.push(Number(t.toFixed(2)));
}
if (displaySecs.length === 0) displaySecs = [9, 12, 15, 18, 21, 24];
/**
 * ★`--shot <id>` で**台本に無いカットも撮れる**ようにする。
 *   引き・俯瞰（`aerial` / `fourth-corner-wide` / `second-corner-high`）は台本 v4 から
 *   落としてあるので、世界を埋めたあとに再判定するにはこれが要ります（設計 3-1）。
 */
const forcedShot = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : undefined;
/**
 * ★`--fov <度>` で**画角だけ**を差し替える（カメラの位置は動かさない）。
 *
 *   「引きの画にするか、寄りのままか」は演出の裁定事項で、勝手に決めないと
 *   `broadcast-v2.ts` に明記してあります。★裁定するには**同じ場面を両方の画角で**
 *   並べる必要があるので、その材料を作るための口です。
 */
const forcedFov = argv.includes('--fov') ? Number(argv[argv.indexOf('--fov') + 1]) : undefined;
/** ★`--noblur` で被写体ブラーだけを止める（効いているのかを切り分けるため） */
const noBlur = argv.includes('--noblur') || (!MOTION_BLUR_ENABLED && !argv.includes('--exposure'));
/**
 * ★`--exposure <分母>` で露光を変える（例 `--exposure 200` で 1/200 秒）。
 *   ブラーの量は**演出の好み**なので、同じコマを何段階かで並べて選べるようにする。
 */
const exposureDen = argv.includes('--exposure') ? Number(argv[argv.indexOf('--exposure') + 1]) : undefined;
const exposureSec = exposureDen !== undefined && exposureDen > 0 ? 1 / exposureDen : MOTION_BLUR_EXPOSURE_SEC;

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
  raceId: `c${SEED}`, distance: DIST, surface: SURFACE,
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed: SEED, balance: BALANCE });
const { pace } = paceOf(entrants, BALANCE);
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
const knots = knotsFor(boundaries, OWN_GATE);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/**
 * ★**汚れ**（報告 §10-2）。★1 度だけ表を作ります。
 * ⚠️ ★**画面（`page.tsx`）と同じものを渡さないと、この道具だけ馬がきれいなまま**になります
 *    — ★測定器が画面と違う絵を見る形（R-30 / R-31 の再発 9 件と同じ）。
 */
const dustSoil = dustExposureCurve(
  (t) => model.at(t).map((h) => ({ gate: h.gate, s: h.meters, w: h.w ?? course.widthM / 2 })),
  warp.raceSecAt(warp.displaySec),
);
const finishSec = new Map(boundaries.map((b) => [b.gate, b.finishSec]));
/** ★勝馬（画面と同じく「勝馬がゴールしたら」勝馬カットへ切り替える） */
const WINNER_GATE = Number(result.order[0].horseId);

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
/**
 * ★**空席のスタンドに観客を焼き込む**（設計 2-1）。
 *
 * ⚠️ ★画面（`page.tsx`）と**同じ関数・同じ設定**で焼くこと。
 *    片方だけ満員にすると、この道具はオーナーと別の画を出します（R-30）。
 */
function withCrowd(image) {
  const c = createCanvas(image.width, image.height);
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  const data = cx.getImageData(0, 0, image.width, image.height).data;
  // ★屋根の位置は素材から見つける（数字を手で書くと、素材差し替えで黙って屋根に人が乗る）
  const band = seatBandFromPixels(data, image.width, image.height);
  const mask = seatMaskFromPixels(data, image.width, image.height, band);
  paintCrowd(cx, image.width, image.height, mask);
  return c;
}

const layerImages = await Promise.all(manifest.layers.map(async (l) => {
  const img = await loadImage(path.join(PX, l.file));
  return l.name === 'stand' ? withCrowd(img) : img;
}));
/** ★ダート版の地面の層（2026-08-28）。★無ければ undefined で、芝の板に落ちます */
const dirtLayerImages = await Promise.all(manifest.layers.map(async (l) => {
  const file = (manifest.dirtLayers ?? {})[l.name];
  return file === undefined ? undefined : loadImage(path.join(PX, file));
}));
const layerTexture = (name, pxPerM) => {
  const i = manifest.layers.findIndex((l) => l.name === name);
  if (i < 0) return undefined;
  const image = layerImages[i];
  return { image, width: image.width, height: image.height, pxPerM };
};
/**
 * ★**横視点の背景をパララックスに揃える**（2026-08-22）
 *
 * ⚠️ ★ここは 1 枚絵（`plates.homestretch` など）を貼っていました。
 *    画面（`page.tsx`）は**層に切ったパララックス**を使うので、
 *    ★**道具と画面で背景がまったく別物**でした。
 *    実害: スタンドに観客を焼き込んだのに、この道具の横視点では**空席のまま**に見え、
 *    「焼き込みが効いていない」と誤診しかけました（R-30。この案件で 4 回目）。
 */
const objectImages = await Promise.all(manifest.objects.map((o) => loadImage(path.join(PX, o.file))));
const parallaxBackstretch = {
  plateWidth: manifest.plateWidth,
  plateHeight: manifest.plateHeight,
  /**
   * ★**馬場で地面の層を差し替える**（2026-08-28）。★`page.tsx` と同じ規則（R-30）。
   *   ★ダート版が無い層は芝のままです。
   */
  layers: manifest.layers.map((l, i) => {
    const img = SURFACE === 'dirt' && dirtLayerImages[i] !== undefined ? dirtLayerImages[i] : layerImages[i];
    return {
      image: img, width: img.width, height: img.height,
      plateY0: l.plateY0, plateY1: l.plateY1, depthOffsetM: l.depthOffsetM,
      /** ★走路の地面か（濡れた馬場の層はここにだけ）。★画面と同じく `dirtLayers` の鍵から引く */
      isGround: Object.prototype.hasOwnProperty.call(manifest.dirtLayers ?? {}, l.name),
    };
  }),
  // ★画面と同じ条件: 発馬機の側面切り出し（start-*）は使わない
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

const worldTurf = await loadImage(path.join(PX, manifest.world.turf.file));
/** ★ダートの地面（2026-08-28）。★無ければ芝のまま（従来どおり） */
const worldDirt = manifest.world.dirt === undefined
  ? null : await loadImage(path.join(PX, manifest.world.dirt.file));
const worldPano = withCrowd(await loadImage(path.join(PX, manifest.world.panorama.file)));
const worldTrees = manifest.world.trees === undefined
  ? null : await loadImage(path.join(PX, manifest.world.trees.file));
const texturedWorld = {
  turf: { image: worldTurf, width: worldTurf.width, height: worldTurf.height, pxPerM: manifest.world.turf.pxPerM },
  ...(worldDirt === null ? {} : {
    dirt: { image: worldDirt, width: worldDirt.width, height: worldDirt.height, pxPerM: manifest.world.dirt.pxPerM },
  }),
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
console.log('  表示秒   先頭m   ショット      横広がり   馬の高さ  画面比  画面内   芝の緑');
console.log('  ★芝の緑: 参考 平均 約20% / 実装前の我々 約60%（報告①と同じ判定式）');
console.log('  ★合格の finish-line は 181px / 25.2%');
for (const [index, displaySec] of displaySecs.entries()) {
  const raceD = Math.max(0, displaySec - INTRO_SEC);
  const sec = warp.raceSecAt(raceD);
  const at = model.at(sec);
  /**
   * ★勝馬カットへ切り替える条件は**画面と同じ**にすること。
   *   ⚠️ ここは「全馬がゴール」で判定していましたが、画面（`page.tsx`）は
   *      「**勝馬が**ゴール」です。**切り替わる時刻が違う画**を出していました（R-30）。
   */
  const allFinished = (at.find((h) => h.gate === WINNER_GATE)?.meters ?? 0) >= DIST - 1e-6;
  const visual = withFinishRunOut(at, (g) => finishSec.get(g), sec, DIST, 0);
  /**
   * ★**発走の遅れを引く**（`page.tsx` の `startShownMeters` と同じ）。
   *
   * ⚠️ ★この道具は 2026-08-28 まで**これを引いていません**でした。
   *    ★画面も監査も両方引いています。★つまりこの道具だけが
   *    ★**馬を 8.32m 先に描いて**いました（ラチや距離標識との位置関係がずれます）。
   */
  const shown = visual.map((h) => ({ ...h, meters: startShownMeters(h.meters, raceD) }));
  const horses = shown.map((h) => ({ gate: h.gate, s: h.meters, w: h.w, staminaRatio: h.staminaRatio ?? 1 }));
  const lead = Math.max(...horses.map((h) => h.s));
  const spread = Math.max(...horses.map((h) => h.w)) - Math.min(...horses.map((h) => h.w));
  // ⚠️ 第4引数は `allFinished`（真偽値）。ここに object を渡すと**常に真**になり、
  //    全時刻が `winner-follow` になります（2026-08-21 に踏んだ）。
  let scene = resolveBroadcastV2Scene(
    course, horses, { width: W, height: H }, allFinished,
    forcedShot === undefined
      ? { raceDisplaySec: raceD, script: SCRIPT }
      : { raceDisplaySec: raceD, script: SCRIPT, forceShotId: forcedShot },
  );

  if (forcedFov !== undefined && Number.isFinite(forcedFov)) {
    scene = { ...scene, camera: { ...scene.camera, fovY: (forcedFov * Math.PI) / 180 } };
  }
  const plate = scene.shot.id === 'finish-line' || scene.shot.id === 'winner-follow' ? plates.finish
    : scene.shot.id === 'homestretch-side' ? plates.homestretch
      : scene.shot.id === 'third-corner-rear' ? plates.cornerRear
        : scene.shot.id === 'first-corner-front' || scene.shot.id === 'second-corner-high'
          || scene.shot.id === 'fourth-corner-high' ? plates.cornerHigh
          : plates.backstretch;
  void plate;
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
    motionBlur: noBlur ? undefined : { exposureSec, samples: MOTION_BLUR_SAMPLES, speedMpsOf },
    // ★ハロン棒の数字（設計 1-7）。画面と同じく書体を渡す
    poleFont: (px, bold) => `${bold ? 'bold ' : ''}${px}px JPUI, system-ui, sans-serif`,
    frameRoleOf, surface: SURFACE, condition: CONDITION, kickupColor: KICKUP_COLOR,
    ...(DUST_COLOR === undefined ? {} : { dustColor: DUST_COLOR }),
    /**
     * ★浴びた砂で馬が汚れる（報告 §10-2）。★画面と同じ量を渡す（R-31）。
     *   ★`--no-soil` で切って比べられます（★既定は画面と同じ「入り」）。
     */
    ...(argv.includes('--no-soil') ? {} : { dustExposureOf: (g) => dustSoil(sec, g) }),
    /**
     * ★内側の帯を芝に（Q-3 の B 案・2026-08-29 から**既定**）。
     * ⚠️ ★**既定を道具に直書きしません**（R-31）。★`INFIELD_REVERSED_DEFAULT` を読みます。
     *    ★`--infield-dirt` で従来（褐色のまま）に戻して比べられます。
     */
    infieldReversed: argv.includes('--infield-dirt') ? false : INFIELD_REVERSED_DEFAULT,
    // ★Web 画面と同じ分岐（page.tsx: shot.view === 'side' ? undefined : texturedWorld）
    texturedWorld: scene.shot.view === 'side' ? undefined : texturedWorld,
    /**
     * ★横視点は**画面と同じパララックス**（1 枚絵ではない）。
     *   縦の枠取り・ズーム・流す距離も `page.tsx` と同じ値にすること。
     */
    parallaxPlate: scene.shot.view === 'side'
      ? { plate: parallaxBackstretch, zoom: 1.14, verticalAnchor: 1.0, scrollM: scene.focusS }
      : undefined,
    // ★発走 90m までは開いた発馬機が後ろに残る（本番と同じ条件）
    worldBillboards: lead < 90 ? [{
      image: gateOpen.image, width: gateOpen.image.width, height: gateOpen.image.height,
      source: gateOpen.source, worldS: 1.6, worldW: 0.5, widthM: 14.8, zOrder: 'behind',
      /** ★番号の描き直しも画面と同じにする（R-30: 測定器が画面と違う画を見ない） */
      stallLabels: { ...GATE_FRONT_STALL_PLATES, font: FONT, plateColor: '#f2f2ee', textColor: '#14181a' },
    }] : undefined,
  });
  /**
   * ★**参考映像の HUD 3 点**（設計 1-4 / 1-5 / 1-6）も描く。
   *
   * ⚠️ ★これらは `apps/web/src/app/race/page.tsx` でも同じ関数を呼びます。
   *    **呼び方（座標・渡す行）をここと画面で違えないこと。** 違えたらこの道具は
   *    「オーナーと別の画」を出します（R-30。この案件で 3 回起きています）。
   *    自馬は画面と同じ 4 番、名前は同じ配列から引いています。
   */
  const NAMES = ['スターライト', 'サクラブリーズ', 'ハンシンドリーム', 'ミライノツバサ', 'グリーンアロー', 'オウカノキセキ',
    'ナニワスピリット', 'ローズクイーン', 'ムラサキノホシ', 'アオバハヤテ', 'ブラウンエース', 'ピンクレディ'];
  const ranked = [...horses].sort((a, b) => b.s - a.s);
  drawFormationBar(ctx, palette, FONT, horses.map((h) => ({ gate: h.gate, s: h.s })), FIELD, frameRoleOf,
    { x: 40, y: 4, width: W - 80, ownGate: OWN_GATE, timeSec: displaySec, sinceSec: 9 });
  const plateRows = referenceNamePlateRows(ranked, OWN_GATE, (gate) => NAMES[gate - 1]);
  // ★置き場所は画面（`page.tsx`）と同じ値にすること。違えるとここだけ別の配置になる（R-30）
  drawHorseNamePlates(ctx, palette, FONT, plateRows, FIELD, frameRoleOf, {
    viewport: { width: W, height: H }, x0: 330, x1: W - 24, bottomY: H - 176,
    timeSec: displaySec, sinceSec: 9,
  });
  {
    const own = horses.find((h) => h.gate === OWN_GATE);
    if (own !== undefined) {
      const basis2 = cameraBasis(scene.camera);
      const g = posOf(course, Math.max(0, own.s), own.w);
      const headPoint = project(scene.camera, basis2, { x: g.x, y: g.y, z: HORSE_HEIGHT_M });
      if (headPoint.depth > 2) {
        drawOwnHorseMarker(ctx, FONT, { x: headPoint.x, y: headPoint.y }, OWN_GATE,
          { topLimitY: 40, viewport: { width: W, height: H }, timeSec: displaySec, sinceSec: 9 });
      }
    }
  }
  /**
   * ★**画面に占める芝の緑の割合**（報告①の指標）
   *
   *   `REPORT_P4_REFERENCE4_20260822.md` の実測: 参考 平均 **約 20%** ／ 我々 **約 60%**（3 倍）。
   *   ★判定式は報告と**同じ**にすること: `g > r*1.05 && g > b*1.05 && g > 40`、上下 10% を除く。
   *   ⚠️ ここで式を変えると、報告の数字と比べられなくなります（R-30）。
   */
  const greenPct = (() => {
    const y0 = Math.floor(H * 0.1), y1 = Math.floor(H * 0.9);
    const px = ctx.getImageData(0, y0, W, y1 - y0).data;
    let green = 0, total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (g > r * 1.05 && g > b * 1.05 && g > 40) green += 1;
      total += 1;
    }
    return total === 0 ? 0 : (100 * green) / total;
  })();
  {
    const g = posOf(course, horses[0].s, horses[0].w);
    const q = project(scene.camera, cameraBasis(scene.camera), { x: g.x, y: g.y, z: 0 });
    const v = speedMpsOf(horses[0].gate);
    console.log(`   [blur] 速度 ${v.toFixed(1)}m/s  px/m ${q.pxPerM.toFixed(1)}  露光 1/${(1/exposureSec).toFixed(0)}s  尾 ${(v * exposureSec * q.pxPerM).toFixed(1)}px`);
  }
  const m = measureShot(course, scene.camera, horses, W, H);
  ctx.fillStyle = 'rgba(5,10,8,0.84)'; ctx.fillRect(18, 18, 700, 58);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${displaySec}s / ${scene.shot.id} / 馬 ${m.medianPx.toFixed(0)}px(${(m.ratio * 100).toFixed(0)}%) / 画面内 ${m.inside}/${m.total} / 横 ${spread.toFixed(1)}m`, 34, 52);
  const file = path.join(OUT, `${String(index + 1).padStart(2, '0')}-${displaySec}s-${scene.shot.id}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  files.push(file);
  console.log(`${String(displaySec).padStart(7)}${lead.toFixed(0).padStart(8)}   ${scene.shot.id.padEnd(20)}${spread.toFixed(2).padStart(6)}${(m.medianPx.toFixed(0) + 'px').padStart(9)}${((m.ratio * 100).toFixed(1) + '%').padStart(8)}${(m.inside + '/' + m.total).padStart(8)}${(greenPct.toFixed(1) + '%').padStart(9)}`);
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
