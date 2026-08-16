/**
 * ★**透視投影で競馬場を描く**（据えたカメラ／参考を手本にした作り）
 *
 * 【★なぜ package に置くか】
 *   ⚠️ この案件で繰り返し踏んだのは「**2か所で持てば必ず離れる**」です。
 *      動画の道具と Web の画面が別々に描いたら、必ず離れます。
 *   → ★**ここが唯一の描き方**です。
 *
 * 【★この層が持たないもの】
 *   ・**色調の補正**: ブラウザは CSS の `filter`、道具は画素の走査、と手段が違います。
 *     ⚠️ `getImageData` を `Ctx2D` に足すと、使える環境が狭まります。
 *   ・**UI**: `oblique-ui` と同じ扱い（画面の座標系のもの）。
 */

import { posOf, segmentAt, type Course } from './course.js';
import {
  cameraBasis, project, horizonY,
  type PerspectiveCamera,
} from './perspective.js';
import type { Ctx2D, Palette } from './oblique-draw.js';
import type { SheetSpec } from './oblique-draw.js';
import type { ShotCameraPreset, ShotView } from './shot-sequence.js';

/** 1頭ぶん（★位置は `PositionModel` が持つ。ここは受け取るだけ） */
export interface PerspHorse {
  readonly gate: number;
  /** コース上の距離 m */
  readonly s: number;
  /** 内ラチからの距離 m（★エンジンが引いた `w`。D-071） */
  readonly w: number;
}

/**
 * ★**カメラを走路に据える。**
 *
 *   ⚠️ 位置を目分量で決めたら、★**馬が画面幅の 2.7%**（参考は 9〜11%）になりました。
 *      → **深さから逆算**します: 馬の高さ 2.5m が目標の px になる深さ。
 *
 *   ★外側がどちらかは**コースに聞きます**（右回り左回りで左右が入れ替わる）。
 */
export function trackCamera(
  course: Course,
  opts: {
    /** 見るコース上の位置（m） */
    readonly atS: number;
    readonly width: number;
    readonly height: number;
    /** 走路の外へ何 m */
    readonly outM?: number | undefined;
    /** 高さ m */
    readonly upM?: number | undefined;
    /** 後ろへ何 m（斜めに見るため） */
    readonly backM?: number | undefined;
    /** 縦の画角（度） */
    readonly fovDeg?: number | undefined;
    /**
     * ★見る高さ m。
     * ⚠️ 地面（1.6m）を見るとカメラが下を向きすぎ、**地平線が画面の外**へ出ます。
     */
    readonly lookUpM?: number | undefined;
  },
): PerspectiveCamera {
  const c = posOf(course, opts.atS, course.widthM / 2);
  const a = posOf(course, opts.atS + 20, course.widthM / 2);
  const dl = Math.hypot(a.x - c.x, a.y - c.y) || 1;
  const fx = (a.x - c.x) / dl, fy = (a.y - c.y) / dl;
  const nx = -fy, ny = fx;
  const inner = posOf(course, opts.atS, 0);
  const outer = posOf(course, opts.atS, course.widthM);
  const sign = ((outer.x - inner.x) * nx + (outer.y - inner.y) * ny) >= 0 ? 1 : -1;
  const out = opts.outM ?? 24, up = opts.upM ?? 9, back = opts.backM ?? 18;
  return {
    eye: {
      x: c.x + nx * sign * out - fx * back,
      y: c.y + ny * sign * out - fy * back,
      z: up,
    },
    target: { x: c.x, y: c.y, z: opts.lookUpM ?? 5.2 },
    fovY: ((opts.fovDeg ?? 34) * Math.PI) / 180,
    width: opts.width,
    height: opts.height,
  };
}

/**
 * ★**馬群の後ろから、走路に沿って見るカメラ**（参考の主役の画）。
 *
 * ⚠️ ★最初は「中継カメラはスタンドから横を見る」と思い込み、
 *    走路の**横**に据えました。★**丸ごと外していました。**
 *    参考は3枚とも**馬群の後ろ**から見ており、
 *    ★**空もスタンドも写っていません**（走路で画面が埋まる）。
 *
 * 【★地平線を画面の外に出す条件】
 *   俯角 = atan(高さ ÷ 前方距離) が **画角の半分**を超えること。
 *   画角 34° なら 17° 超 → **高さ ÷ 前方距離 > 0.306**。
 *   ⚠️ ここを満たさないと、★**空が入って参考と別物になります**。
 */
export function chaseCamera(
  course: Course,
  opts: {
    /** 追う馬群のコース上の位置（m） */
    readonly atS: number;
    readonly width: number;
    readonly height: number;
    /** 後ろへ何 m */
    readonly backM?: number | undefined;
    /** 高さ m */
    readonly upM?: number | undefined;
    /** 走路の外へ何 m（★0 だと左右対称になって不自然） */
    readonly sideM?: number | undefined;
    readonly fovDeg?: number | undefined;
    /** 見る点の高さ m */
    readonly lookAtZ?: number | undefined;
  },
): PerspectiveCamera {
  const c = posOf(course, opts.atS, course.widthM / 2);
  const b = posOf(course, opts.atS - 20, course.widthM / 2);
  const dl = Math.hypot(c.x - b.x, c.y - b.y) || 1;
  const fx = (c.x - b.x) / dl, fy = (c.y - b.y) / dl;   // 進行方向
  const nx = -fy, ny = fx;
  const inner = posOf(course, opts.atS, 0);
  const outer = posOf(course, opts.atS, course.widthM);
  const sign = ((outer.x - inner.x) * nx + (outer.y - inner.y) * ny) >= 0 ? 1 : -1;
  const back = opts.backM ?? 38, up = opts.upM ?? 13, side = opts.sideM ?? 6;
  const fov = opts.fovDeg ?? 34;
  /**
   * ⚠️ ★俯角が画角の半分以下だと**空が入ります**。ここで気づけるように、
   *    満たしていなければ**投げます**（黙って別物の絵を出すより安全です）。
   */
  const tilt = (Math.atan(up / back) * 180) / Math.PI;
  if (tilt <= fov / 2) {
    throw new Error(
      `★俯角 ${tilt.toFixed(1)}° が画角の半分（${(fov / 2).toFixed(1)}°）以下です。`
      + '空が画面に入り、参考と別物になります。高さを上げるか、後ろを詰めてください',
    );
  }
  return {
    eye: {
      x: c.x - fx * back + nx * sign * side,
      y: c.y - fy * back + ny * sign * side,
      z: up,
    },
    target: { x: c.x, y: c.y, z: opts.lookAtZ ?? 0.8 },
    fovY: (fov * Math.PI) / 180,
    width: opts.width,
    height: opts.height,
  };
}

/**
 * ショット定義を実際のカメラ方位へ変換する。
 * `atS`は注視対象のコース位置であり、馬の位置や着順は変更しない。
 */
export function broadcastCamera(
  course: Course,
  opts: {
    readonly atS: number;
    readonly width: number;
    readonly height: number;
    readonly view: ShotView;
    readonly preset: ShotCameraPreset;
  },
): PerspectiveCamera {
  const c = posOf(course, opts.atS, course.widthM / 2);
  const a = posOf(course, opts.atS + 20, course.widthM / 2);
  const dl = Math.hypot(a.x - c.x, a.y - c.y) || 1;
  const fx = (a.x - c.x) / dl;
  const fy = (a.y - c.y) / dl;
  const nx = -fy;
  const ny = fx;
  const inner = posOf(course, opts.atS, 0);
  const outer = posOf(course, opts.atS, course.widthM);
  const outside = ((outer.x - inner.x) * nx + (outer.y - inner.y) * ny) >= 0 ? 1 : -1;
  const p = opts.preset;

  let along = -p.backM;
  let across = p.sideM * outside;
  if (opts.view === 'side') {
    along = -p.sideM * 0.25;
    across = p.backM * outside;
  } else if (opts.view === 'diag-front') {
    along = p.backM;
    across = p.sideM * outside;
  } else if (opts.view === 'high-diag') {
    along = -p.backM * 0.45;
    across = Math.max(p.sideM, p.backM * 0.55) * outside;
  } else if (opts.view === 'rear') {
    across = 0;
  }

  return {
    eye: {
      x: c.x + fx * along + nx * across,
      y: c.y + fy * along + ny * across,
      z: p.upM,
    },
    target: { x: c.x, y: c.y, z: 0.8 },
    fovY: (p.fovDeg * Math.PI) / 180,
    width: opts.width,
    height: opts.height,
  };
}

interface Ctx extends Ctx2D<never> {}

export type BroadcastEnvironment = 'gate' | 'backstretch' | 'corner' | 'homestretch';

/** 注視地点から背景の役割を決める。カメラ座標や時刻には依存しない。 */
export function broadcastEnvironmentAt(course: Course, focusS: number): BroadcastEnvironment {
  const label = segmentAt(course, focusS).label;
  if (label === '向正面') return 'backstretch';
  if (label.includes('角')) return 'corner';
  if (label === '直線') return 'homestretch';
  return 'gate';
}

/**
 * ★**世界を描く**（空・スタンド・反対側の走路・内馬場・ダート・芝・刈り目・ラチ）。
 *
 * ⚠️ ★**反対側の走路まで描きます。** 参考には内馬場の向こうに
 *    もう一本の走路とラチが写っています。内馬場で世界が終わっていたのが
 *    「奥行きが無い」の正体でした。
 */
export function drawPerspectiveWorld(
  ctx: Ctx,
  course: Course,
  cam: PerspectiveCamera,
  pal: Palette,
  distanceMeter: number,
  focusS: number = distanceMeter,
): void {
  const basis = cameraBasis(cam);
  const W = cam.width;
  const hz = horizonY(cam, basis);
  const P = (s: number, w: number, z = 0): ReturnType<typeof project> => {
    const p = posOf(course, s, w);
    return project(cam, basis, { x: p.x, y: p.y, z });
  };
  const environment = broadcastEnvironmentAt(course, focusS);

  // 投影帯の外側も競馬場の地表である。透明（Canvas/CSS次第では黒）を残さない。
  ctx.fillStyle = pal['turf-4'] ?? '#355a35';
  ctx.fillRect(0, 0, cam.width, cam.height);

  // 空
  const top = Math.max(0, Math.round(hz));
  for (let y = 0; y < top; y += 1) {
    const t = y / Math.max(1, top - 1);
    ctx.fillStyle = pal[t < 0.4 ? 'sky-0' : t < 0.75 ? 'sky-1' : 'sky-2'] ?? '#7d94a8';
    ctx.fillRect(0, y, W, 1);
  }
  // スタンド（★地平線の上）
  ctx.fillStyle = pal['stand-1'] ?? '#3b3f44';
  ctx.fillRect(0, Math.round(hz) - 54, W, 54);
  ctx.fillStyle = pal['stand-0'] ?? '#22262a';
  ctx.fillRect(0, Math.round(hz) - 54, W, 5);
  for (let x = 0; x < W; x += 3) {
    for (let y = Math.round(hz) - 46; y < Math.round(hz) - 8; y += 3) {
      ctx.fillStyle = ((x * 3 + y * 5) % 11) < 5
        ? (pal['crowd-0'] ?? '#9aa') : (pal['crowd-2'] ?? '#667');
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const NEAR = -400, FAR = distanceMeter + 400;
  /** ★遠近で収束する台形を並べて面を塗る（平行な帯ではありません） */
  const band = (w0: number, w1: number, color: string, step = 8): void => {
    ctx.fillStyle = color;
    for (let s = NEAR; s < FAR; s += step) {
      const s2 = Math.min(s + step, FAR);
      const a = P(s, w0), b = P(s2, w0), c = P(s2, w1), d = P(s, w1);
      if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
  };
  /** ★ラチ。上下2本の横木と柱で、一本線のデバッグ表示に見せない。 */
  const rail = (w: number, color: string, postEveryM: number, postH: number): void => {
    ctx.strokeStyle = color;
    for (const height of [postH * 0.48, postH * 0.88]) {
      ctx.lineWidth = height > postH * 0.6 ? 2.4 : 1.25;
      ctx.beginPath();
      let started = false;
      for (let s = NEAR; s <= FAR; s += 6) {
        const p = P(s, w, height);
        if (p.depth <= 1) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    if (postEveryM <= 0) return;
    ctx.lineWidth = 1;
    for (let s = Math.floor(NEAR / postEveryM) * postEveryM; s <= FAR; s += postEveryM) {
      const a = P(s, w, 0), b = P(s, w, postH);
      if (a.depth <= 1 || a.x < -40 || a.x > W + 40) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };

  const WD = course.widthM;
  band(-260, -120, pal['turf-1'] ?? '#2f5a38', 20);      // 反対側の走路とその外
  rail(-120, pal['rail-2'] ?? '#b3ad9a', 14, 1.15);
  band(-120, -5, pal['hedge-2'] ?? '#26381f', 16);        // 暗い樹林・内馬場
  band(-5, -1.5, pal['dirt-3'] ?? '#4f3a25', 8);          // 内ラチ沿いの細い管理路
  rail(-1.5, pal['dirt-3'] ?? '#8a6', 0, 1.0);
  band(0, WD, pal['turf-3'] ?? '#3f6b43', 6);            // 芝
  /**
   * ★芝の刈り目 — **走路を端から端まで横切る帯**。
   * ⚠️ 内外にも刻むと市松になります。斜めに見えるのは**投影の結果**です。
   */
  const STRIPE = 22;
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = pal['turf-2'] ?? '#4a7a4e';
  for (let s = Math.floor(NEAR / (STRIPE * 2)) * STRIPE * 2; s < FAR; s += STRIPE * 2) {
    for (let t = s; t < s + STRIPE; t += 6) {
      const t2 = Math.min(t + 6, s + STRIPE);
      const a = P(t, 0), b = P(t2, 0), c = P(t2, WD), d = P(t, WD);
      if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 進行方向に沿う芝の筋。規則的な大面積の市松模様を崩し、速度感を補う。
  ctx.strokeStyle = pal['turf-1'] ?? '#6d8c5b';
  ctx.globalAlpha = 0.13;
  ctx.lineWidth = 1;
  for (let lane = 1.5; lane < WD; lane += 2.6) {
    ctx.beginPath();
    let started = false;
    for (let s = NEAR; s <= FAR; s += 8) {
      const p = P(s, lane, 0.01);
      if (p.depth <= 1) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  band(WD, WD + 160, pal['turf-4'] ?? '#356', 10);       // ★外側（隅の抜けを塞ぐ）

  // 区間ごとの遠景建築。直線は観客席、向正面は低い設備棟、コーナーは樹林を主役にする。
  if (environment === 'homestretch' || environment === 'backstretch') {
    const buildingW = environment === 'homestretch' ? -42 : -36;
    const buildingH = environment === 'homestretch' ? 6.0 : 3.2;
    const moduleM = environment === 'homestretch' ? 28 : 42;
    const fromS = Math.max(-100, focusS - 190);
    const toS = Math.min(distanceMeter + 100, focusS + 190);
    for (let s = fromS; s < toS; s += moduleM) {
      const endS = Math.min(toS, s + moduleM + 0.5);
      const a = P(s, buildingW, 0), b = P(endS, buildingW, 0);
      const c = P(endS, buildingW, buildingH), d = P(s, buildingW, buildingH);
      if ([a, b, c, d].some((p) => p.depth <= 3)) continue;
      if (Math.max(a.x, b.x, c.x, d.x) < -40 || Math.min(a.x, b.x, c.x, d.x) > W + 40) continue;
      ctx.fillStyle = pal[environment === 'homestretch' ? 'stand-0' : 'backside-3'] ?? '#2a2e35';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
      const crowdTop = environment === 'homestretch' ? 0.28 : 0.12;
      ctx.fillStyle = pal[environment === 'homestretch' ? 'crowd-2' : 'backside-1'] ?? '#665f52';
      ctx.globalAlpha = environment === 'homestretch' ? 0.48 : 0.24;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + (a.y - d.y) * crowdTop);
      ctx.lineTo(c.x, c.y + (b.y - c.y) * crowdTop);
      ctx.lineTo(c.x, c.y + (b.y - c.y) * 0.62);
      ctx.lineTo(d.x, d.y + (a.y - d.y) * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (environment === 'homestretch') {
        ctx.strokeStyle = pal['stand-0'] ?? '#2a2e35'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
    }
  }

  /**
   * コースに固定された遠景。画面座標へ直接貼らず、馬と同じ透視投影を使う。
   * 木々は内馬場の奥、標識は内ラチ際、照明塔はさらに奥へ置く。
   */
  const scenery: Array<{ depth: number; draw: () => void }> = [];
  const treeStep = environment === 'corner' ? 13 : environment === 'gate' ? 18 : 26;
  for (let s = -200; s <= distanceMeter + 200; s += treeStep) {
    const base = P(s, -22, 0);
    const crown = P(s, -22, 3.5 + ((Math.abs(s) / treeStep) % 3) * 0.45);
    if (base.depth <= 2 || crown.depth <= 2 || base.x < -100 || base.x > W + 100) continue;
    const crownH = Math.max(2, base.y - crown.y);
    if (crownH > 42) continue; // 近景の巨大な円形樹冠は中継背景に使わない
    const crownW = crownH * (0.82 + ((Math.abs(s) / treeStep) % 4) * 0.07);
    scenery.push({ depth: base.depth, draw: () => {
      ctx.fillStyle = pal[((Math.abs(s) / treeStep) % 3) < 1 ? 'tree-2' : 'tree-3'] ?? '#26351f';
      for (const [ox, oy, rx, ry] of [
        [-0.26, 0.46, 0.34, 0.31], [0, 0.32, 0.42, 0.38], [0.28, 0.48, 0.32, 0.29],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(crown.x + crownW * ox, crown.y + crownH * oy,
          crownW * rx, crownH * ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } });
  }
  scenery.sort((a, b) => b.depth - a.depth).forEach((x) => x.draw());

  // 距離標識。固有ロゴや文字は使わず、白い屋外板＋赤い天端だけで識別する。
  for (let s = 200; s < distanceMeter; s += 200) {
    const foot = P(s, -0.75, 0), top = P(s, -0.75, 3.2);
    if (foot.depth <= 2 || top.depth <= 2 || foot.x < -30 || foot.x > W + 30) continue;
    const h = Math.max(2, foot.y - top.y), w = Math.max(2, h * 0.38);
    if (h > 54) continue;
    ctx.fillStyle = pal['sign-0'] ?? '#e8e3d2';
    ctx.fillRect(top.x - w / 2, top.y, w, h * 0.58);
    ctx.fillStyle = pal['mark-red'] ?? '#c8503a';
    ctx.fillRect(top.x - w / 2, top.y, w, Math.max(1, h * 0.1));
    ctx.strokeStyle = pal['sign-3'] ?? '#4c4840';
    ctx.lineWidth = Math.max(1, w * 0.08);
    ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(top.x, top.y + h * 0.58); ctx.stroke();
  }

  // 照明塔。遠景に細い垂直基準を作り、コースのスケールを読めるようにする。
  for (let s = 0; s <= distanceMeter; s += 400) {
    const foot = P(s, -15, 0), top = P(s, -15, 14);
    if (foot.depth <= 4 || top.depth <= 4 || foot.x < -40 || foot.x > W + 40) continue;
    const lampW = Math.max(3, (foot.y - top.y) * 0.22);
    ctx.strokeStyle = pal['stand-3'] ?? '#5e646d';
    ctx.lineWidth = Math.max(1, lampW * 0.12);
    ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.fillStyle = pal['paper-1'] ?? '#efe9dc';
    ctx.fillRect(top.x - lampW / 2, top.y - lampW * 0.16, lampW, Math.max(2, lampW * 0.32));
  }

  rail(0, pal['rail-0'] ?? '#e8eade', 8, 1.3);
  rail(WD, pal['rail-1'] ?? '#c9cfc2', 8, 1.4);

  // ★決勝線
  const a = P(distanceMeter, 0), b = P(distanceMeter, WD);
  if (a.depth > 1 && b.depth > 1) {
    ctx.strokeStyle = pal['paper-0'] ?? '#fff';
    ctx.lineWidth = Math.max(2, a.pxPerM * 0.5);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

/** 馬＋騎手のおよその高さ（m）。★大きさはこれと深さから決まります */
export const HORSE_HEIGHT_M = 2.5;

/**
 * ★**馬を置く**（奥から手前へ）。
 *
 *   ⚠️ 深さの順に描かないと、**奥の馬が手前の馬を隠します**。
 *   ★大きさは「馬の高さ × その深さの px/m」。整数倍にしません
 *     — 遠近では大きさが**連続的に変わる**ので、整数倍では表現できません。
 */
export function drawPerspectiveHorses<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  cam: PerspectiveCamera,
  horses: readonly PerspHorse[],
  opts: {
    readonly sheet: TImage;
    readonly sheetWidth: number;
    readonly spec: SheetSpec;
    readonly fieldSize: number;
    readonly frameOf: (gate: number) => number;
    readonly frameRoleOf: (gate: number, fieldSize: number) => string;
    readonly distanceMeter: number;
  },
): void {
  const basis = cameraBasis(cam);
  const cw = opts.sheetWidth / opts.spec.frames;
  const P = (s: number, w: number): ReturnType<typeof project> => {
    const p = posOf(course, s, w);
    return project(cam, basis, { x: p.x, y: p.y, z: 0 });
  };
  const drawn = horses
    .map((h) => ({
      h,
      s: Math.max(0, Math.min(opts.distanceMeter, h.s)),
      p: P(Math.max(0, Math.min(opts.distanceMeter, h.s)), h.w),
    }))
    .filter((d) => d.p.depth > 2)
    .sort((x, y) => y.p.depth - x.p.depth);

  for (const d of drawn) {
    const hpx = HORSE_HEIGHT_M * d.p.pxPerM;
    const wpx = hpx * (cw / opts.spec.cellH);
    /**
     * ★**長く伸びる影**。⚠️ 参考の接地感はほぼこれが作っています。
     *    足元の小さな楕円だと、馬が芝に貼った絵に見えます。
     */
    const tip = P(d.s + 0.25 * HORSE_HEIGHT_M * 2.2, d.h.w - 0.75 * HORSE_HEIGHT_M * 2.2);
    if (tip.depth > 2) {
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#0d1408';
      ctx.beginPath();
      ctx.ellipse(
        (d.p.x + tip.x) / 2, (d.p.y + tip.y) / 2,
        Math.hypot(tip.x - d.p.x, tip.y - d.p.y) / 2 + wpx * 0.18,
        Math.max(2, hpx * 0.055),
        Math.atan2(tip.y - d.p.y, tip.x - d.p.x), 0, Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const role = opts.frameRoleOf(d.h.gate, opts.fieldSize);
    const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
    ctx.drawImage(
      opts.sheet, opts.frameOf(d.h.gate) * cw, row * opts.spec.cellH, cw, opts.spec.cellH,
      d.p.x - wpx * 0.5, d.p.y - hpx, wpx, hpx,
    );
  }
}
