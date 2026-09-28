/**
 * ★**小窓（常設の帯）の中で ★本編 `/race` を流す約束**（★2026-09-28・オーナー依頼「小窓でパドックからリプレイまで」）
 *
 * 【★なぜ 1 つのファイルか】
 *   ★帯（`race-strip.tsx`）と ★本編（`app/race/page.tsx`）が ★**同じ名前と同じ判定**を import します（★D-052）。
 *   ★片方だけ書き換えて ★黙って繋がらなくなる、を ★構造で防ぎます（★網 `race-strip-embed.test.ts`）。
 *
 * 【★流れ】
 *   ① ★帯が ★新しい確定レースの録画を始めたら ★`/race?race=<id>&embed=strip` を ★見えない iframe で開く
 *   ② ★本編は ★画布だけのステージで ★自動で流し（★ボタン・確定カード・音なし）、★`playing` を知らせる
 *   ③ ★帯は `playing` を受けて ★初めて iframe を見せる（★それまでは今の走行を出したまま ＝ ★「用意しています」で待たせない）
 *   ④ ★本編が `ended`（★着順ボードまで流し終えた）か ★`error` を知らせたら ★帯は iframe を閉じる
 *   ⚠️ ★知らせは ★**同じ origin からのものだけ**受けます（★よそのページの知らせで帯を動かさない）。
 */

/** ★`?embed=` の値 */
export const STRIP_EMBED_PARAM_VALUE = 'strip';

export type StripEmbedEvent = 'playing' | 'ended' | 'error';

export interface StripEmbedMessage {
  readonly source: 'star-race';
  readonly type: StripEmbedEvent;
  readonly raceId: string | null;
  /**
   * ★`error` の理由（★本編が画面に出す文と同じ）。★帯は ★これを 1 行で出します（★黙って簡易版に戻らない・2026-09-28）。
   *   ⚠️ ★最初は理由を運ばず、★オーナーの画面で本編が出ない原因を ★誰も見られませんでした。
   */
  readonly detail: string | null;
}

/** ★帯が開く本編の URL（★確定済みの実レースだけ） */
export function stripEmbedUrl(raceId: string): string {
  return `/race?race=${encodeURIComponent(raceId)}&embed=${STRIP_EMBED_PARAM_VALUE}`;
}

export function stripEmbedMessage(type: StripEmbedEvent, raceId: string | null, detail: string | null = null): StripEmbedMessage {
  return { source: 'star-race', type, raceId, detail };
}

/** ★受けた知らせが ★この約束の形か（★形が違えば 無視する） */
export function isStripEmbedMessage(value: unknown): value is StripEmbedMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['source'] === 'star-race'
    && (v['type'] === 'playing' || v['type'] === 'ended' || v['type'] === 'error')
    && (v['raceId'] === null || typeof v['raceId'] === 'string')
    && (v['detail'] === null || typeof v['detail'] === 'string');
}

/**
 * ★**帯 → 本編の知らせ**（★2026-09-28）: ★停止スイッチ（`.u-paused`）で ★本編も止める・★戻したら続ける（★資料 §5-7「動きを全部止める」）。
 *   ⚠️ ★最初は ★帯の文字だけ止まり、★iframe の本編は流れ続けていました。
 */
export interface StripControlMessage {
  readonly source: 'star-strip';
  readonly type: 'pause' | 'resume';
}

export function stripControlMessage(type: StripControlMessage['type']): StripControlMessage {
  return { source: 'star-strip', type };
}

export function isStripControlMessage(value: unknown): value is StripControlMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['source'] === 'star-strip' && (v['type'] === 'pause' || v['type'] === 'resume');
}

/** ★帯に出す 1 行（★長い理由は切る・★「本編」とは名乗らない） */
export function stripEmbedNote(kind: 'error' | 'late', detail: string | null, waitedSec: number): string {
  if (kind === 'late') return `録画の用意が間に合いませんでした（${waitedSec} 秒）`;
  const why = (detail ?? '理由不明').replace(/\s+/g, ' ').slice(0, 60);
  return `録画を出せませんでした: ${why}`;
}

/**
 * ★**安全の打ち切り（秒）**。★本編が `ended` も `error` も言わないまま ★この秒数を過ぎたら ★帯が閉じます。
 *   ★本編は ★開いてから 32.4 秒で発走・★本編 ＋ 寄り ＋ リプレイ ＋ 着順ボードで ★数分（★実測は本番でしか取れない）。
 *   ★長めにとり、★「終わらない小窓」だけを防ぎます。
 */
export const STRIP_EMBED_GIVE_UP_SEC = 360;
