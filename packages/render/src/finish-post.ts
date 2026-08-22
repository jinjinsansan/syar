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

/** ★色は 1 か所に。検査が「ゴール板が出たか」を色で見分けられるようにする */
export const FINISH_POST_COLORS = {
  post: '#e7ebe2',
  postShade: 'rgba(16,26,18,.4)',
  board: '#12281a',
  line: '#f2f5ee',
} as const;

export interface FinishPostOptions {
  readonly focusS: number;
  /** 注視点からこの距離以内のときだけ描く（m） */
  readonly visibleWithinM?: number | undefined;
  /** 板に入れる文字（省略すると無地） */
  readonly label?: string | undefined;
  readonly font?: FontOf | undefined;
}

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
  const basis = cameraBasis(cam);
  const W = cam.width, H = cam.height;
  const P = (x: number, y: number, z: number): ReturnType<typeof project> =>
    project(cam, basis, { x, y, z });

  /**
   * ── 決勝線（走路を横切る白い線）───────────────────────────────
   * ⚠️ ★**走路の幅ぶんを刻んで**描くこと。両端 2 点だけで結ぶと、
   *    曲率のある区間で線が走路からずれます。
   */
  {
    const STEP_M = 2;
    const LINE_M = 0.25;                       // 線の太さ（走路方向）
    ctx.fillStyle = FINISH_POST_COLORS.line;
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
  const ground = posOf(course, s, FINISH_POST_INSET_M);
  const foot = P(ground.x, ground.y, 0);
  const top = P(ground.x, ground.y, FINISH_POST_HEIGHT_M);
  if (foot.depth <= 2 || top.depth <= 2) return;
  const postH = foot.y - top.y;
  if (!(postH > 4)) return;
  if (foot.x < -200 || foot.x > W + 200) return;
  const pxPerM = postH / FINISH_POST_HEIGHT_M;
  const postW = Math.max(2, 0.34 * pxPerM);

  // 柱
  ctx.fillStyle = FINISH_POST_COLORS.post;
  ctx.fillRect(foot.x - postW / 2, top.y, postW, postH);
  ctx.fillStyle = FINISH_POST_COLORS.postShade;
  ctx.fillRect(foot.x - postW / 2, top.y, Math.max(1, postW * 0.28), postH);

  // 板（柱の上）
  const bw = FINISH_BOARD_W_M * pxPerM;
  const bh = FINISH_BOARD_H_M * pxPerM;
  const bx = foot.x - bw / 2;
  const by = top.y - bh * 0.1;
  ctx.fillStyle = FINISH_POST_COLORS.board;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = FINISH_POST_COLORS.post;
  ctx.fillRect(bx, by, bw, Math.max(1, bh * 0.09));
  ctx.fillRect(bx, by + bh - Math.max(1, bh * 0.09), bw, Math.max(1, bh * 0.09));
  if (opts.label !== undefined && opts.font !== undefined && bh >= 12) {
    const fontPx = Math.max(7, bh * 0.5);
    ctx.font = opts.font(fontPx, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = FINISH_POST_COLORS.post;
    ctx.fillText(opts.label, foot.x, by + bh * 0.68);
    ctx.textAlign = 'left';
  }
}
