import { posOf, type Course } from './course.js';
import { cameraBasis, project, type PerspectiveCamera } from './perspective.js';
import type { Ctx2D, FontOf } from './oblique-draw.js';

/**
 * ★**発馬機を「絵」ではなく「形」で置く**（★2026-09-11・★オーナー指示）
 *
 * 【★なぜ作り直すか】
 *   > ★ゲートは真横からのゲートを作った方がいいです。★そのままゲート発走の瞬間の絵も
 *   > ★上手くいくと思いますし、★そのままの陣地取りも上手くいくと思います。
 *
 *   ★これまでの発馬機は ★**正面から描いた 1 枚の絵**（`gateFront`）を世界に立てていました。
 *   ⚠️ ★だからカメラを真横へ回すと ★**横向きの黒い塊**になり、★12 頭が縦に積み上がります
 *      （★2026-09-10 に別セッションが、★2026-09-11 に私が、★同じ形で踏んでいます）。
 *
 * 【★どうするか】★**世界座標で組み立てます。**
 *   ★房の仕切り・前枠・天井の桟・番号板を、★走路の座標（s, w）から投影して描きます。
 *   → ★**どの角度から見ても成立します。** ★正面でも真横でも俯瞰でも、絵を作り直す必要がありません。
 *   ★`finish-post.ts`（ゴール板）と同じ作法です。
 *
 * ⚠️ ★実在の競馬場・実在メーカーの意匠を写しません。★無地の枠だけです（★憲法 §0.1）。
 * ⚠️ ★乱数・時刻を使いません（★憲法 4）。★`closedRatio` は呼ぶ側が時刻から出します。
 * ⚠️ ★**着順にも位置にも触れません。** ★描くだけです（★憲法 3）。
 */

/** ★枠の高さ（m）。★馬（体高 2.4m）より少し高い */
export const GATE_HEIGHT_M = 2.9;
/** ★房の奥行き（m） */
export const GATE_DEPTH_M = 3.1;
/** ★番号板の高さ（m・★天井の上） */
export const GATE_PLATE_H_M = 0.62;

/** ★色は 1 か所に。★検査が「発馬機が出たか」を色で見分けられるようにする */
export const GATE_WORLD_COLORS = {
  /** ★骨組み（鋼） */
  frame: '#d7ded6',
  frameShade: '#8e9a92',
  /** ★仕切りの板 */
  panel: '#b9c3bb',
  panelShade: '#7d8880',
  /** ★前扉（閉じているとき） */
  door: '#e9eee8',
  /** ★番号板 */
  plate: '#f2f2ee',
  plateText: '#14181a',
  /** ★車輪と台座 */
  base: '#4d5651',
} as const;

export interface StartingGateWorldOptions {
  /** ★発馬機を置く走路上の位置（m）。★ふつうは 0（発走地点） */
  readonly startS: number;
  /** ★頭数。★房の数 */
  readonly fieldSize: number;
  /**
   * ★前扉の閉まり具合（1 = 閉／0 = 開ききった）。
   * ★呼ぶ側が時刻から出します（★ここでは時刻を読みません）。
   */
  readonly closedRatio: number;
  /** ★注視点。★ここから遠ければ描きません（m） */
  readonly focusS: number;
  /** ★この距離以内のときだけ描く（m・★既定 140） */
  readonly visibleWithinM?: number | undefined;
  /** ★番号板の文字。★省略すると板だけ */
  readonly font?: FontOf | undefined;
}

interface Projected { readonly x: number; readonly y: number; readonly depth: number }

/** ★4 点を結んで塗る（★どれか 1 点でもカメラの後ろなら描かない） */
function quad(
  ctx: Ctx2D<unknown>, a: Projected, b: Projected, c: Projected, d: Projected, fill: string,
): void {
  if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

/**
 * ★房の左端の走路内位置（m）。★12 頭なら内ラチ側から等間隔に並べます。
 * ⚠️ ★馬の走る位置（`laneAt`）とは別物です。★ここは ★**発馬機の形**だけを決めます。
 */
export function gateStallEdgesM(course: Course, fieldSize: number): { readonly left: number; readonly stallW: number } {
  /** ★内ラチから少し空けて、走路幅の 8 割を使う */
  const usable = course.widthM * 0.8;
  const left = course.widthM * 0.06;
  return { left, stallW: usable / Math.max(1, fieldSize) };
}

/**
 * ★**発馬機の「奥側」**（★仕切り・天井・番号板・台座）を描く。
 *   ⚠️ ★**馬より先に**呼ぶこと。★馬はこの上に描かれます。
 */
export function drawStartingGateWorld(
  ctx: Ctx2D<unknown>,
  course: Course,
  cam: PerspectiveCamera,
  opts: StartingGateWorldOptions,
): void {
  const within = opts.visibleWithinM ?? 140;
  if (Math.abs(opts.focusS - opts.startS) > within) return;
  const basis = cameraBasis(cam);
  const W = cam.width, H = cam.height;
  const P = (s: number, w: number, z: number): Projected => {
    const g = posOf(course, s, w);
    return project(cam, basis, { x: g.x, y: g.y, z });
  };
  const front = opts.startS;
  const back = opts.startS - GATE_DEPTH_M;
  const { left, stallW } = gateStallEdgesM(course, opts.fieldSize);
  const right = left + stallW * opts.fieldSize;

  /** ★画面に入っているかだけ先に見る（★入っていなければ何も描かない） */
  const probe = [P(front, left, 0), P(front, right, 0), P(back, left, GATE_HEIGHT_M)];
  if (probe.some((p) => p.depth <= 1)) return;
  const minX = Math.min(...probe.map((p) => p.x)), maxX = Math.max(...probe.map((p) => p.x));
  if (maxX < -240 || minX > W + 240) return;

  /** ── ① 台座（★走路に接する暗い帯）───────────────────────── */
  quad(ctx,
    P(back - 0.5, left - 0.4, 0), P(back - 0.5, right + 0.4, 0),
    P(front + 0.5, right + 0.4, 0), P(front + 0.5, left - 0.4, 0),
    GATE_WORLD_COLORS.base);

  /**
   * ── ② 仕切り（★房と房の間）───────────────────────────────
   *
   * ⚠️ ★**板は膝の高さまで**にしています（★2026-09-11）。
   *    ★最初は腰（0.62）まで ★**塞いだ面**にしました。★正面から見るぶんには良いのですが、
   *    ★**真横から見ると手前の 1 枚が全部を隠し**、★12 頭のうち 1 頭しか見えませんでした（★実測）。
   * → ★下 1/3 だけ塞ぎ、★上は ★**柱と桟**で抜きます。★横から見ると格子越しに馬が見えます。
   */
  const PANEL_TOP = GATE_HEIGHT_M * 0.34;
  for (let i = 0; i <= opts.fieldSize; i += 1) {
    const w = left + stallW * i;
    quad(ctx,
      P(back, w, 0), P(front, w, 0), P(front, w, PANEL_TOP), P(back, w, PANEL_TOP),
      i % 2 === 0 ? GATE_WORLD_COLORS.panel : GATE_WORLD_COLORS.panelShade);
    /** ★柱（前と後ろ） */
    for (const s of [front, back]) {
      quad(ctx,
        P(s, w - 0.06, 0), P(s, w + 0.06, 0),
        P(s, w + 0.06, GATE_HEIGHT_M), P(s, w - 0.06, GATE_HEIGHT_M),
        GATE_WORLD_COLORS.frame);
    }
    /** ★前後の柱をつなぐ桟（★仕切りの面に 1 本）。★横から見ると格子になる */
    quad(ctx,
      P(back, w - 0.04, GATE_HEIGHT_M * 0.64), P(front, w - 0.04, GATE_HEIGHT_M * 0.64),
      P(front, w + 0.04, GATE_HEIGHT_M * 0.64), P(back, w + 0.04, GATE_HEIGHT_M * 0.64),
      GATE_WORLD_COLORS.frameShade);
  }

  /** ── ③ 天井の桟（★走路を横切る 1 本）───────────────────── */
  for (const s of [front, back]) {
    const STEP = 1.2;
    for (let w = left; w < right; w += STEP) {
      const w2 = Math.min(w + STEP, right);
      quad(ctx,
        P(s, w, GATE_HEIGHT_M - 0.16), P(s, w2, GATE_HEIGHT_M - 0.16),
        P(s, w2, GATE_HEIGHT_M), P(s, w, GATE_HEIGHT_M),
        s === front ? GATE_WORLD_COLORS.frame : GATE_WORLD_COLORS.frameShade);
    }
  }
  /** ★前後の天井をつなぐ桟（★房ごと 1 本） */
  for (let i = 0; i <= opts.fieldSize; i += 1) {
    const w = left + stallW * i;
    quad(ctx,
      P(back, w - 0.05, GATE_HEIGHT_M - 0.12), P(front, w - 0.05, GATE_HEIGHT_M - 0.12),
      P(front, w + 0.05, GATE_HEIGHT_M - 0.12), P(back, w + 0.05, GATE_HEIGHT_M - 0.12),
      GATE_WORLD_COLORS.frameShade);
  }

  /** ── ④ 番号板（★天井の上・房ごと）───────────────────────── */
  for (let i = 0; i < opts.fieldSize; i += 1) {
    const wc = left + stallW * (i + 0.5);
    const a = P(front, wc - stallW * 0.34, GATE_HEIGHT_M);
    const b = P(front, wc + stallW * 0.34, GATE_HEIGHT_M);
    const c = P(front, wc + stallW * 0.34, GATE_HEIGHT_M + GATE_PLATE_H_M);
    const d = P(front, wc - stallW * 0.34, GATE_HEIGHT_M + GATE_PLATE_H_M);
    quad(ctx, a, b, c, d, GATE_WORLD_COLORS.plate);
    if (opts.font === undefined) continue;
    const h = Math.abs(((a.y + b.y) - (c.y + d.y)) / 2);
    if (h < 9) continue;
    /**
     * ⚠️ ★番号は ★**コードで描き直します**（★絵に焼くと、角度を変えたとき裏返ります）。
     *    ★2026-08-27 のオーナー指摘①と同じ理由です。
     */
    ctx.font = opts.font(Math.max(7, Math.round(h * 0.78)), true);
    ctx.textAlign = 'center';
    ctx.fillStyle = GATE_WORLD_COLORS.plateText;
    ctx.fillText(String(i + 1), (a.x + b.x) / 2, (a.y + b.y) / 2 - h * 0.16);
    ctx.textAlign = 'left';
  }
  void H;
}

/**
 * ★**発馬機の「手前の前扉」**を描く。
 *   ⚠️ ★**馬のあとに**呼ぶこと。★こうすると馬が ★**房の中にいる**ように見えます。
 *   ★`closedRatio` が 0 なら 1 画素も描きません（★発走後）。
 */
export function drawStartingGateWorldFront(
  ctx: Ctx2D<unknown>,
  course: Course,
  cam: PerspectiveCamera,
  opts: StartingGateWorldOptions,
): void {
  const closed = Math.max(0, Math.min(1, opts.closedRatio));
  if (closed <= 0.001) return;
  const within = opts.visibleWithinM ?? 140;
  if (Math.abs(opts.focusS - opts.startS) > within) return;
  const basis = cameraBasis(cam);
  const P = (s: number, w: number, z: number): Projected => {
    const g = posOf(course, s, w);
    return project(cam, basis, { x: g.x, y: g.y, z });
  };
  const front = opts.startS;
  const { left, stallW } = gateStallEdgesM(course, opts.fieldSize);

  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * closed;
  for (let i = 0; i < opts.fieldSize; i += 1) {
    const w0 = left + stallW * i + 0.07;
    const w1 = left + stallW * (i + 1) - 0.07;
    /** ★扉は縦の桟 3 本（★隙間から馬が見える） */
    for (let bar = 0; bar < 3; bar += 1) {
      const wc = w0 + (w1 - w0) * (0.25 + bar * 0.25);
      quad(ctx,
        P(front, wc - 0.05, 0), P(front, wc + 0.05, 0),
        P(front, wc + 0.05, GATE_HEIGHT_M * 0.86), P(front, wc - 0.05, GATE_HEIGHT_M * 0.86),
        GATE_WORLD_COLORS.door);
    }
    /** ★扉の上下の桟 */
    for (const z of [GATE_HEIGHT_M * 0.30, GATE_HEIGHT_M * 0.62]) {
      quad(ctx,
        P(front, w0, z - 0.05), P(front, w1, z - 0.05),
        P(front, w1, z + 0.05), P(front, w0, z + 0.05),
        GATE_WORLD_COLORS.door);
    }
  }
  ctx.globalAlpha = prev;
}
