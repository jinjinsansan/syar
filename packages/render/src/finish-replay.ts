/**
 * ★**ゴール前の数秒を、大きく撮り直して本編の後ろへ繋ぐ**（表示専用・2026-08-28）
 *
 * 【なぜ要るか】オーナー要望:
 *   > 最後の直線で馬が小さくなるが、**ゴールする数秒だけリプレイで馬を巨大化した状態でも
 *   > 映像を繋げて**欲しい
 *
 * 【★本編には一切触れません】
 *   ⚠️ ★これは**本編が終わったあとに足す別の区間**です。本編の時間軸・カット割り・
 *      カメラを 1 つも変えません。したがって
 *      ★**着順・走破タイム・着差・払戻に定義上触れません**（憲法 3）。
 *   ⚠️ ★`climax-choreography` とは別物です。あちらは**馬そのものを動かす**ため
 *      見かけの速度が **+13.3% / −14.8%** ずれてオーナー不合格になりました
 *      （2026-08-27 に既定から外しました）。★こちらは**同じ位置モデルを時間だけ巻き戻して
 *      もう一度読む**だけなので、その形にはなりません。
 *
 * 【★決定論】
 *   ⚠️ ★`Date.now()` / `Math.random()` を使いません。表示秒だけで決まります（憲法 4）。
 *      同じシードなら同じリプレイになります。
 */

import type { Ctx2D, FontOf, Viewport2D } from './oblique-draw.js';

/**
 * ★**リプレイの表示の長さ**（秒）。
 *   ⚠️ ★長くすると「終わったのに終わらない」になります。参考の中継も決着の直後は短い。
 */
export const FINISH_REPLAY_DISPLAY_SEC = 4.0;
/**
 * ★**本編の終わりから何秒ぶんを巻き戻すか**（本編の表示秒）。
 *   ★直線は実時間なので、2.0 秒 ≒ 34m。ゴール前の攻防がちょうど入ります。
 */
export const FINISH_REPLAY_SOURCE_SEC = 2.0;
/**
 * ★**ゴール板を通り過ぎるところまで見せる**（本編の表示秒）。
 *
 * ⚠️ ★これが無いと**ゴールの瞬間が映りません。** 実際にそうなっていました（2026-08-28）:
 *    ★リプレイは残り 43.1m から始まり、★**残り 8.3m で終わって**いました。
 *    ★8.3m の正体は `broadcastV2StartLagM` が**レース中ずっと引いている発走の遅れ**
 *    （15.6 × 1.6 ÷ 3 ＝ 8.32m）です。位置モデルは 1600m で頭打ちなので、
 *    ★**表示位置は 1600m に永久に届きません。** 本編ではゴール後の「流し」がその先を作ります。
 *    → ★**本編の終わりより後ろまで含める**ことで、その流しごと見せます。
 */
export const FINISH_REPLAY_TAIL_SEC = 0.6;

export interface FinishReplayState {
  /** ★リプレイの区間にいるか */
  readonly active: boolean;
  /**
   * ★**いま見せる「本編の表示秒」**（`active` のときだけ意味を持つ）。
   *
   * ★★レース秒ではなく**表示秒**を返すのが要点です。★呼ぶ側はこれを本編とまったく同じ
   *   経路（時間ワープ → 位置モデル → 発走の遅れ → ゴール後の流し）に通せばよく、
   *   ★**リプレイ専用の分岐を持ちません。**
   * ⚠️ ★以前はレース秒を返していました。そのため呼ぶ側が「流しを掛けない」という
   *    ★**本編と違う扱い**を持つことになり、★ゴールの手前で切れていました。
   */
  readonly sourceDisplaySec: number;
  /** ★区間の進み（0→1）。テロップの出し入れに使う */
  readonly progress: number;
}

const IDLE: FinishReplayState = { active: false, sourceDisplaySec: 0, progress: 0 };

/**
 * ★**表示秒 → リプレイの状態**。
 *
 * @param raceDisplaySec   イントロを除いた表示秒（`page.tsx` の `raceD`）
 * @param mainDisplaySec   本編の表示の長さ（`warp.displaySec`）
 * @param winnerFollowSec  本編のあとの勝馬の寄りの長さ（リプレイはその直後）
 */
export function finishReplayAt(
  raceDisplaySec: number,
  mainDisplaySec: number,
  winnerFollowSec: number,
  /**
   * ★**勝馬が決勝線を通る表示秒**（`finishCrossDisplaySec` で求める）。
   *
   * ⚠️ ★**本編の終わり（`mainDisplaySec`）ではありません。** あれは
   *    ★**最後の 1 頭**がゴールする時刻です。実測（seed 42）: 勝馬の通過は **35.95s**、
   *    ★本編の終わりは **38.78s** で **2.84 秒**離れています。
   *    ★本編の終わりを基準にしたら、リプレイは**勝馬が通り過ぎた後から**始まりました。
   */
  crossDisplaySec: number,
): FinishReplayState {
  const from = mainDisplaySec + winnerFollowSec;
  const into = raceDisplaySec - from;
  if (!(into >= 0)) return IDLE;
  const span = FINISH_REPLAY_SOURCE_SEC + FINISH_REPLAY_TAIL_SEC;
  const endSource = crossDisplaySec + FINISH_REPLAY_TAIL_SEC;
  if (into > FINISH_REPLAY_DISPLAY_SEC) {
    /**
     * ★**区間を過ぎたら終わります。**
     * ⚠️ ★最初ここを `active: true` のままにしていました。「ゴールの瞬間で止める」つもりでしたが、
     *    ★**リプレイが終わらず、着順ボードが最後まで出ませんでした**（実画面で確認・2026-08-28）。
     *    ★「止める」と「続けている」を同じ真偽値で表そうとしたのが誤りです。
     */
    return { active: false, sourceDisplaySec: endSource, progress: 1 };
  }
  const progress = FINISH_REPLAY_DISPLAY_SEC <= 0 ? 1 : into / FINISH_REPLAY_DISPLAY_SEC;
  /** ★ゴール前 `SOURCE` 秒から、ゴールを通り過ぎる `TAIL` 秒までを等速で送る（＝スロー） */
  return { active: true, sourceDisplaySec: endSource - span * (1 - progress), progress };
}

/**
 * ★**勝馬が決勝線を通る「表示秒」を求める**（二分探索・決定論）。
 *
 *   ★位置モデルは `distanceMeter` で頭打ちなので、★**最初に届いた時刻**を探します。
 * ⚠️ ★`Date.now()` も乱数も使いません。渡された関数だけで決まります（憲法4）。
 */
export function finishCrossDisplaySec(
  metersAtDisplaySec: (displaySec: number) => number,
  distanceMeter: number,
  maxDisplaySec: number,
): number {
  let lo = 0;
  let hi = maxDisplaySec;
  if (!(metersAtDisplaySec(hi) >= distanceMeter - 1e-9)) return maxDisplaySec;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (metersAtDisplaySec(mid) >= distanceMeter - 1e-9) hi = mid; else lo = mid;
  }
  return hi;
}

/** ★リプレイ全体の長さ（本編＋後処理のあとに足す秒数） */
export const finishReplayTotalSec = (): number => FINISH_REPLAY_DISPLAY_SEC;

/**
 * ★**画面全体の表示の長さ**（イントロ＋本編＋勝馬の寄り・着順ボード＋リプレイ）。
 *
 * ⚠️ ★同じ式を画面と道具の 2 か所に持たないために、ここに置きます（D-052 / R-30）。
 *    ★実際に `tools/capture-overhead-stride.mjs` が「イントロ＋本編」だけで総尺を持っており、
 *    ★リプレイ区間を**撮ろうとしても範囲外に丸められて 0 コマ**になりました。
 */
export function raceTotalDisplaySec(
  introSec: number, mainDisplaySec: number, postRaceSec: number,
): number {
  return introSec + mainDisplaySec + postRaceSec + FINISH_REPLAY_DISPLAY_SEC;
}

/**
 * ★**「リプレイ」であることを画面に出す**（2026-08-28・オーナー指摘③）。
 *
 *   > リプレイ中にリプレイと表示されていないのでリプレイかどうかわからない（カットイン入れるべき）
 *
 * ★実際の中継と同じく**画面の上に出しっぱなし**にします。
 *   ⚠️ ★点滅させません。★見た人が「いつ出たか」を探す必要が無いようにするためです。
 * ⚠️ ★入りだけ短く溶かします（`progress` の関数なので決定論・憲法4）。
 */
export function drawFinishReplayBadge<TImage>(
  ctx: Ctx2D<TImage>,
  vp: Viewport2D,
  font: FontOf,
  progress: number,
  colors: { readonly plate: string; readonly text: string; readonly accent: string },
): void {
  const fade = Math.max(0, Math.min(1, progress / 0.08));
  const ease = 1 - (1 - fade) ** 3;
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * ease;

  const label = 'リプレイ';
  const px = 26;
  ctx.font = font(px, true);
  const textW = ctx.measureText(label).width;
  const padX = 22, h = 46, bar = 6;
  const w = textW + padX * 2 + bar;
  const x = Math.round((vp.width - w) / 2);
  /** ★上に出す。順位表（右上）とレース名（左上）を避けて中央に置く */
  const y = 24 - 10 * (1 - ease);

  ctx.fillStyle = colors.plate;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(x, y, bar, h);
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + bar + (w - bar) / 2, y + h / 2 + px * 0.36);

  ctx.globalAlpha = baseAlpha;
}
