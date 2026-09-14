import type { Ctx2D, FontOf } from './oblique-draw.js';
import { HUD } from './hud-kit.js';

/**
 * ★**真横の直線だけで、ゴールへ向かって緊張を上げる画面の部品**（★2026-09-14・オーナー判断）
 *
 *   > ★「真横カメラワークの直線だけど、★いかにユーザーにワクワクさせるか？がカギになります」
 *
 * ★3 者の相談のまとめ（`SYNTHESIS_RACE_SIDE_ONLY_20260914.md`）で「採る」とした案のうち、
 * ★画面の上に重ねる部品をここに置きます:
 *   ★#5 残り距離のカウントダウン ／ ★#8 周辺の減光 ／ ★#16 HUD を濃さで下げる
 *   ★#10 勢い（★段階・★数字を出さない） ／ ★#9 写真判定の止め絵
 *
 * 【★守ること】
 *   ⚠️ ★**着順・走破タイム・位置・乱数に触れません。** ★描くだけです（★憲法 3）。
 *   ⚠️ ★**ゴールより前の判断に、未来の値を読みません**（★レビュー側 Q-R7）。
 *      ★入力は ★その時刻の位置と、★それより前の位置だけです。
 *   ⚠️ ★時刻は引数でもらいます（★`Date.now()` を呼ばない・憲法 4）。
 */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/* ───────────────────────── ★#5 カウントダウン ───────────────────────── */

/** ★カウントダウンを出し始める残り距離（m）。★デザイナー回答 D-6「最後の 200m」 */
export const GOAL_COUNTDOWN_FROM_M = 200;
/** ★出し切るまでの距離（m）。★段で出すと「パッと出た」になるので、★なだらかに */
const GOAL_COUNTDOWN_FADE_M = 15;

/** ★カウントダウンの濃さ（0〜1）。★先頭が決勝線を越えたら 0 */
export function goalCountdownAlpha(metersLeft: number): number {
  if (!Number.isFinite(metersLeft) || metersLeft <= 0) return 0;
  if (metersLeft > GOAL_COUNTDOWN_FROM_M) return 0;
  return smooth((GOAL_COUNTDOWN_FROM_M - metersLeft) / GOAL_COUNTDOWN_FADE_M);
}

/**
 * ★**残り距離の大きな数字**（★画面の上の中央）。
 * ⚠️ ★右上は順位表、★左上は見出し、★最上部は隊列バーです。★空いているのは上の中央だけです。
 * ⚠️ ★数字は ★**先頭の残り距離**を整数に丸めたものです（★m/s などの計測値は出しません）。
 */
export function drawGoalCountdown<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf,
  o: { readonly viewport: { readonly width: number; readonly height: number }; readonly metersLeft: number },
): void {
  const alpha = goalCountdownAlpha(o.metersLeft);
  if (alpha <= 0.001) return;
  const { width: W, height: H } = o.viewport;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  const cx = Math.round(W / 2);
  const labelY = Math.round(H * (58 / 720));
  const numY = Math.round(H * (148 / 720));
  ctx.textAlign = 'center';
  ctx.font = font(Math.round(H * (15 / 720)), true);
  ctx.fillStyle = HUD.paper70;
  ctx.fillText('ゴールまで', cx, labelY);
  const num = String(Math.max(0, Math.ceil(o.metersLeft)));
  const numSize = Math.round(H * (96 / 720));
  ctx.font = font(numSize, true);
  const nw = ctx.measureText(num).width;
  const unitSize = Math.round(H * (28 / 720));
  /** ★数字と「m」を 1 まとまりで中央に置く */
  ctx.textAlign = 'left';
  const x0 = Math.round(cx - (nw + unitSize * 0.9) / 2);
  if (ctx.strokeText !== undefined) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(3,7,5,.75)';
    ctx.strokeText(num, x0, numY);
  }
  ctx.fillStyle = HUD.gold;
  ctx.fillText(num, x0, numY);
  ctx.font = font(unitSize, true);
  ctx.fillStyle = HUD.paper70;
  ctx.fillText('m', x0 + nw + 4, numY);
  ctx.globalAlpha = prev;
}

/* ───────────────────────── ★#8 周辺の減光 ───────────────────────── */

/** ★減光を始める残り距離（m）。★デザイナー回答 D-6「残り 100m から」 */
export const CLIMAX_VIGNETTE_FROM_M = 100;
/**
 * ★いちばん濃いときの濃さ。
 * ⚠️ ★**脚さばきを隠さない強さ**に留めます（★相談書 C-4）。★画面の中央は 0 のままです。
 */
export const CLIMAX_VIGNETTE_MAX_ALPHA = 0.32;

/** ★周辺の減光の濃さ（0〜1 × 最大）。★決勝線を越えたら 0 */
export function climaxVignetteAlpha(metersLeft: number): number {
  if (!Number.isFinite(metersLeft) || metersLeft <= 0) return 0;
  if (metersLeft >= CLIMAX_VIGNETTE_FROM_M) return 0;
  return CLIMAX_VIGNETTE_MAX_ALPHA * smooth((CLIMAX_VIGNETTE_FROM_M - metersLeft) / (CLIMAX_VIGNETTE_FROM_M - 20));
}

/**
 * ★画面の周辺だけを暗くする（★中央は暗くしない）。
 * ⚠️ ★放射状の塗りを持たない環境では ★**何もしません**（★壊れない側・R-27）。
 */
export function drawClimaxVignette<TImage>(
  ctx: Ctx2D<TImage>, viewport: { readonly width: number; readonly height: number }, alpha: number,
): void {
  if (!(alpha > 0.001) || ctx.createRadialGradient === undefined) return;
  const { width: W, height: H } = viewport;
  const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.42, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(1, alpha).toFixed(3)})`);
  const prev = ctx.fillStyle;
  ctx.fillStyle = g as unknown as string;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = prev;
}

/* ───────────────────────── ★#16 HUD を濃さで下げる ───────────────────────── */

/** ★薄くし始める残り距離と、薄くし終わる残り距離（m）。★デザイナー回答 D-5 */
export const CLIMAX_HUD_FADE_FROM_M = 250;
export const CLIMAX_HUD_FADE_TO_M = 200;
/** ★いちばん薄いときの濃さ。★デザイナー回答 D-5「コース図は 0.4」 */
export const CLIMAX_HUD_MIN_ALPHA = 0.4;

/**
 * ★**補助の HUD（コース図）の濃さ**（1 → 0.4）。
 * ⚠️ ★数を減らしません。★濃さだけです（★デザイナー回答 D-5）。
 */
export function climaxHudFade(metersLeft: number): number {
  if (!Number.isFinite(metersLeft)) return 1;
  const u = smooth((CLIMAX_HUD_FADE_FROM_M - metersLeft) / (CLIMAX_HUD_FADE_FROM_M - CLIMAX_HUD_FADE_TO_M));
  return 1 - (1 - CLIMAX_HUD_MIN_ALPHA) * u;
}

/* ───────────────────────── ★#10 勢い ───────────────────────── */

/**
 * ★勢いを出し始める残り距離（m）。
 * ⚠️ ★**残り 200m から**です（★レビュー側 Q-R8）。★それより手前は、表示位置が脚質の隊列から
 *    ★真の位置へ寄せていく途中で、★寄せの動きが勢いに混ざります（`formation.ts` の `CONVERGE_END_M`）。
 */
export const MOMENTUM_FROM_M = 200;
/** ★勢いを測る過去の窓（★レース秒）。★未来は読みません */
export const MOMENTUM_WINDOW_SEC = 0.5;
/** ★勢いの段階（★0 … 落ちている ／ 1 … 平ら ／ 2 … 伸びている ／ 3 … 強く伸びている） */
export type MomentumLevel = 0 | 1 | 2 | 3;

/**
 * ★**各馬の勢いの段階**（★全馬の中央の速さとの差で段を切る）。
 *
 * ⚠️ ★**段階に丸めます。** ★m/s は出しません（★レビュー側 §2-2 ③）。
 * ⚠️ ★入力は ★**描画に使っている位置**と、★その窓の前の同じ系の位置です（★R-30）。
 * ⚠️ ★全馬の中央との差で見るのは、★直線の全馬の減速を「全員が落ちている」と出さないためです。
 */
export function momentumLevels(
  now: readonly { readonly gate: number; readonly meters: number }[],
  ago: readonly { readonly gate: number; readonly meters: number }[],
  windowSec: number = MOMENTUM_WINDOW_SEC,
): ReadonlyMap<number, MomentumLevel> {
  const out = new Map<number, MomentumLevel>();
  if (!(windowSec > 0) || now.length === 0) return out;
  const agoOf = new Map(ago.map((h) => [h.gate, h.meters] as const));
  const speeds: { gate: number; v: number }[] = [];
  for (const h of now) {
    const a = agoOf.get(h.gate);
    if (a === undefined) continue;
    speeds.push({ gate: h.gate, v: (h.meters - a) / windowSec });
  }
  if (speeds.length === 0) return out;
  const sorted = speeds.map((s) => s.v).sort((x, y) => x - y);
  const mid = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]!
    : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  for (const s of speeds) {
    const rel = s.v - mid;
    out.set(s.gate, rel >= 0.6 ? 3 : rel >= 0.2 ? 2 : rel >= -0.2 ? 1 : 0);
  }
  return out;
}

/* ───────────────────────── ★#9 写真判定の止め絵 ───────────────────────── */

/** ★止める長さ（秒）。★スローモーションではなく ★**止め絵**です（★相談書 C-4） */
export const PHOTO_FINISH_HOLD_SEC = 0.4;
/** ★止め絵を出す着差の言葉（★着順ボードと同じ言葉・`marginLabel`） */
export const PHOTO_FINISH_LABELS: readonly string[] = ['同着', 'ハナ', 'アタマ', 'クビ'];

/**
 * ★**写真判定の止め絵を出すか**（★レビュー側 Q-R9 の (c)）。
 *
 *   ★判定は ★**先頭が決勝線を通過する瞬間の、描いている位置**（＝止める絵そのもの）で、
 *   ★1〜2 着の差を見ます。★映っていない接戦を作りません（★相談書 C-2）。
 *   ★差を秒に直す速さは、★**2 番手のその瞬間の速さ**です。★言葉は着順ボードと同じ関数から引きます（★D-052）。
 * ⚠️ ★ゴールの瞬間に出すので、★結果の先出しに当たりません（★レビュー側 §3-1）。
 */
export function photoFinishOf(
  positionsAtCross: readonly { readonly gate: number; readonly meters: number }[],
  secondSpeedMps: number,
  marginLabelOf: (gapSec: number) => string,
): { readonly show: boolean; readonly gapM: number; readonly label: string } | undefined {
  if (positionsAtCross.length < 2) return undefined;
  const sorted = [...positionsAtCross].sort((a, b) => b.meters - a.meters);
  const gapM = Math.max(0, sorted[0]!.meters - sorted[1]!.meters);
  const speed = secondSpeedMps > 1 ? secondSpeedMps : 16;
  const label = marginLabelOf(gapM / speed);
  return { show: PHOTO_FINISH_LABELS.includes(label), gapM, label };
}

/**
 * ★**写真判定の止め絵に重ねるもの**（★白い幕を一瞬 ・ ★決勝線の金の縦線 ・ ★「写真判定」の札）。
 * ⚠️ ★着差の言葉は ★**着順ボードと同じ値**を渡すこと（★レビュー側 §3-3 ④）。
 */
export function drawPhotoFinishOverlay<TImage>(
  ctx: Ctx2D<TImage>, font: FontOf,
  o: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly sinceSec: number;
    /** ★決勝線の画面の x（★馬を描いたのと同じカメラで投影した値）。★無ければ線を描かない */
    readonly goalX?: number | undefined;
    /** ★1〜2 着の着差の言葉（★着順ボードの値） */
    readonly marginLabel?: string | undefined;
  },
): void {
  const { width: W, height: H } = o.viewport;
  const prev = ctx.globalAlpha;
  /** ★入りの白い幕（★ハンドオフのカット替えと同じ濃さ・長さ） */
  if (o.sinceSec >= 0 && o.sinceSec < 0.05) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  if (o.goalX !== undefined && Number.isFinite(o.goalX) && o.goalX > -10 && o.goalX < W + 10) {
    ctx.fillStyle = 'rgba(201,162,39,0.9)';
    ctx.fillRect(Math.round(o.goalX) - 1, 0, 3, H);
  }
  const title = '写真判定';
  const sub = o.marginLabel === undefined ? undefined : o.marginLabel === '同着' ? '同着' : `${o.marginLabel}差`;
  ctx.font = font(Math.round(H * (24 / 720)), true);
  const tw = ctx.measureText(title).width;
  const chipW = Math.round(tw + 48);
  const chipH = Math.round(H * (44 / 720));
  const chipX = Math.round(W / 2 - chipW / 2);
  const chipY = Math.round(H * (40 / 720));
  ctx.fillStyle = 'rgba(13,18,24,0.82)';
  ctx.fillRect(chipX, chipY, chipW, chipH);
  ctx.fillStyle = HUD.gold;
  ctx.fillRect(chipX, chipY + chipH - 3, chipW, 3);
  ctx.textAlign = 'center';
  ctx.fillStyle = HUD.paper;
  ctx.fillText(title, Math.round(W / 2), chipY + Math.round(chipH * 0.68));
  if (sub !== undefined) {
    ctx.font = font(Math.round(H * (30 / 720)), true);
    if (ctx.strokeText !== undefined) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(3,7,5,.8)';
      ctx.strokeText(sub, Math.round(W / 2), chipY + chipH + Math.round(H * (40 / 720)));
    }
    ctx.fillStyle = HUD.gold;
    ctx.fillText(sub, Math.round(W / 2), chipY + chipH + Math.round(H * (40 / 720)));
  }
  ctx.textAlign = 'left';
  ctx.globalAlpha = prev;
}
