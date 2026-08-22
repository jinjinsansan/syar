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
    /** 注視対象の内ラチからの距離。省略時は走路中央。 */
    readonly atW?: number;
    readonly width: number;
    readonly height: number;
    readonly view: ShotView;
    readonly preset: ShotCameraPreset;
  },
): PerspectiveCamera {
  const atW = opts.atW ?? course.widthM / 2;
  const c = posOf(course, opts.atS, atW);
  const a = posOf(course, opts.atS + 20, atW);
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
    along = -(p.alongM ?? p.sideM * 0.25);
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
export type RenderSurface = 'turf' | 'dirt';
export type RenderTrackCondition = 'good' | 'yielding' | 'soft' | 'bad';

/** 馬場条件をパレットの役割へ変換する。色そのものは描画層へ直書きしない。 */
export function trackSurfacePaletteRole(surface: RenderSurface, condition: RenderTrackCondition): string {
  const level = condition === 'good' ? 0 : condition === 'yielding' ? 1 : condition === 'soft' ? 2 : 3;
  if (surface === 'dirt') return `dirt-${level}`;
  return `turf-${3 + level}`;
}

/** 蹄が蹴り上げる土・芝片の強度。0なら描画しない。 */
export function trackKickupIntensity(surface: RenderSurface, condition: RenderTrackCondition): number {
  if (surface === 'dirt') {
    return condition === 'good' ? 0.22 : condition === 'yielding' ? 0.38 : condition === 'soft' ? 0.62 : 0.86;
  }
  // 良芝でも蹄が芝片と乾いた表土をわずかに蹴る。0だと接地感と速度感が消える。
  return condition === 'good' ? 0.07 : condition === 'yielding' ? 0.12 : condition === 'soft' ? 0.3 : 0.5;
}

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
  track: { readonly surface: RenderSurface; readonly condition: RenderTrackCondition } = { surface: 'turf', condition: 'good' },
): void {
  const basis = cameraBasis(cam);
  const W = cam.width;
  const hz = horizonY(cam, basis);
  const P = (s: number, w: number, z = 0): ReturnType<typeof project> => {
    const p = posOf(course, s, w);
    return project(cam, basis, { x: p.x, y: p.y, z });
  };
  const environment = broadcastEnvironmentAt(course, focusS);
  const trackRole = trackSurfacePaletteRole(track.surface, track.condition);
  const trackColor = pal[trackRole] ?? (track.surface === 'dirt' ? '#8a6b4a' : '#5a7f45');

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
  band(0, WD, trackColor, 6);
  /**
   * ★芝の刈り目 — **走路を端から端まで横切る帯**。
   * ⚠️ 内外にも刻むと市松になります。斜めに見えるのは**投影の結果**です。
   */
  const STRIPE = 22;
  ctx.globalAlpha = track.surface === 'turf' ? 0.18 : 0.1;
  ctx.fillStyle = pal[track.surface === 'turf' ? 'turf-2' : 'dirt-0'] ?? '#4a7a4e';
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

  // 進行方向に沿う芝の刈り筋／ダートのハロー跡。
  ctx.strokeStyle = pal[track.surface === 'turf' ? 'turf-1' : 'dirt-2'] ?? '#6d8c5b';
  ctx.globalAlpha = track.surface === 'turf' ? 0.13 : 0.24;
  ctx.lineWidth = 1;
  for (let lane = 1.5; lane < WD; lane += track.surface === 'turf' ? 2.6 : 1.35) {
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
 * ★被写体ブラーの標本の間隔（px）。**枚数ではなく間隔**を決めるのが要点です。
 *
 * 【★この値は 2 回測って決めました（2026-08-22）】
 *   枚数固定（6 枚＝8px 間隔）→ 蹄とヘルメットが**階段**に見えた。
 *   間隔 **2.5px** → まだ駄目。勝負服の白と脚の黒のような**高コントラストの縁**に
 *   ★**細かい斜めの格子**が出ます（`out/race-at/_zoom-blur.png` で確認）。
 *   間隔 **1.0px** → 消えました（`_zoom-step1.png`）。
 *
 *   ⚠️ ★「2.5px なら見えないはず」は**私の当て推量で、外れました**。
 *      拡大して見るまで分かりませんでした。値を動かすときは同じ倍率で見比べること。
 *
 * 【費用】1 頭あたりの重ね枚数 ＝ 尾の長さ ÷ この値。寄るほど尾が伸びて枚数が増えますが、
 *   寄るほど**画面に入る頭数が減る**ので積はおおむね一定です（実測: 最大でも 1 コマ 240 枚程度）。
 *   ★画面外の間引き（下の `filter`）が無いとこれが 12 頭ぶんに膨らみます。**対で入れること。**
 */
export const MOTION_BLUR_STEP_PX = 1.0;

/**
 * ★掃いた帯の**芯**（全標本が覆う所）の不透明度。
 *   1.0 にはできません（同じ α を n 枚重ねて 1 に到達するには α=1 が要り、それでは端も硬くなる）。
 *   0.97 なら地の色は 3% しか透けず、目には不透明に見えます。
 */
export const MOTION_BLUR_CORE_COVER = 0.97;

/**
 * ★**馬を置く**（奥から手前へ）。
 *
 *   ⚠️ 深さの順に描かないと、**奥の馬が手前の馬を隠します**。
 *   ★大きさは「馬の高さ × その深さの px/m」。整数倍にしません
 *     — 遠近では大きさが**連続的に変わる**ので、整数倍では表現できません。
 */
/** 高解像度の個別コマ（`frameImagesByGate` の要素） */
export interface HqHorseFrame<TImage> {
  readonly image: TImage;
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly referenceHeight: number;
  readonly bodyAnchorSourcePx?: { readonly x: number; readonly y: number } | undefined;
  readonly bodyLiftSourcePx?: number | undefined;
  readonly shadow?: { readonly image: TImage; readonly width: number; readonly height: number } | undefined;
  readonly overlay?: {
    readonly image: TImage;
    readonly width: number;
    readonly height: number;
    readonly offsetXSourcePx: number;
    readonly offsetYSourcePx: number;
  } | undefined;
}

/**
 * ★馬の向きとカメラの相対角（度）。0 = カメラから遠ざかる（後方視点）、180 = カメラへ向かってくる（正面）、
 *   90 = 真横。`forwardDx` は進行方向が画面でどちらへ向くか（＋=右）。
 */
export interface HorseViewInfo {
  readonly viewDeg: number;
  readonly forwardDx: number;
}

export function drawPerspectiveHorses<TImage>(
  ctx: Ctx2D<TImage>,
  course: Course,
  cam: PerspectiveCamera,
  horses: readonly PerspHorse[],
  opts: {
    readonly sheet: TImage;
    readonly sheetWidth: number;
    readonly spec: SheetSpec;
    /**
     * ★馬ごとに「進行方向とカメラの相対角」で素材集合と左右反転を選ぶ（方向別素材）。
     *   指定があると `frameImagesByGate` より優先。返した frames が undefined なら従来の選択に戻る。
     */
    readonly frameSetOf?: ((horse: PerspHorse, view: HorseViewInfo) =>
      { readonly frames: readonly HqHorseFrame<TImage>[] | undefined; readonly flip: boolean }) | undefined;
    /**
     * ★毛色バリエーション: 馬ごとの CSS filter（例 'hue-rotate(12deg) brightness(1.08)'）。基準コマの描画にだけ掛け、
     *   勝負服オーバーレイと影には掛けない。無彩色（勝負服の灰、鞍布の白、脚元の黒）はほぼ変わらない。
     */
    readonly coatFilterOf?: ((gate: number) => string | undefined) | undefined;
    /** 真横カメラ用の高解像度・個別フレーム。指定時はシートより優先する。 */
    readonly frameImages?: readonly {
      readonly image: TImage;
      readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
      readonly referenceHeight: number;
      /**
       * ★胴体の基準点（元画像 px）。指定時は外接矩形ではなく**この点**を接地点の真上に置く。
       *   外接矩形基準だと脚の伸縮で矩形が変わり、コマごとに胴体が上下左右へ跳ぶ（実測: v6 で
       *   矩形下端〜胴体 509〜563px・中心ずれ ±20px → 画面 194px で 12px/9px の跳び。空中局面ほど沈む逆位相）。
       */
      readonly bodyAnchorSourcePx?: { readonly x: number; readonly y: number } | undefined;
      /** 胴体基準点から接地点までの高さ（元画像 px）。コマ間で一定＋小さな上下動を含める */
      readonly bodyLiftSourcePx?: number | undefined;
      /** ★接地影用シルエット（`source` と同じ大きさ・黒＋α）。あれば楕円影の代わりに地面へ潰して落とす */
      readonly shadow?: { readonly image: TImage; readonly width: number; readonly height: number } | undefined;
      readonly overlay?: {
        readonly image: TImage;
        readonly width: number;
        readonly height: number;
        readonly offsetXSourcePx: number;
        readonly offsetYSourcePx: number;
      } | undefined;
    }[] | undefined;
    /** 馬番ごとの勝負服・ゼッケンを焼いた個別フレーム。 */
    readonly frameImagesByGate?: readonly (readonly {
      readonly image: TImage;
      readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
      readonly referenceHeight: number;
      readonly bodyAnchorSourcePx?: { readonly x: number; readonly y: number } | undefined;
      readonly bodyLiftSourcePx?: number | undefined;
      readonly shadow?: { readonly image: TImage; readonly width: number; readonly height: number } | undefined;
      readonly overlay?: {
        readonly image: TImage;
        readonly width: number;
        readonly height: number;
        readonly offsetXSourcePx: number;
        readonly offsetYSourcePx: number;
      } | undefined;
    }[])[] | undefined;
    readonly fieldSize: number;
    readonly frameOf: (gate: number) => number;
    /**
     * ★走行周期の位相（0〜1）。指定があるとコマ数に依存せず `floor(phase × コマ数)` でコマを選ぶ
     *   （8 コマと 16 コマの素材を同じ位相で回せる）。無ければ従来どおり `frameOf` の値をコマ数で割った余り。
     */
    readonly phaseOf?: ((gate: number) => number) | undefined;
    readonly frameRoleOf: (gate: number, fieldSize: number) => string;
    readonly distanceMeter: number;
    readonly trackEffect?: {
      readonly surface: RenderSurface;
      readonly condition: RenderTrackCondition;
      readonly color: string;
    } | undefined;
    /**
     * ★**被写体ブラー**（参考映像 1.4／設計 1-2）
     *
     * 【参考で実際に起きていること（`out/judge/ref-size.png` 104s を実見）】
     *   ★**馬体が丸ごと流れ、埒とゴール板の柱は止まっています。**
     *   カメラぶれ（画面全体が流れる）でも、被写界深度でもありません。
     *   ＝ カメラが馬を追い切っておらず、**馬だけが画面上を動いている**露光です。
     *
     * 【我々の事情 — ★ここは意図的に物理と違えています】
     *   我々のカメラは注視点（馬群）を追うので、**馬は画面上でほぼ止まっています**。
     *   物理どおりに「カメラ相対の速度」で尾を引かせると **ブラーはほぼ 0** になり、
     *   参考の見え方になりません。
     *   → ★**地面に対する実走速度**（`speedMpsOf`）から尾の長さを決めます。
     *     参考（アーケードの実機）も同種の演出的ブラーです。**物理の再現ではなく、絵の再現**です。
     *
     * 【やり方】
     *   露光の間に馬が進む距離だけ、進行方向の**後ろ**へ `samples` 枚を重ねます。
     *   古い順に `alpha = 1/(samples - j)` で描くと、重なりが**均等な平均**になり
     *   （各標本の寄与が 1/samples）、最終的な不透明度は 1 のままです。
     *   ⚠️ 一律 `1/samples` で描くと合成後の不透明度が 1-(1-1/n)^n ≒ 0.63 にしかならず、
     *      **馬が透けます**。
     *
     * ⚠️ 時刻を持ち込みません。速度は呼び出し側が**表示時刻の関数**として渡すので決定論です（憲法 4）。
     */
    readonly motionBlur?: {
      /** シャッター時間（秒）。1/60 前後。0 でブラー無し */
      readonly exposureSec: number;
      /**
       * ★標本数の**上限**。実際の枚数は尾の長さから決めます。
       *
       * ⚠️ ★枚数を固定にすると、寄ったカットで**残像が粒に見えます**（実測: 尾 41px を 6 枚 ＝
       *    8px 間隔で、蹄とヘルメットが**階段**になりました）。ブラーではなくコマ落ちに見えます。
       *    → **間隔を px で決めます**（`MOTION_BLUR_STEP_PX`）。引いたカットでは自動的に枚数が減ります。
       */
      readonly samples: number;
      /** 馬ごとの実走速度（m/s） */
      readonly speedMpsOf: (gate: number) => number;
    } | undefined;
  },
): void {
  const basis = cameraBasis(cam);
  const cw = opts.sheetWidth / opts.spec.frames;
  const P = (s: number, w: number): ReturnType<typeof project> => {
    const p = posOf(course, s, w);
    return project(cam, basis, { x: p.x, y: p.y, z: 0 });
  };
  /**
   * ★**画面から完全に外れた馬は描きません。**
   *
   *   これまでは奥行きだけで間引いていたので、寄りのカットでは**画面外の 10 頭ぶんも**
   *   毎コマ `drawImage` していました。被写体ブラーで 1 頭あたりの枚数が増えるため、
   *   ここを詰めないと費用がそのまま倍数で乗ります。
   *
   * ⚠️ ★余白を広めに取ること（馬体の半幅＋ブラーの尾）。切り詰めすぎると
   *    **画面端で馬が消える**という、間引きの典型的な失敗になります。
   */
  const drawn = horses
    .map((h) => ({
      h,
      s: Math.max(0, h.s),
      p: P(Math.max(0, h.s), h.w),
    }))
    .filter((d) => d.p.depth > 2)
    .filter((d) => {
      const margin = HORSE_HEIGHT_M * d.p.pxPerM * 1.6;
      return d.p.x > -margin && d.p.x < cam.width + margin
        && d.p.y > -margin && d.p.y < cam.height + margin * 2;
    })
    .sort((x, y) => y.p.depth - x.p.depth);

  for (const d of drawn) {
    const hpx = HORSE_HEIGHT_M * d.p.pxPerM;
    const wpx = hpx * (cw / opts.spec.cellH);
    // ★位相 → コマ: 8 コマ相当の局面番号（芝片・接地影の判定用）と、実コマ数に応じたインデックス
    const phase = opts.phaseOf !== undefined ? ((opts.phaseOf(d.h.gate) % 1) + 1) % 1 : undefined;
    const frameIndex = phase !== undefined ? Math.floor(phase * 8) % 8 : opts.frameOf(d.h.gate);
    const pickFrame = <T,>(frames: readonly T[] | undefined): T | undefined => {
      if (frames === undefined || frames.length === 0) return undefined;
      const n = frames.length;
      const index = phase !== undefined ? Math.floor(phase * n) % n : ((frameIndex % n) + n) % n;
      return frames[index];
    };
    // ★方向別素材: 馬の進行方向 f とカメラ→馬の水平ベクトル v の角度、進行方向の画面上の向き
    let flip = false;
    let chosen: readonly HqHorseFrame<TImage>[] | undefined;
    if (opts.frameSetOf !== undefined) {
      const p0 = posOf(course, d.s, d.h.w);
      const p1 = posOf(course, d.s + 1, d.h.w);
      const fx = p1.x - p0.x, fy = p1.y - p0.y;
      const vx = p0.x - cam.eye.x, vy = p0.y - cam.eye.y;
      const fl = Math.hypot(fx, fy) || 1, vl = Math.hypot(vx, vy) || 1;
      const cosT = Math.max(-1, Math.min(1, (fx * vx + fy * vy) / (fl * vl)));
      const viewDeg = (Math.acos(cosT) * 180) / Math.PI;
      const q1 = project(cam, basis, { x: p1.x, y: p1.y, z: 0 });
      const set = opts.frameSetOf(d.h, { viewDeg, forwardDx: q1.x - d.p.x });
      chosen = set.frames;
      flip = set.flip;
    }
    const gateSet = chosen ?? opts.frameImagesByGate?.[d.h.gate - 1];
    const hiForShadow = pickFrame(gateSet) ?? pickFrame(opts.frameImages);
    const canTransform = ctx.save !== undefined && ctx.restore !== undefined && ctx.transform !== undefined;
    if (hiForShadow?.shadow !== undefined && hiForShadow.bodyAnchorSourcePx !== undefined && canTransform) {
      /**
       * ★**接地影**: そのコマのシルエットを地面へ潰し（縦 0.26）、光源の反対（進行方向前・カメラ側）へ
       *   ずらして落とす。脚の形が影に出るので「芝に貼った絵」に見えない。楕円影は使わない。
       *   ⚠️ 上下動（bodyLift の bob）は影に入れない — 影は地面にあるので馬が跳ねても位置は変わらない。
       */
      const src = hiForShadow.source;
      const scale = hpx / hiForShadow.referenceHeight;
      const anchorX = (hiForShadow.bodyAnchorSourcePx.x - src.x) * scale;
      const ahead = P(d.s + 1, d.h.w);
      const dirX = ahead.x >= d.p.x ? 1 : -1;
      const skew = 0.28 * dirX;   // 前方（画面上の進行方向）へ少し倒す（倒しすぎると蹄と影が離れて浮いて見える）
      const flat = 0.22;          // 地面への圧縮
      ctx.save!();
      ctx.globalAlpha = 0.34;
      // ローカル座標: 蹄の行が y=0、上へ行くほど y<0。x' = X ± x − skew·y, y' = Y − flat·y（反転時は x を鏡像）
      ctx.transform!(flip ? -1 : 1, 0, -skew, -flat, d.p.x, d.p.y);
      ctx.drawImage(
        hiForShadow.shadow.image, 0, 0, hiForShadow.shadow.width, hiForShadow.shadow.height,
        -anchorX, -src.height * scale, src.width * scale, src.height * scale,
      );
      ctx.restore!();
      // ★接地影: 蹄の真下の濃い楕円。支持局面（コマ 04〜07）は濃く、空中では薄く小さく
      const cyc = ((frameIndex % 8) + 8) % 8;
      const grounded = cyc >= 3 && cyc <= 6;
      ctx.globalAlpha = grounded ? 0.30 : 0.14;
      ctx.fillStyle = '#07110a';
      ctx.beginPath();
      ctx.ellipse(d.p.x + dirX * hpx * 0.05, d.p.y - 1, hpx * (grounded ? 0.30 : 0.22), hpx * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      /**
       * ★**長く伸びる影**（シルエットが無い環境・シート描画のとき）。
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
    }
    const kickup = opts.trackEffect === undefined ? 0
      : trackKickupIntensity(opts.trackEffect.surface, opts.trackEffect.condition);
    if (kickup > 0) {
      /**
       * ★**芝片・土煙**は後肢が接地して蹴る局面でだけ出る（8 コマ: 06/07 が後肢接地・蹴り出し、08 で離地）。
       *   蹄の少し後ろから、後方上へ放物線を描いて飛び、落ちながら薄れる。
       *   位相はコマ番号（距離連動）から決めるので決定論。旧実装は `spec.frames`（HQ では 1）で位相が常に 0 だった。
       */
      const cycle = 8;
      const f = ((frameIndex % cycle) + cycle) % cycle;
      // 蹴り出しからの経過（コマ）: 06→0, 07→1, 08→2, 01→3, 02→4 … 5 コマで消える
      const sinceKick = (f - 5 + cycle) % cycle;
      if (sinceKick <= 4) {
        const life = sinceKick / 4;             // 0=発生 … 1=消滅
        const chunks = 2 + Math.round(kickup * 6);
        for (let i = 0; i < chunks; i += 1) {
          const seed = ((d.h.gate * 31 + i * 17) % 13) / 13;   // 個体・粒ごとの散らし（乱数ではなく決定的）
          const back = 0.35 + life * (1.6 + seed * 1.2);          // 後方へ（m）
          const lateral = (seed - 0.5) * 0.9;                    // 横へ（m）
          const rise = Math.sin(life * Math.PI) * (0.35 + seed * 0.45); // 放物線（m）
          const q = P(d.s - back, d.h.w + lateral);
          if (q.depth <= 2) continue;
          const size = Math.max(1.5, q.pxPerM * (0.05 + seed * 0.05) * (1 - life * 0.4));
          const yy = q.y - rise * q.pxPerM;
          ctx.globalAlpha = (0.55 - life * 0.45) * Math.min(1, kickup * 3);
          ctx.fillStyle = opts.trackEffect!.color;
          ctx.beginPath();
          // 不揃いな四角（芝片・土塊）
          ctx.moveTo(q.x - size, yy - size * 0.4);
          ctx.lineTo(q.x + size * 0.6, yy - size * 0.9);
          ctx.lineTo(q.x + size * 1.1, yy + size * 0.5);
          ctx.lineTo(q.x - size * 0.5, yy + size * 0.8);
          ctx.closePath();
          ctx.fill();
        }
        // 薄い土煙（発生直後だけ）
        if (life < 0.5) {
          const q = P(d.s - 0.4, d.h.w);
          if (q.depth > 2) {
            ctx.globalAlpha = (0.16 - life * 0.3) * Math.min(1, kickup * 3);
            ctx.fillStyle = opts.trackEffect!.color;
            ctx.beginPath();
            ctx.ellipse(q.x, q.y - q.pxPerM * 0.15, q.pxPerM * (0.35 + life * 0.5), q.pxPerM * (0.14 + life * 0.2), 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    const role = opts.frameRoleOf(d.h.gate, opts.fieldSize);
    const row = Math.max(0, Math.min(7, Number(role.slice(6)) - 1));
    const frame = frameIndex;
    const hi = pickFrame(gateSet) ?? pickFrame(opts.frameImages);

    /** ★1 枚ぶんの描画（`dx`,`dy` は画面上のずらし）。ブラーはこれを重ねて作る */
    const paintHorse = (dx: number, dy: number): void => {
      if (hi !== undefined) {
        const source = hi.source;
        const scale = hpx / hi.referenceHeight;
        const hiW = source.width * scale; const hiH = source.height * scale;
        // ★左右反転: 接地点 x を軸に鏡像（基準点は接地点の真上なので位置は変わらない）
        const mirrored = flip && ctx.save !== undefined && ctx.restore !== undefined && ctx.transform !== undefined;
        if (mirrored) { ctx.save!(); ctx.transform!(-1, 0, 0, 1, 2 * (d.p.x + dx), 0); }
        // ★胴体基準点があればそれを接地点の真上 `bodyLift` に置く。無ければ従来（矩形の中心・下端）
        const left = dx + (hi.bodyAnchorSourcePx !== undefined
          ? d.p.x - (hi.bodyAnchorSourcePx.x - source.x) * scale
          : d.p.x - hiW * 0.5);
        const top = dy + (hi.bodyAnchorSourcePx !== undefined
          ? d.p.y - (hi.bodyLiftSourcePx ?? 0) * scale - (hi.bodyAnchorSourcePx.y - source.y) * scale
          : d.p.y - hiH);
        const coat = opts.coatFilterOf?.(d.h.gate);
        const canFilter = coat !== undefined && 'filter' in ctx;
        if (canFilter) ctx.filter = coat;
        ctx.drawImage(
          hi.image, source.x, source.y, source.width, source.height,
          left, top, hiW, hiH,
        );
        if (canFilter) ctx.filter = 'none';
        if (hi.overlay !== undefined) {
          const overlayX = left + (hi.overlay.offsetXSourcePx - source.x) * scale;
          const overlayY = top + (hi.overlay.offsetYSourcePx - source.y) * scale;
          ctx.drawImage(
            hi.overlay.image, 0, 0, hi.overlay.width, hi.overlay.height,
            overlayX, overlayY, hi.overlay.width * scale, hi.overlay.height * scale,
          );
        }
        if (mirrored) ctx.restore!();
      } else {
        ctx.drawImage(
          opts.sheet, frame * cw, row * opts.spec.cellH, cw, opts.spec.cellH,
          d.p.x + dx - wpx * 0.5, d.p.y + dy - hpx, wpx, hpx,
        );
      }
    };

    /**
     * ★被写体ブラー: 露光の間に進む距離を、現在位置を**中心**に前後へ割り振って重ねる。
     *
     * 【重みの決め方 — ★ここで 1 度間違えました（2026-08-22）】
     *   最初は「古い順に `alpha = 1/(n-j)`」＝**逐次平均**にしていました。これは
     *   ★**最後の 1 枚が α=1** になるので、**現在位置だけ完全に不透明**で、
     *   その後ろに薄い残像が並ぶ絵になります。参考（馬体が丸ごと流れる）とは別物で、
     *   **前縁だけが硬い**という不自然さが残りました。
     *
     * ★不透明な物体の露光は、本来こうです:
     *     ある画素の濃さ ＝ **露光中にその画素を物体が覆っていた割合**
     *   ＝ 掃いた帯の**芯（全標本が覆う所）は不透明**、**両端は薄く**なる。
     *
     *   → 全標本を**同じ α** で重ねます。n 枚重ねたとき芯が `COVER` に達するよう
     *     `α = 1 - (1 - COVER)^(1/n)`。1 枚しか覆わない端は α のまま薄く残ります。
     *   ⚠️ 一律 `1/n` だと芯が 1-(1-1/n)^n ≒ 0.63 にしかならず**馬が透けます**。
     */
    const blur = opts.motionBlur;
    const tail = ((): { readonly dx: number; readonly dy: number; readonly n: number } | undefined => {
      if (blur === undefined || !(blur.exposureSec > 0) || blur.samples < 2) return undefined;
      const speed = blur.speedMpsOf(d.h.gate);
      if (!(speed > 0)) return undefined;
      const ahead = P(d.s + 1, d.h.w);
      const ux = ahead.x - d.p.x, uy = ahead.y - d.p.y;
      const len = Math.hypot(ux, uy);
      if (!(len > 1e-6)) return undefined;
      const travelPx = speed * blur.exposureSec * d.p.pxPerM;
      // 1px 未満の尾は描いても見えないので、重ね描きの費用だけが残る
      if (!(travelPx > 1)) return undefined;
      /**
       * ★枚数は**尾の長さ ÷ 目標間隔**。間隔が広いと残像が粒として見えます（階段）。
       *   上限は呼び出し側の `samples`（費用の頭打ち）。
       */
      const n = Math.max(2, Math.min(Math.round(blur.samples), Math.ceil(travelPx / MOTION_BLUR_STEP_PX) + 1));
      return { dx: (-ux / len) * travelPx, dy: (-uy / len) * travelPx, n };
    })();

    if (tail === undefined) {
      paintHorse(0, 0);
    } else {
      const prevAlpha = ctx.globalAlpha;
      const alpha = 1 - Math.pow(1 - MOTION_BLUR_CORE_COVER, 1 / tail.n);
      ctx.globalAlpha = prevAlpha * alpha;
      for (let j = 0; j < tail.n; j += 1) {
        // ★現在位置を中心に −0.5 〜 +0.5。前後どちらの端も同じように薄くなる
        const u = j / (tail.n - 1) - 0.5;
        paintHorse(tail.dx * u, tail.dy * u);
      }
      ctx.globalAlpha = prevAlpha;
    }
  }
}
