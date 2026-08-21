/**
 * ★実況の立ち絵を選ぶ（表情と口の開閉）
 *
 * 【仕様】`design/hud-ds/components/narrator-cast/index.html`
 *   表情 3（通常／熱／絶叫）× 口 2（閉／開）= 6 枚
 *   ★**口パクは同一頭部で口だけ差し替え（頭が動かないこと）**
 *     素材は `tools/slice-narrator.mjs` が、閉じた絵を土台に**口の矩形だけ**を貼って作ります。
 *
 * ⚠️ ★`Date.now()` も乱数も使いません（憲法 4）。**表示時刻から決定論**で決めます。
 *    撮影用シークで時刻を戻しても同じ絵になります。
 */

export type NarratorExpression = 'normal' | 'hot' | 'shout';

export interface NarratorSet<TImage> {
  readonly normal: { readonly closed: TImage; readonly open: TImage };
  readonly hot: { readonly closed: TImage; readonly open: TImage };
  readonly shout: { readonly closed: TImage; readonly open: TImage };
}

/**
 * ★表情は**残り距離**で決めます。
 *   序盤は通常、勝負所（残り 600m）で熱、ゴール前（残り 160m）で絶叫。
 *   ⚠️ 残り 160m は `GOAL_REAL_TIME_M`（ゴール前を実時間で見せる区間）と同じ値です。
 *      **絶叫は、脚が実速に戻る区間と一致します。**
 */
export function narratorExpressionAt(metersLeft: number): NarratorExpression {
  if (metersLeft <= 160) return 'shout';
  if (metersLeft <= 600) return 'hot';
  return 'normal';
}

/** ★口の開閉。1 秒に 4 往復（喋りの速さ）。喋っていないときは閉じたまま */
export function narratorMouthOpenAt(displaySec: number, speaking: boolean): boolean {
  return speaking && Math.floor(displaySec * 8) % 2 === 0;
}

/**
 * ★描く 1 枚を選ぶ。素材が揃っていなければ `fallback` を返す
 *   （読み込み失敗で演出が止まらないように）。
 */
export function narratorPortrait<TImage extends { readonly width: number; readonly height: number }>(
  fallback: TImage,
  set: NarratorSet<TImage> | undefined,
  opts: { readonly metersLeft: number; readonly displaySec: number; readonly speaking: boolean },
): { readonly image: TImage; readonly width: number; readonly height: number } {
  if (set === undefined) return { image: fallback, width: fallback.width, height: fallback.height };
  const pair = set[narratorExpressionAt(opts.metersLeft)];
  const image = narratorMouthOpenAt(opts.displaySec, opts.speaking) ? pair.open : pair.closed;
  return { image, width: image.width, height: image.height };
}
