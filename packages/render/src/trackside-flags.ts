import { posOf, type Course } from './course.js';
import { cameraBasis, project, type PerspectiveCamera } from './perspective.js';
import type { Ctx2D } from './oblique-draw.js';

/**
 * ★**コース脇の旗**（★2026-09-15・計画書 V-7「場の色の旗」＋ C-3「その回の風向き」）
 *
 * 【★なぜ要るか】★場ごとの色を ★**走っている間ずっと画面に入る物**に持たせるためです。
 *   ★ゲートとゴールの目印は発走とゴールの一瞬しか映りません。★旗は道中の真横でも馬の奥に並びます。
 *   ★なびく向きは ★**その回の風**（★呼ぶ側が発走の時刻やシードから決める）で、★同じ鞍でも回ごとに変わります。
 *
 * 【★置き場所と間隔】★内ラチの内側（`w = −9m`）に ★**40m ごと**に立てます。
 *   ★真横のカメラは走路の外側にいるので、★内馬場の旗は ★馬の奥に見えます（★実測: 決勝線の前で深さ 58.5m・内ラチは 49.5m）。
 *   ⚠️ ★最初は 120m ごとにしましたが、★真横の望遠（画角 26°）が注視点の前後に映すのは ★±25m ほどで、
 *      ★**1 本も画面に入らないコマ**がありました（★検査で判明）。★40m なら常に 1〜2 本が入ります。
 *
 * ⚠️ ★実在の競馬場・団体の旗・紋章を写しません。★2 色の無地の布だけです（★憲法 §0.1）。
 * ⚠️ ★乱数・時刻を読みません。★揺れは呼ぶ側が渡す表示秒の関数です（★憲法 4）。
 * ⚠️ ★着順にも位置にも触れません（★憲法 3）。
 */

/** ★旗を立てる間隔（m） */
export const TRACKSIDE_FLAG_INTERVAL_M = 40;
/** ★立てる横位置（m・負＝内ラチの内側）。★距離標（−1.1m）とゴール板（−2.2m）より奥 */
export const TRACKSIDE_FLAG_W_M = -9;
/** ★ポールの高さ（m）。★真横の望遠でも上端が画面に入る高さ（★ゴールの目印の 3.4m と同じ理由） */
export const TRACKSIDE_FLAG_POLE_M = 3.2;
/** ★布の実寸（m） */
export const TRACKSIDE_FLAG_CLOTH_W_M = 1.2;
export const TRACKSIDE_FLAG_CLOTH_H_M = 0.7;

export interface TracksideFlagStyle {
  readonly pole: string;
  /** ★布の色（★旗ごとに交互に使う） */
  readonly colors: readonly string[];
}

export interface TracksideFlagOptions {
  readonly focusS: number;
  readonly style: TracksideFlagStyle;
  /** ★風下の向き（★走路の進む向きに +1、逆に −1） */
  readonly windDir: 1 | -1;
  /** ★風の強さ（0〜1）。★強いほど布が水平に張り、揺れが速い */
  readonly windStrength: number;
  /** ★揺れの時計（★表示秒）。★呼ぶ側が渡す */
  readonly timeSec: number;
  readonly rangeM?: number | undefined;
}

/**
 * ★コース脇の旗を描く。★**馬より先**（奥）に呼ぶこと。
 *   ★内ラチより手前（カメラ側）に来た旗は描きません（★馬を隠さない・★正面や俯瞰のカットのため）。
 */
export function drawTracksideFlags(
  ctx: Ctx2D<unknown>,
  course: Course,
  cam: PerspectiveCamera,
  opts: TracksideFlagOptions,
): void {
  if (opts.style.colors.length === 0) return;
  const range = opts.rangeM ?? 600;
  const basis = cameraBasis(cam);
  const W = cam.width;
  const P = (s: number, w: number, z: number): ReturnType<typeof project> => {
    const g = posOf(course, s, w);
    return project(cam, basis, { x: g.x, y: g.y, z });
  };
  const focusDepth = P(opts.focusS, 0, 0).depth;
  const strength = Math.max(0, Math.min(1, opts.windStrength));
  /** ★布が垂れる量（★弱い風ほど下がる）と、揺れの速さ */
  const droop = TRACKSIDE_FLAG_CLOTH_H_M * 0.9 * (1 - strength);
  const flutterHz = 1.2 + strength * 2.2;
  const first = Math.max(0, Math.ceil((opts.focusS - range) / TRACKSIDE_FLAG_INTERVAL_M));
  const last = Math.floor(Math.min(course.distance + 60, opts.focusS + range) / TRACKSIDE_FLAG_INTERVAL_M);
  for (let k = first; k <= last; k += 1) {
    const s = k * TRACKSIDE_FLAG_INTERVAL_M;
    const foot = P(s, TRACKSIDE_FLAG_W_M, 0);
    const top = P(s, TRACKSIDE_FLAG_W_M, TRACKSIDE_FLAG_POLE_M);
    if (foot.depth <= 2 || top.depth <= 2) continue;
    if (foot.depth < focusDepth) continue;
    if (foot.x < -80 || foot.x > W + 80) continue;
    const poleH = foot.y - top.y;
    if (!(poleH > 3)) continue;
    const poleW = Math.max(1, poleH * 0.025);
    ctx.fillStyle = opts.style.pole;
    ctx.fillRect(foot.x - poleW / 2, top.y, poleW, poleH);
    /**
     * ★布は ★**世界の座標で**組みます（★走路の向きに沿って風下へ伸ばす）。★投影するので、
     *   ★真横では横に、★正面では奥行きに伸びて見えます（★どの角度でも成立）。
     */
    const color = opts.style.colors[k % opts.style.colors.length]!;
    const SEG = 6;
    const topEdge: { x: number; y: number }[] = [];
    const botEdge: { x: number; y: number }[] = [];
    let behind = false;
    for (let i = 0; i <= SEG; i += 1) {
      const u = i / SEG;
      const ds = opts.windDir * TRACKSIDE_FLAG_CLOTH_W_M * u;
      /** ★先へ行くほど大きく揺れる（★付け根は動かない） */
      const wave = Math.sin(opts.timeSec * flutterHz * Math.PI * 2 - u * 3.2 + k * 1.7) * 0.12 * u;
      const zTop = TRACKSIDE_FLAG_POLE_M - droop * u + wave;
      const a = P(s + ds, TRACKSIDE_FLAG_W_M + wave, zTop);
      const b = P(s + ds, TRACKSIDE_FLAG_W_M + wave, zTop - TRACKSIDE_FLAG_CLOTH_H_M);
      if (a.depth <= 2 || b.depth <= 2) { behind = true; break; }
      topEdge.push({ x: a.x, y: a.y });
      botEdge.push({ x: b.x, y: b.y });
    }
    if (behind) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(topEdge[0]!.x, topEdge[0]!.y);
    for (let i = 1; i < topEdge.length; i += 1) ctx.lineTo(topEdge[i]!.x, topEdge[i]!.y);
    for (let i = botEdge.length - 1; i >= 0; i -= 1) ctx.lineTo(botEdge[i]!.x, botEdge[i]!.y);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * ★**その回の風**（★決定論）。★デモの画面はシードから、★本番は発走の時刻から呼ぶ想定です。
 *   ★同じ入力なら同じ風（★見ている人の間で画が変わらない・憲法 4）。
 */
export function windOf(key: number): { readonly windDir: 1 | -1; readonly windStrength: number } {
  const h = Math.abs(Math.imul(Math.trunc(key) ^ 0x27d4eb2d, 0x165667b1)) >>> 0;
  return { windDir: (h & 1) === 0 ? 1 : -1, windStrength: 0.25 + ((h >>> 1) % 7) / 10 };
}
