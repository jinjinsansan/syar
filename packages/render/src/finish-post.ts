import { posOf, type Course } from './course.js';
import { cameraBasis, project, type PerspectiveCamera } from './perspective.js';
import type { Ctx2D, FontOf } from './oblique-draw.js';

/**
 * ★**ゴール板と決勝線**（設計 2-3・デザイナー依頼 D-3 の代替）
 *
 * 【参考で見えていること】
 *   参考の 111〜113s は**ゴール板が立体物として立って**います（設計 1.1）。
 *   ★113s で**馬が完全に流れる一方、ゴール板の柱は止まっている** — これが
 *   「カメラぶれではなく被写体ブラー」の証拠になっていた物でもあります。
 *
 * 【なぜここで足すか】
 *   横視点（パララックス）には**既に絵があります**（`finish-tower` / `finish-line-*`）。
 *   ★無いのは**透視ワールド側**（コーナー・正面・俯瞰）です。そこでゴール前を映すと、
 *   決勝線もゴール板も無い、ただの芝の上で決着することになります。
 *
 * 【★2026-09-15 から: 競馬場ごとの目印】★オーナー「ゴール目印を競馬場ごとに変える」。
 *   ★横視点の審判塔は ★**1 枚の絵を全場で共有**していました。★場ごとに違えるため、
 *   ★スターパーク以外の場は ★**横視点でもここで柱と板を描きます**（`style` と `line: false`）。
 *   ⚠️ ★決勝線は横視点の板の絵（`finish-line-*`）のままです。★ここで描くと二重になります。
 *
 * ⚠️ 実在の競馬場の意匠を写しません。柱と板だけの無地です（憲法 §0.1）。
 * ⚠️ 乱数・時刻を使いません（憲法 4）。
 */

/** ゴール板の高さ（m） */
export const FINISH_POST_HEIGHT_M = 5.6;
/** 板（横長の看板）の実寸（m） */
export const FINISH_BOARD_W_M = 2.6;
export const FINISH_BOARD_H_M = 1.5;
/** 内ラチからどれだけ内側に立てるか（m） */
export const FINISH_POST_INSET_M = -2.2;

/** ★ゴールの目印の色の組 */
export interface FinishMarkerColors {
  readonly post: string;
  readonly postShade: string;
  readonly board: string;
  readonly line: string;
  /** ★板の縁・円板の輪の差し色。★省くと `post`（＝従来どおり） */
  readonly accent?: string | undefined;
}

/** ★色は 1 か所に。検査が「ゴール板が出たか」を色で見分けられるようにする */
export const FINISH_POST_COLORS = {
  post: '#e7ebe2',
  postShade: 'rgba(16,26,18,.4)',
  board: '#12281a',
  line: '#f2f5ee',
} as const satisfies FinishMarkerColors;

/**
 * ★**目印の形**（★2026-09-15）。
 *   ★`board`  … 柱 1 本の上に横長の板（★従来）
 *   ★`disc`   … 柱 1 本の上に円板（★輪の色で見分ける）
 *   ★`gantry` … 決勝線をまたぐ柱 2 本と、その上に渡した板
 * ⚠️ ★どの形も ★**決勝線の真上に中心**を置きます。★目印の位置で入線がずれて見えないように。
 */
export type FinishMarkerShape = 'board' | 'disc' | 'gantry';

export interface FinishMarkerStyle {
  readonly colors: FinishMarkerColors;
  readonly shape?: FinishMarkerShape | undefined;
}

/** ★既定の見た目（★スターパーク競馬場と同じ） */
export const FINISH_POST_STYLE: FinishMarkerStyle = { colors: FINISH_POST_COLORS };

export interface FinishPostOptions {
  readonly focusS: number;
  /** 注視点からこの距離以内のときだけ描く（m） */
  readonly visibleWithinM?: number | undefined;
  /** 板に入れる文字（省略すると無地） */
  readonly label?: string | undefined;
  readonly font?: FontOf | undefined;
  /** ★見た目（★競馬場ごと）。★省略すると `FINISH_POST_STYLE` */
  readonly style?: FinishMarkerStyle | undefined;
  /** ★決勝線を描くか。★既定 true。★横視点は板の絵に線があるので false */
  readonly line?: boolean | undefined;
  /** ★柱の高さ（m）。★既定 `FINISH_POST_HEIGHT_M`。★横視点は `FINISH_POST_SIDE_HEIGHT_M` */
  readonly heightM?: number | undefined;
}

/**
 * ★**横視点の目印の高さ（m）**（★2026-09-15）。
 *
 * ⚠️ ★横視点の `finish-line` のカメラは ★**馬を大きく写す望遠**なので、★5.6m の柱だと
 *    ★**柱の上（板・円板）が画面の上に出ます**（★実測: 天河 2000m・円板の中心 y = −59px）。
 *    ★板の絵の審判塔は ★板の座標で置かれるので、この問題が起きていませんでした。
 * → ★横視点だけ 3.4m にします。★馬（体高 2.4m）より上に板が見え、★画面の上端に掛かりません。
 *   ★透視ワールドのカットは従来の 5.6m のままです。
 */
export const FINISH_POST_SIDE_HEIGHT_M = 3.4;

/**
 * 決勝線とゴール板を描く。**地面のあと・馬より前**に呼ぶこと。
 */
export function drawFinishPost(
  ctx: Ctx2D<unknown>,
  course: Course,
  cam: PerspectiveCamera,
  opts: FinishPostOptions,
): void {
  const within = opts.visibleWithinM ?? 320;
  const s = course.distance;
  if (Math.abs(opts.focusS - s) > within) return;
  const style = opts.style ?? FINISH_POST_STYLE;
  const C = style.colors;
  const rim = C.accent ?? C.post;
  const basis = cameraBasis(cam);
  const W = cam.width, H = cam.height;
  const P = (x: number, y: number, z: number): ReturnType<typeof project> =>
    project(cam, basis, { x, y, z });

  /**
   * ── 決勝線（走路を横切る白い線）───────────────────────────────
   * ⚠️ ★**走路の幅ぶんを刻んで**描くこと。両端 2 点だけで結ぶと、
   *    曲率のある区間で線が走路からずれます。
   */
  if (opts.line !== false) {
    const STEP_M = 2;
    const LINE_M = 0.25;                       // 線の太さ（走路方向）
    ctx.fillStyle = C.line;
    for (let w = 0; w < course.widthM; w += STEP_M) {
      const w2 = Math.min(w + STEP_M, course.widthM);
      const g0 = posOf(course, s, w), g1 = posOf(course, s, w2);
      const h0 = posOf(course, s + LINE_M, w), h1 = posOf(course, s + LINE_M, w2);
      const a = P(g0.x, g0.y, 0), b = P(g1.x, g1.y, 0);
      const c = P(h1.x, h1.y, 0), d = P(h0.x, h0.y, 0);
      if (a.depth <= 1 || b.depth <= 1 || c.depth <= 1 || d.depth <= 1) continue;
      const minX = Math.min(a.x, b.x, c.x, d.x), maxX = Math.max(a.x, b.x, c.x, d.x);
      const minY = Math.min(a.y, b.y, c.y, d.y), maxY = Math.max(a.y, b.y, c.y, d.y);
      if (maxX < -20 || minX > W + 20 || maxY < -20 || minY > H + 20) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** ── ゴール板（内側に立つ柱＋板）───────────────────────────── */
  const heightM = opts.heightM ?? FINISH_POST_HEIGHT_M;
  const postAt = (ds: number): { foot: ReturnType<typeof project>; top: ReturnType<typeof project> } => {
    const ground = posOf(course, s + ds, FINISH_POST_INSET_M);
    return { foot: P(ground.x, ground.y, 0), top: P(ground.x, ground.y, heightM) };
  };
  const { foot, top } = postAt(0);
  if (foot.depth <= 2 || top.depth <= 2) return;
  const postH = foot.y - top.y;
  if (!(postH > 4)) return;
  if (foot.x < -200 || foot.x > W + 200) return;
  const pxPerM = postH / heightM;
  const postW = Math.max(2, 0.34 * pxPerM);
  const drawPost = (x: number, yTop: number, h: number): void => {
    ctx.fillStyle = C.post;
    ctx.fillRect(x - postW / 2, yTop, postW, h);
    ctx.fillStyle = C.postShade;
    ctx.fillRect(x - postW / 2, yTop, Math.max(1, postW * 0.28), h);
  };

  const shape = style.shape ?? 'board';
  if (shape === 'gantry') {
    /** ★決勝線をまたぐ 2 本（★走路方向に ±1.4m）。★板はその上に渡す */
    const a = postAt(-1.4), b = postAt(1.4);
    if (a.foot.depth <= 2 || b.foot.depth <= 2 || a.top.depth <= 2 || b.top.depth <= 2) return;
    drawPost(a.foot.x, a.top.y, a.foot.y - a.top.y);
    drawPost(b.foot.x, b.top.y, b.foot.y - b.top.y);
    const x0 = Math.min(a.foot.x, b.foot.x) - postW, x1 = Math.max(a.foot.x, b.foot.x) + postW;
    const bw = Math.max(x1 - x0, FINISH_BOARD_W_M * 0.8 * pxPerM);
    const bh = FINISH_BOARD_H_M * 0.7 * pxPerM;
    const bx = (x0 + x1) / 2 - bw / 2;
    const by = Math.min(a.top.y, b.top.y) - bh * 0.1;
    ctx.fillStyle = C.board;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = rim;
    ctx.fillRect(bx, by, bw, Math.max(1, bh * 0.12));
    ctx.fillRect(bx, by + bh - Math.max(1, bh * 0.12), bw, Math.max(1, bh * 0.12));
    /** ★決勝線の真上に縦の印（★入線の位置を読ませる） */
    ctx.fillRect(foot.x - Math.max(1, postW * 0.25), by, Math.max(2, postW * 0.5), bh);
    return;
  }

  // 柱
  drawPost(foot.x, top.y, postH);

  if (shape === 'disc') {
    /** ★柱の上の円板（★半径 0.95m・輪 0.18m） */
    const r = 0.95 * pxPerM;
    const cy = top.y - r * 0.55;
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(foot.x, cy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.board;
    ctx.beginPath();
    ctx.ellipse(foot.x, cy, r * 0.8, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 板（柱の上）
  const bw = FINISH_BOARD_W_M * pxPerM;
  const bh = FINISH_BOARD_H_M * pxPerM;
  const bx = foot.x - bw / 2;
  const by = top.y - bh * 0.1;
  ctx.fillStyle = C.board;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = rim;
  ctx.fillRect(bx, by, bw, Math.max(1, bh * 0.09));
  ctx.fillRect(bx, by + bh - Math.max(1, bh * 0.09), bw, Math.max(1, bh * 0.09));
  if (opts.label !== undefined && opts.font !== undefined && bh >= 12) {
    const fontPx = Math.max(7, bh * 0.5);
    ctx.font = opts.font(fontPx, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.post;
    ctx.fillText(opts.label, foot.x, by + bh * 0.68);
    ctx.textAlign = 'left';
  }
}
