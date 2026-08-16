/**
 * ★**据えたカメラ1台で、競馬場を透視投影で描く**（参考に寄せる第1歩）
 *
 * 【★これまでとの違い】
 *   ・平行投影 → ★**透視投影**（ラチが遠近で収束する）
 *   ・カメラが馬群と一緒に回る → ★**据える**（走路が画面を斜めに横切る）
 *   ・内馬場で世界が終わる → ★**反対側の走路とスタンドまで描く**
 *   ・足元の小さな楕円 → ★**長く伸びる影**
 *
 * ⚠️ ★背景と馬を**同じ投影**で描きます。生成画を背景にすると
 *    カメラの諸元が分からず、**馬を走路の上に置けません**。
 *
 * 実行: npx tsx tools/shot-perspective.mjs [--distance 1600] [--seed 42] [--at 0.985]
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches, laneAt,
} from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, ovalCourse, posOf, frameRoleOf,
  timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec,
  cameraBasis, project, horizonY,
} from '@star/render';

const W = 1280, H = 720;
const OUT = path.resolve('out/persp');
const pal = JSON.parse(readFileSync('apps/web/public/art/palette.json', 'utf8'));
const POOL = JSON.parse(readFileSync('apps/web/src/lib/watch-pool.json', 'utf8'));
const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
const DIST = num('--distance', 1600);
const SEED = num('--seed', 42);
const AT = num('--at', 0.985);
const FIELD = 12;
const STRATS = ['nige', 'senko', 'sashi', 'oikomi'];
const COURSE = ovalCourse(DIST);

const JP = ['C:/Windows/Fonts/NotoSansJP-VF.ttf', 'C:/Windows/Fonts/meiryo.ttc']
  .find((f) => existsSync(f));
if (JP !== undefined) GlobalFonts.registerFromPath(JP, 'STARJP');
const FONT = (px, bold = false) => `${bold ? 'bold ' : ''}${px}px STARJP, sans-serif`;

/* ── 本番と同じ経路 ─────────────────────────── */
const start = (SEED * 13) % Math.max(1, POOL.length - FIELD);
const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
  horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
  distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
  strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
  strategy: STRATS[(i + SEED) % 4], condition: 3, fatigue: 20,
  weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
}));
const conditions = {
  raceId: `p${SEED}`, distance: DIST, surface: 'turf',
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const result = resolveRace({ conditions, entrants, seed: SEED, balance: DEFAULT_RACE_BALANCE });
const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
const boundaries = replayOf(result, (g) => entrants[g - 1].strategy, pace);
if (!finalOrderMatches(result, boundaries)) throw new Error('★D-059: 着順が違います');
const model = replayPositionModel({
  distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  strategyOf: (g) => entrants[g - 1].strategy, pace, formationSeed: SEED * 2654435761,
  laneOf: (gate, metersLeft) => laneAt(gate, FIELD, metersLeft, DIST, SEED),
});
if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(result.order.map((e) => Number(e.horseId)))) {
  throw new Error('★D-059: 位置モデルの最終順が違います');
}
const knots = knotsFor(boundaries, 1);
const warp = timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));

/* ── カメラを据える ─────────────────────────── */
/**
 * ★**ゴール前の直線を、外（スタンド側）から見るカメラ。**
 *
 *   ⚠️ 数字は**参考の画から逆算**しています:
 *     ・走路が画面を**斜めに**横切る → 進行方向とカメラの向きに角度をつける
 *     ・**反対側の走路とスタンド**が見える → 高さを取り、やや水平寄りに見る
 *     ・地平線が画面の上 1/4 くらい → 俯角はきつくしない
 */
/**
 * ★**見る場所は馬群**にします。
 *   ⚠️ 固定の点を見ていたら、馬群が遠くに小さく写りました（画面幅の 2.7%）。
 *      参考は **9〜11%** です。
 */
const secPeek = warp.raceSecAt(warp.displaySec * AT);
const packS = model.at(secPeek).reduce((a, h) => a + h.meters, 0) / FIELD;
const LOOK_AT_S = Math.max(20, Math.min(DIST - 5, packS));
const centre = posOf(COURSE, LOOK_AT_S, COURSE.widthM / 2);
const ahead = posOf(COURSE, LOOK_AT_S + 20, COURSE.widthM / 2);
const dirX = ahead.x - centre.x, dirY = ahead.y - centre.y;
const dl = Math.hypot(dirX, dirY) || 1;
const fx = dirX / dl, fy = dirY / dl;          // 進行方向
const nx = -fy, ny = fx;                        // 進行方向の左手

/** ★外ラチ側がどちらかは**コースに聞く**（回り方向で左右が入れ替わる） */
const inner = posOf(COURSE, LOOK_AT_S, 0);
const outer = posOf(COURSE, LOOK_AT_S, COURSE.widthM);
const outSign = ((outer.x - inner.x) * nx + (outer.y - inner.y) * ny) >= 0 ? 1 : -1;

/**
 * ★**深さから決めます。** 馬の幅を画面幅の 10% にしたいので:
 *   馬の高さ 2.5m × pxPerM × (コマ幅/コマ高) = 128px → pxPerM ≒ 37 → 深さ ≒ 32m
 *   ⚠️ ここを目分量で置いたら 2.7% になりました。**逆算します。**
 */
const CAM_OUT_M = num('--cam-out', 24);      // 走路の外へ何 m
const CAM_UP_M = num('--cam-up', 9);         // 高さ
const CAM_BACK_M = num('--cam-back', 18);    // 後ろへ（斜めに見るため）
const cam = {
  eye: {
    x: centre.x + nx * outSign * CAM_OUT_M - fx * CAM_BACK_M,
    y: centre.y + ny * outSign * CAM_OUT_M - fy * CAM_BACK_M,
    z: CAM_UP_M,
  },
  /**
   * ★**見る高さ**。⚠️ 地面（z=1.6）を見ていたら、
   *    カメラが下を向きすぎて★**地平線が画面の外（y=-9）**に出ました。
   *    スタンドも空も見えません。参考は地平線が画面の上 1/4 あたりです。
   * → 少し上を見て、カメラを起こします。
   */
  target: { x: centre.x, y: centre.y, z: num('--look-up', 5.2) },
  fovY: (num('--fov', 34) * Math.PI) / 180,
  width: W, height: H,
};
const basis = cameraBasis(cam);
const hz = horizonY(cam, basis);

const P = (s, w, z = 0) => {
  const p = posOf(COURSE, s, w);
  return project(cam, basis, { x: p.x, y: p.y, z });
};

/* ── 背景 ───────────────────────────────── */
function sky(ctx) {
  const top = Math.max(0, Math.round(hz));
  for (let y = 0; y < top; y += 1) {
    const t = y / Math.max(1, top - 1);
    ctx.fillStyle = pal[t < 0.4 ? 'sky-0' : t < 0.75 ? 'sky-1' : 'sky-2'];
    ctx.fillRect(0, y, W, 1);
  }
}

/**
 * ★走路の面を、**遠近で収束する四角形の帯**として塗る。
 *   ⚠️ 平行な帯ではありません。`s` を細かく刻んで台形を並べます。
 */
function band(ctx, w0, w1, color, fromS, toS, step = 8) {
  ctx.fillStyle = color;
  for (let s = fromS; s < toS; s += step) {
    const s2 = Math.min(s + step, toS);
    const a = P(s, w0), b = P(s2, w0), c = P(s2, w1), d = P(s, w1);
    if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** ★ラチ（一定の `w` の線）。柱も立てる — **速度感は柱の間隔から出ます** */
function rail(ctx, w, color, postEveryM, postH) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (let s = -300; s <= DIST + 300; s += 6) {
    const p = P(s, w, postH * 0.55);
    if (p.depth <= 1) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  if (postEveryM > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let s = Math.floor(-300 / postEveryM) * postEveryM; s <= DIST + 300; s += postEveryM) {
      const a = P(s, w, 0), b = P(s, w, postH);
      if (a.depth <= 1) continue;
      if (a.x < -40 || a.x > W + 40) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
}

/**
 * ★**反対側の走路まで描く。**
 *   ⚠️ 参考には内馬場の向こうに**もう一本の走路とラチ**が写っています。
 *      こちらは内馬場で世界が終わっていました。それが「奥行きが無い」の正体です。
 */
function world(ctx) {
  const WD = COURSE.widthM;
  const FAR = DIST + 400, NEAR = -400;
  sky(ctx);
  // 遠景（スタンド）を地平線の上に
  ctx.fillStyle = pal['stand-1'];
  ctx.fillRect(0, Math.round(hz) - 54, W, 54);
  ctx.fillStyle = pal['stand-0'];
  ctx.fillRect(0, Math.round(hz) - 54, W, 5);
  for (let x = 0; x < W; x += 3) {
    for (let y = Math.round(hz) - 46; y < Math.round(hz) - 8; y += 3) {
      ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5 ? pal['crowd-0'] : pal['crowd-2'];
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // ★反対側（内馬場の向こう）— 内ラチより内側を、遠くまで
  band(ctx, -260, -120, pal['turf-1'], NEAR, FAR, 20);   // 反対側の走路と、その外
  rail(ctx, -120, pal['rail-1'], 0, 1.2);
  band(ctx, -120, -14, pal['hedge-1'], NEAR, FAR, 16);   // 内馬場
  band(ctx, -14, -1.5, pal['dirt-2'], NEAR, FAR, 10);    // ダート
  rail(ctx, -1.5, pal['dirt-3'], 0, 1.0);
  // ★芝コース
  band(ctx, 0, WD, pal['turf-3'], NEAR, FAR, 6);
  // 芝の刈り目（走路を横切る帯）
  const STRIPE = 22;
  ctx.globalAlpha = 0.55;
  for (let s = Math.floor(NEAR / (STRIPE * 2)) * STRIPE * 2; s < FAR; s += STRIPE * 2) {
    band(ctx, 0, WD, pal['turf-2'], s, s + STRIPE, 6);
  }
  ctx.globalAlpha = 1;
  /**
   * ⚠️ ★外側を 26m しか塗っておらず、**画面の隅に白い抜け**が出ていました。
   *    手前は近いので、少しの外側でも画面を大きく占めます。
   */
  band(ctx, WD, WD + 160, pal['turf-4'], NEAR, FAR, 10);
  rail(ctx, 0, pal['rail-0'], 8, 1.3);
  rail(ctx, WD, pal['rail-1'], 8, 1.4);
}

/** ★決勝線 */
function finishLine(ctx) {
  const a = P(DIST, 0), b = P(DIST, COURSE.widthM);
  if (a.depth <= 1 || b.depth <= 1) return;
  ctx.strokeStyle = pal['paper-0'];
  ctx.lineWidth = Math.max(2, a.pxPerM * 0.5);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

/* ── 馬 ─────────────────────────────────── */
const SHEET = { frames: 8, cellH: 209 };
const HORSE_H_M = 2.5;   // ★馬＋騎手のおよその高さ

async function main() {
  mkdirSync(OUT, { recursive: true });
  const img = await loadImage(path.resolve('apps/web/public/art/horse-oblique-v2.png'));
  const cw = img.width / SHEET.frames;

  const sec = warp.raceSecAt(warp.displaySec * AT);
  const at = model.at(sec);

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;   // ★遠近で滑らかに縮む。整数倍はもうやりません
  world(ctx);
  finishLine(ctx);

  /**
   * ★**奥から手前へ**描く（深さの大きい順）。手前の馬が奥を隠します。
   */
  const drawn = at.map((h) => {
    const s = Math.max(0, Math.min(DIST, h.meters));
    const w = h.w ?? COURSE.widthM / 2;
    return { h, s, w, p: P(s, w) };
  }).filter((d) => d.p.depth > 2).sort((a, b) => b.p.depth - a.p.depth);

  for (const d of drawn) {
    const px = d.p.pxPerM;
    const hpx = HORSE_H_M * px;                      // ★高さから大きさを決める
    const wpx = hpx * (cw / SHEET.cellH);
    const frame = Math.floor(sec * 16 + d.h.gate * 0.37 * 8) % 8;
    const row = Math.max(0, Math.min(7, Number(frameRoleOf(d.h.gate, FIELD).slice(6)) - 1));

    /**
     * ★**長く伸びる影**。⚠️ 参考の接地感はほぼこれが作っています。
     *   足元の小さな楕円では、馬が芝に貼った絵に見えます。
     */
    const sunX = -0.75, sunY = 0.25;                 // 光の向き（夕方・低い）
    const tip = P(d.s + sunY * HORSE_H_M * 2.2, d.w + sunX * HORSE_H_M * 2.2);
    if (tip.depth > 2) {
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#0d1408';
      ctx.beginPath();
      ctx.ellipse((d.p.x + tip.x) / 2, (d.p.y + tip.y) / 2,
        Math.hypot(tip.x - d.p.x, tip.y - d.p.y) / 2 + wpx * 0.18, Math.max(2, hpx * 0.055),
        Math.atan2(tip.y - d.p.y, tip.x - d.p.x), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.drawImage(img, frame * cw, row * SHEET.cellH, cw, SHEET.cellH,
      d.p.x - wpx * 0.5, d.p.y - hpx, wpx, hpx);
  }

  /**
   * ★**色調**。⚠️ 参考は夕方の光で、緑が深く、馬が背景に溶けています。
   *    こちらは彩度が高く、★**馬だけが浮いて見えて**いました。
   *    → 全体の彩度を落とし、暗いオリーブへ寄せます。
   *    ★絵を描き直すのではなく、**光を変える**という考え方です。
   */
  {
    const im = ctx.getImageData(0, 0, W, H);
    const d2 = im.data;
    const SAT = num('--sat', 0.74);          // 彩度をどれだけ残すか
    const GAIN = num('--gain', 0.86);        // 全体の明るさ
    const TINT = [0.98, 1.0, 0.92];          // わずかに緑〜黄へ
    for (let i = 0; i < d2.length; i += 4) {
      const l = (d2[i] * 0.299 + d2[i + 1] * 0.587 + d2[i + 2] * 0.114);
      for (let c = 0; c < 3; c += 1) {
        const v = (l + (d2[i + c] - l) * SAT) * GAIN * TINT[c];
        d2[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    ctx.putImageData(im, 0, 0);
  }

  writeFileSync(path.join(OUT, 'goal.png'), cv.toBuffer('image/png'));
  console.log('# ★透視投影・据えたカメラ');
  console.log(`  地平線 y = ${hz.toFixed(0)}（画面の ${(hz / H * 100).toFixed(0)}%）`);
  console.log(`  カメラ 外へ ${CAM_OUT_M}m / 高さ ${CAM_UP_M}m / 後ろへ ${CAM_BACK_M}m / 画角 ${(cam.fovY * 180 / Math.PI).toFixed(0)}°`);
  const sizes = drawn.map((d) => (HORSE_H_M * d.p.pxPerM * (cw / SHEET.cellH)));
  console.log(`  馬の幅 ${Math.min(...sizes).toFixed(0)} 〜 ${Math.max(...sizes).toFixed(0)}px`
    + `（画面幅の ${(Math.min(...sizes) / W * 100).toFixed(1)}〜${(Math.max(...sizes) / W * 100).toFixed(1)}%）`);
  console.log(`  写っている馬 ${drawn.length}/${FIELD}`);
  console.log(`\n★${path.join(OUT, 'goal.png')}`);
}
main().catch((e) => { console.error('★落ちました:', e); process.exit(1); });
