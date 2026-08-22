import { posOf, type Course } from './course.js';
import { cameraBasis, project, type PerspectiveCamera } from './perspective.js';
import type { Ctx2D, FontOf } from './oblique-draw.js';

/**
 * ★**ハロン棒・距離標**（設計 1-7・参考映像 1.2 #6）
 *
 * 【なぜ要るか】
 *   参考の走路には 200m ごとに棒が立っています（設計 1.2 の表「#6 ハロン棒・距離標:
 *   参考 あり／我々 なし」）。役目は 2 つあります:
 *     ① **残り距離が絵で分かる**（HUD の数字を読まなくても「あと 400」が見える）
 *     ② ★**世界に固定された物が流れる**ので、速度が絵から伝わる。
 *        芝と埒だけだと、どちらも一様なので**どれだけ進んだかが見えません。**
 *
 * ⚠️ 実在の競馬場の配色・意匠を写しません（憲法 §0.1）。棒と数字だけの無地です。
 * ⚠️ 乱数・時刻を使いません。コースとカメラだけの関数です（憲法 4）。
 */

/** 棒を立てる間隔（m）。1 ハロン ＝ 約 200m */
export const DISTANCE_POLE_INTERVAL_M = 200;

/** 棒の高さ（m） */
export const DISTANCE_POLE_HEIGHT_M = 1.9;

/**
 * ★内ラチからどれだけ内側に立てるか（m）。
 *   ⚠️ 走路の中（w > 0）に置くと**馬が棒を突き抜けます**。必ず内ラチの外側（負）にすること。
 */
export const DISTANCE_POLE_INSET_M = -1.1;

/**
 * ★注視点（馬群）の奥行きに対して、これより手前の棒は描かない。
 *   横のカットではカメラが走路の内側に入るので、内ラチ際の棒が**馬の手前**に立ちます。
 */
export const NEAR_SKIP_RATIO = 0.62;

export interface DistancePoleOptions {
  readonly focusS: number;
  /** 注視点の前後どれだけを描くか（m） */
  readonly rangeM?: number | undefined;
  /**
   * ★描く順。`behind` は馬より先（奥にある棒）、`front` は馬のあと（手前にある棒）。
   *   ⚠️ 全部を馬より先に描くと、**手前の棒の上に馬が乗って**「棒の向こうに立っている」
   *      ように見えます（内ラチで一度起きた壊れ方と同じ）。
   */
  readonly pass: 'behind' | 'front';
  /** 数字を描くための書体。省略すると棒だけ */
  readonly font?: FontOf | undefined;
  readonly intervalM?: number | undefined;
}

/**
 * 残り距離の棒を描く。**馬の前後 2 回**呼ぶこと（`pass: 'behind'` → 馬 → `pass: 'front'`）。
 */
export function drawDistancePoles(
  ctx: Ctx2D<unknown>,
  course: Course,
  cam: PerspectiveCamera,
  opts: DistancePoleOptions,
): void {
  const interval = opts.intervalM ?? DISTANCE_POLE_INTERVAL_M;
  if (!(interval > 0)) return;
  const range = opts.rangeM ?? 500;
  const basis = cameraBasis(cam);
  const W = cam.width, H = cam.height;
  const project3 = (x: number, y: number, z: number): ReturnType<typeof project> =>
    project(cam, basis, { x, y, z });

  /** 注視点の奥行き。これより手前の棒が `front` 側 */
  const focusGround = posOf(course, opts.focusS, 0);
  const focusDepth = project3(focusGround.x, focusGround.y, 0).depth;

  const first = Math.ceil((opts.focusS - range) / interval);
  const last = Math.floor((opts.focusS + range) / interval);
  const prevAlpha = ctx.globalAlpha;
  for (let k = first; k <= last; k += 1) {
    const s = k * interval;
    // ★残り 0（ゴール板の位置）には立てない。ゴール板は別の物（第 2 波 D-3）
    const left = course.distance - s;
    if (left <= 0 || s < 0) continue;
    const ground = posOf(course, s, DISTANCE_POLE_INSET_M);
    const foot = project3(ground.x, ground.y, 0);
    if (foot.depth <= 2) continue;
    const near = foot.depth < focusDepth;
    if ((near ? 'front' : 'behind') !== opts.pass) continue;
    const top = project3(ground.x, ground.y, DISTANCE_POLE_HEIGHT_M);
    if (top.depth <= 2) continue;
    const poleH = foot.y - top.y;
    if (!(poleH > 2)) continue;                       // 遠すぎて 2px 未満なら描かない
    /**
     * ★**カメラのすぐ手前に来た棒は描きません。**
     *
     *   横のカットはカメラが走路の**内側**に入るので、内ラチ際の棒は
     *   ★**カメラと馬の間**に立ちます。画角 5.7° の寄りでは画面の 4 割を占め、
     *   **勝負どころの馬を隠します**（実測: 直線の寄りで棒が高さ 275px ＝画面の 38%）。
     *   実際の中継でも一瞬なめる程度なので、**近すぎるものは出さない**のが正しい。
     */
    if (foot.depth < focusDepth * NEAR_SKIP_RATIO) continue;
    const poleW = Math.max(1.2, poleH * 0.036);
    if (foot.x < -40 || foot.x > W + 40 || foot.y < -40 || top.y > H + 40) continue;

    ctx.globalAlpha = prevAlpha;
    // 支柱（白）
    ctx.fillStyle = '#eef2ea';
    ctx.fillRect(foot.x - poleW / 2, top.y, poleW, poleH);
    ctx.fillStyle = 'rgba(12,20,14,.45)';
    ctx.fillRect(foot.x - poleW / 2, top.y, Math.max(0.6, poleW * 0.3), poleH);

    /**
     * 距離の板（上端）。★数字は「残り m」。
     * ⚠️ 板を大きくすると**道路標識**に見えます。実物は細い柱に小さな標示です。
     */
    const plateH = Math.max(3, poleH * 0.16);
    const plateW = plateH * 1.9;
    if (plateH >= 7 && opts.font !== undefined) {
      const px = foot.x - plateW / 2;
      const py = top.y - plateH * 0.12;
      ctx.fillStyle = '#12281a';
      ctx.fillRect(px, py, plateW, plateH);
      ctx.fillStyle = '#eef2ea';
      ctx.fillRect(px, py, plateW, Math.max(1, plateH * 0.1));
      const fontPx = Math.max(6, plateH * 0.62);
      ctx.font = opts.font(fontPx, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#eef2ea';
      ctx.fillText(String(left), foot.x, py + plateH * 0.78);
      ctx.textAlign = 'left';
    } else if (plateH >= 3) {
      // 遠い棒は板だけ（数字は読めないので描かない）
      ctx.fillStyle = '#12281a';
      ctx.fillRect(foot.x - plateW / 2, top.y, plateW, plateH);
    }
  }
  ctx.globalAlpha = prevAlpha;
}
