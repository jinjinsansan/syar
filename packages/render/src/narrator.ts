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

/**
 * ★誰が喋る局面か（仕様 `narrator-cast` の「出る局面」）。
 *
 *   A 実況 星野 亮太   … レース中ずっと
 *   B 解説 大鷹 源三   … 最後の直線・ゴール後の一言
 *   C 進行 遠山 かなえ … 発走前の紹介・着順確定の締め
 *   D 現地 南 ひかる   … パドック・ゲート入り
 */
export type NarratorCast = 'a' | 'b' | 'c' | 'd';

export const NARRATOR_NAMES: Readonly<Record<NarratorCast, string>> = {
  a: '星野 亮太', b: '大鷹 源三', c: '遠山 かなえ', d: '南 ひかる',
};
export const NARRATOR_ROLES: Readonly<Record<NarratorCast, string>> = {
  a: '実況', b: '解説', c: '進行', d: '現地',
};

/**
 * ★**1 レースに 1 人**（オーナー指示 2026-08-22「ナレーターは 1 レースで 1 人でいいです」）。
 *
 * ⚠️ ★一度は局面ごとに替える形にしました（ゲート入り＝現地／直線＝解説）。
 *    仕様カードの「出る局面」をそのまま実装したものですが、**1 レースの中で話者が替わると
 *    落ち着きません。** 4 名は**レースごとに交代**させ、レース中は替えません。
 *
 * ★誰になるかは**レースのシードから決定論**で決めます（乱数は使わない・憲法 4）。
 *   同じレースを見直せば必ず同じ人が出ます。
 */
export function narratorCastForRace(seed: number): NarratorCast {
  const casts: readonly NarratorCast[] = ['a', 'b', 'c', 'd'];
  // ★シードを軽く撹拌してから割り当てる（連番のレースで同じ人が続かないように）
  const mixed = Math.abs(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  return casts[mixed % casts.length] ?? 'a';
}

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
