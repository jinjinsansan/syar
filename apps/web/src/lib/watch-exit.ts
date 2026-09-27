/**
 * ★**`/watch-race`（レースを見る）の出口**（★2026-09-27・裁定 `REVIEW_ALWAYS_VISIBLE_RACE_20260927.md` §6-1 の (c)）
 *
 * ★要求: ★**出口は ★走っている物か ★走っていないと言う物の ★どちらかに着く**（★デモの綴りではなく ★行き先の振る舞い）。
 *   ① ★未ログイン → ★デモの中継（★「デモ」と明示・★2026-09-17 のオーナー指示 B-1 を壊さない・★TOP の入口もここ）
 *   ② ★ログイン済み ＋ ★録画の窓が開いている → ★その実レースを ★帯の拡大（★段 A）で
 *   ③ ★ログイン済み ＋ ★窓の外 → ★「いま走っていません」＋ ★次の発走（★デモに送らない）
 * ⚠️ ★これは ★オーナーが覆せる暫定です（★裁定 §6-1）。
 */
export type WatchExit =
  | { readonly kind: 'demo'; readonly href: string }
  | { readonly kind: 'expand' }
  | { readonly kind: 'idle'; readonly nextAt: string | null };

/** ★未ログインの人の中継の戻り先（★`/race` の `RETURN_ROUTES` に在ること・網が見る） */
export const GUEST_DEMO_HREF = '/race?return=/watch-race';

export function watchExitOf(signedIn: boolean, replaying: boolean, nextAt: string | null): WatchExit {
  if (!signedIn) return { kind: 'demo', href: GUEST_DEMO_HREF };
  return replaying ? { kind: 'expand' } : { kind: 'idle', nextAt };
}
