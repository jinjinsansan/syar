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
 * ★**レース時間で何秒ぶんを見せるか**（秒）。
 *   ★`FINISH_REPLAY_DISPLAY_SEC` より短いので、★**スローになります**（4.0 / 2.0 ＝ 半速）。
 *   ⚠️ ★スローは「巻き戻して見せている」ことの合図でもあります。等速だと本編の続きに見えます。
 */
export const FINISH_REPLAY_RACE_SEC = 2.0;

export interface FinishReplayState {
  /** ★リプレイの区間にいるか */
  readonly active: boolean;
  /** ★いま見せるレース秒（`active` のときだけ意味を持つ） */
  readonly raceSec: number;
  /** ★区間の進み（0→1）。テロップの出し入れに使う */
  readonly progress: number;
}

const IDLE: FinishReplayState = { active: false, raceSec: 0, progress: 0 };

/**
 * ★**表示秒 → リプレイの状態**。
 *
 * @param raceDisplaySec  イントロを除いた表示秒（`page.tsx` の `raceD`）
 * @param mainDisplaySec  本編の表示の長さ（`warp.displaySec`）
 * @param postRaceSec     本編のあとの区間（勝馬の寄り＋着順ボード）
 * @param finishRaceSec   ★**勝馬がゴールしたレース秒**。ここから遡って見せる
 *
 * ⚠️ ★`finishRaceSec` は**確定した結果**から取ること。見た目の順位から決めないこと。
 */
export function finishReplayAt(
  raceDisplaySec: number,
  mainDisplaySec: number,
  postRaceSec: number,
  finishRaceSec: number,
): FinishReplayState {
  const from = mainDisplaySec + postRaceSec;
  const into = raceDisplaySec - from;
  if (!(into >= 0)) return IDLE;
  if (into > FINISH_REPLAY_DISPLAY_SEC) {
    /**
     * ★**区間を過ぎたら終わります。**
     *
     * ⚠️ ★最初ここを `active: true` のままにしていました。「ゴールの瞬間で止める」つもりでしたが、
     *    ★**リプレイが終わらず、着順ボードが最後まで出ませんでした**（実画面 55s で確認・2026-08-28）。
     *    ★「止める」と「続けている」を同じ真偽値で表そうとしたのが誤りです。
     *    ★止めるのは**レース秒**（`finishRaceSec` を返す）で足り、★区間は閉じます。
     */
    return { active: false, raceSec: finishRaceSec, progress: 1 };
  }
  const progress = FINISH_REPLAY_DISPLAY_SEC <= 0 ? 1 : into / FINISH_REPLAY_DISPLAY_SEC;
  /** ★ゴールの `FINISH_REPLAY_RACE_SEC` 秒前から、ゴールまでを等速で送る */
  const raceSec = Math.max(0, finishRaceSec - FINISH_REPLAY_RACE_SEC * (1 - progress));
  return { active: true, raceSec, progress };
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
