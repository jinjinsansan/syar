/**
 * ★動くレース画面を作る（P4 / オーナーの「面白いか」判定の材料）
 *
 * 【何をするか】
 *   1. **本番と同じエンジン**で1レース走らせる（`resolveRace`）
 *   2. ★**着順から境界時刻を出す**（D-059・脚質とペースを反映）
 *   3. 位置モデルで各フレームの位置を出し、スプライトを並べて GIF にする
 *
 * 【★確かめること】
 *   ★**GIF の最終フレームの並びが、エンジンの着順と一致すること**（D-059 のゲート）。
 *     ここがずれたら「映像と結果が別物」で、いちばんやってはいけない状態です。
 *
 * 実行: node tools/render-race.mjs [--seed 42] [--fps 12] [--zoom 1]
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches } from '@star/race-engine';
import {
  replayPositionModel, sceneAt, finalOrderOf, cameraFor,
  timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
} from '@star/render';
import { loadFrames, dressed, POST, isDark } from './lib/dress.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const SEED = arg('seed', 42);
const FPS = arg('fps', 12);
const OWN = arg('own', 3);
const SHEET = 'design/art/assets/horse-gallop-cloth2-sheet.png';
const DIST = 1600;
const FIELD = 12;   // ★18頭は画面に入らないので（実測: 720p/220px = 3段）

const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];

/**
 * --- 出走馬 ---
 *
 * ★**本番の実分布から取ります**（`docs/pool-staging.json`）。
 *
 * ⚠️ 最初は能力を適当に散らした合成馬（SP 66〜86）を使い、
 *    **1着と最下位の差が 35.7秒**になりました（実際の1600m は 3〜5秒）。
 *    → **馬群が 359m に広がり、同じ画面に映らなくなりました。**
 *    ★エンジンの不具合ではなく、**私が試験用の馬を作り間違えていた**だけです。
 *    実際の出走表は**同クラスで揃います**（§10.4 のクラス分け）。
 */
const pool = JSON.parse(readFileSync('docs/pool-staging.json', 'utf8'));
const poolArr = Array.isArray(pool) ? pool : (pool.horses ?? []);
// ★同クラス相当＝能力上位から連続で取る（クラス分けの近似）
const picked = [...poolArr]
  .filter((h) => h.stats && Number.isFinite(h.stats.sp))
  .sort((a, b) => b.stats.sp - a.stats.sp)
  .slice(0, FIELD);
const entrants = picked.map((h, i) => ({
  horseId: String(i + 1),
  stats: h.stats,
  surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter,
  distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude,
  heavyAptitude: h.heavyAptitude,
  strategy: STRATS[i % 4],
  condition: 3, fatigue: 20, weightKg: 55, gate: i + 1, age: 4,
  skillGenes: h.skillGenes ?? [],
}));

const conditions = {
  raceId: 'demo', distance: DIST, surface: 'turf', trackCondition: 'good',
  courseShape: 'oval', baseWeightKg: 55,
};

// --- ① 本番と同じエンジンで走らせる ---
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace, nigeCount } = paceOf(entrants, DEFAULT_RACE_BALANCE);
console.log(`  レース: ${FIELD}頭 / ${DIST}m / ペース ${pace}（逃げ ${nigeCount}頭）/ seed ${SEED}`);
console.log(`  着順: ${result.order.map((e) => e.horseId).join(' → ')}`);

// --- ② 境界時刻（D-059）---
const strategyOf = (g) => entrants[g - 1].strategy;
const boundaries = replayOf(result, strategyOf, pace);
if (!finalOrderMatches(result, boundaries)) {
  throw new Error('★境界時刻から出る最終順が着順と違います（D-059 のゲート）');
}

// --- ③ 位置モデル ---
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  // ★D-061 改訂: 別ストリームの揺らぎ（着順は動かない）
  jostle: arg('jostle', 0.6), jostleSeed: SEED * 2654435761,
});
const orderFromModel = finalOrderOf(model);
const settled = result.order.map((e) => Number(e.horseId));
if (JSON.stringify(orderFromModel) !== JSON.stringify(settled)) {
  throw new Error(`★位置モデルの最終順が着順と違います\n  モデル: ${orderFromModel}\n  着順  : ${settled}`);
}
console.log('  ✓ D-059 のゲート: 位置モデルの最終順 == 着順');

// --- スプライトの用意（★塗りは tools/lib/dress.mjs に1か所化）---
const frames = await loadFrames(SHEET);

/**
 * ★層ごとの模様（1枚ぶん）。**縦の要素は最小限**（アートバイブル §3）。
 *   空 … ほぼ無地に薄い雲 / スタンド … 観客の粒 / ラチ … 支柱 / 芝 … 縞
 */
const tileCache = new Map();
async function tileOf(role, w, h, base) {
  const key = `${role}-${w}-${h}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const buf = Buffer.alloc(w * h * 3);
  const put = (x, y, c) => { const i = (y * w + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; };
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) put(x, y, base);
  const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  if (role === 'sky') {
    // 薄い雲（横に伸びた帯）
    for (let y = Math.floor(h * 0.35); y < Math.floor(h * 0.45); y += 1)
      for (let x = 0; x < w; x += 1) if (((x * 7 + y * 13) % 97) < 40) put(x, y, shade(base, 1.06));
  } else if (role === 'stand') {
    // 観客の粒（★色は使わない。スタンドは奥なので彩度を上げない）
    for (let y = 2; y < h - 2; y += 3)
      for (let x = 1; x < w; x += 4) put(x, y, shade(base, ((x + y) % 7 < 3) ? 1.35 : 0.75));
  } else if (role === 'rail') {
    // 支柱（★縦の要素はここだけ）
    for (let y = 0; y < h; y += 1) for (let x = 0; x < 3; x += 1) put(x, y, shade(base, 0.55));
  } else if (role === 'turf') {
    // 芝の刈り目（横縞）
    for (let y = 0; y < h; y += 1) {
      const k = (Math.floor(y / 26) % 2 === 0) ? 1.0 : 0.93;
      for (let x = 0; x < w; x += 1) put(x, y, shade(base, k * (((x + y) % 11 === 0) ? 1.05 : 1)));
    }
  }
  const png = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  tileCache.set(key, png);
  return png;
}

// --- ④ フレームを描く（★描画コマンドは packages/render が作る）---
const SW = 1280, SH = 720;
const WORK = join(tmpdir(), 'star-race-frames');
mkdirSync(WORK, { recursive: true });

/**
 * ★**段は上位が決めます**（`laneOf`）。馬番をそのまま縦位置にすると
 *   12頭で12段になり画面外に出ます。実測どおり 720p/220px は3段です。
 */
const LANES = 3;
const sceneInput = {
  model,
  viewport: { width: SW, height: SH, trackTop: 340, laneHeight: 105 },
  laneOf: (gate) => (gate - 1) % LANES,
  // ★カメラはフレームごとに決めます（下で差し替え）
  ownGate: OWN,
  // ★段番号 → 元の馬番。丸めた番号で勝負服を選ぶと、色が3種類しか出ません
  silkOf: (gate) => `silk-${gate}`,
  gallopFrames: 6,
  // ★V-16 ①: 展開を画面に出す
  strategyOf: (gate) => entrants[gate - 1].strategy,
  pace,
};

/**
 * ★**時間配分**（D-062）。道中は速く送り、直線は引き伸ばす。
 *   ⚠️ 着順にも境界にも触れません。**表示の時計を読み替えるだけ**です。
 */
const warp = timeWarpFor(knotsFor(boundaries, OWN), DEFAULT_PHASE_RATES);
console.log(`  ✓ 時間配分: ${model.raceSec.toFixed(1)}秒 → 表示 ${warp.displaySec.toFixed(1)}秒`
  + `（道中 ${DEFAULT_PHASE_RATES.cruise}倍速 / 直線 ${DEFAULT_PHASE_RATES.straight}倍）`);

const total = Math.ceil(warp.displaySec * FPS);
const STEP = Math.max(1, Math.round(total / 60));   // ★60枚程度に間引く（GIF の大きさ）
const paths = [];
for (let i = 0, n = 0; i <= total; i += STEP, n += 1) {
  /**
   * ★**カメラは自馬の残り距離で決まります**（アートバイブル §9）。
   *   時刻ではありません — 遅い馬と速い馬で、同じ時刻でも局面が違います。
   */
  // ★表示の時計 → レースの時計（D-062）
  const sec = warp.raceSecAt(i / FPS);
  const own = model.at(sec).find((h) => h.gate === OWN);
  const metersLeft = own === undefined ? DIST : DIST - own.meters;
  const frame = sceneAt({ ...sceneInput, camera: cameraFor(metersLeft, OWN) }, sec);
  const tiles = [];
  for (const c of frame.commands) {
    if (c.kind === 'parallax') {
      /**
       * ★層の模様を敷き詰める。**速度差だけで奥行きを作る**（アートバイブル §3）。
       *   ⚠️ 線遠近を描き込みません。縦の要素は最小限です。
       */
      const top = Math.max(0, Math.min(SH - 1, c.y));
      const h = Math.max(1, Math.min(c.height, SH - top));
      const base = { sky: [120, 135, 150], stand: [70, 62, 58], rail: [190, 185, 175], turf: [58, 78, 48] }[c.role] ?? [40, 40, 40];
      const tile = await tileOf(c.role, c.tileWidth, h, base);
      const off = c.offset % c.tileWidth;
      for (let x = -off; x < SW; x += c.tileWidth) {
        const left = Math.round(x);
        if (left + c.tileWidth <= 0) continue;
        // ★左右にはみ出す分は切って敷く（sharp は画面外を許さない）
        const cutL = left < 0 ? -left : 0;
        const w = Math.min(c.tileWidth - cutL, SW - Math.max(0, left));
        if (w <= 0) continue;
        const piece = cutL > 0 || w < c.tileWidth
          ? await sharp(tile).extract({ left: cutL, top: 0, width: w, height: h }).png().toBuffer()
          : tile;
        tiles.push({ input: piece, left: Math.max(0, left), top });
      }
    } else if (c.kind === 'band') {
      const col = { sky: [120, 135, 150], stand: [70, 62, 58], rail: [190, 185, 175], turf: [58, 78, 48] }[c.role] ?? [40, 40, 40];
      // ★帯も画面に収める。y+height が画面を超えると sharp が落ちる
      const top = Math.max(0, Math.min(SH - 1, c.y));
      const h = Math.max(1, Math.min(c.height, SH - top));
      tiles.push({ input: { create: { width: SW, height: h, channels: 3, background: { r: col[0], g: col[1], b: col[2] } } }, left: 0, top });
    } else if (c.kind === 'sprite') {
      // ★`silk` には丸めた段番号ではなく**元の馬番**が入るようにしてある
      const gate = Number(String(c.silk).replace('silk-', ''));
      const x = Math.round(c.at.x), y = Math.round(c.at.y);
      /**
       * ★**画面からはみ出るものは描きません。**
       *   sharp は「合成する画像は元より大きくてはいけない」ので、
       *   負の座標や右端超えを渡すと落ちます（実際に落ちました）。
       *   ⚠️ ここで**切り取って描く**こともできますが、
       *      **描画コマンドの意味を変える**ので、この層では捨てるだけにします。
       */
      // ★合成できる位置か（sharp は元より大きい合成を許さない）
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // ★描画コマンドが持つ倍率で描く（レンダラはカメラを知らない）
      const sc = c.scale ?? 1;
      const w = 220 * sc, hh = 140 * sc;
      if (x < 0 || y < 0 || x + w > SW || y + hh > SH) continue;
      const img = sc === 1
        ? await dressed(frames, c.sprite.frame, gate)
        : await sharp(await dressed(frames, c.sprite.frame, gate)).resize(w, hh, { kernel: 'nearest' }).png().toBuffer();
      tiles.push({ input: img, left: x, top: y });
    }
  }
  const p = join(WORK, `f${String(n).padStart(3, '0')}.png`);
  /**
   * ★**`composite` の後に `resize` を繋いではいけません。**
   *   sharp は**先に縮小してから合成**するので、1280幅のタイルが
   *   640幅の画像に載らず `Image to composite must have same dimensions or smaller` で落ちます。
   *   ★タイルの座標を何度見直しても直りませんでした（16枚すべて画面内だった）。
   *     **合成を確定させてから、別の処理として縮小します。**
   */
  const composed = await sharp({ create: { width: SW, height: SH, channels: 3, background: { r: 58, g: 78, b: 48 } } })
    .composite(tiles).png().toBuffer();
  await sharp(composed).resize(640, 360, { kernel: 'nearest' })
    .png({ palette: true, colours: 64 }).toFile(p);
  paths.push(p);
}
console.log(`  フレーム ${paths.length} 枚（${(model.raceSec).toFixed(1)}秒のレースを間引き）`);
console.log(paths.join('\n'));
