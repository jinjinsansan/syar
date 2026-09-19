/**
 * ★`broad-deletes.mjs` の型（★`CLEANUP-NO-RECORD`・2026-09-19）。
 *
 * ⚠️ ★`classification.d.mts` / `tool-aftermath.d.mts` と同じ作法です — ★道具は `.mjs`、★型はここ。
 * ⚠️ ★**中身（一覧）を写しません**（D-052）。★ここは形だけです。
 *
 * 🔴 ★**この `.d.mts` を忘れると型検査が TS7016 で落ちます。** ★2026-09-19 に 2 回 やりました
 *   （★`tool-restores.d.mts` と、★これ）。★門が両方 止めたので、★規則は足しません（★**NT-10**）。
 */

/** ★1 本の道具の「広い `delete`」の登録 */
export interface BroadDeleteEntry {
  /**
   * ★機械が拾う形の**件数**。
   * 🔴 ★**増えたら検査が落ちます**（★既存の道具に黙って足せない）。
   */
  readonly sites: number;
  /**
   * ★**何をどう残すか。★残さないなら、なぜ要らないか。**
   * ⚠️ ★空で登録して閉じないこと（★**NT-2**）。★検査が長さを見ています。
   */
  readonly records: string;
}

/** ★道具の名前 → ★登録。★`broad-deletes.test.ts` が全数登録を要求する */
export declare const BROAD_DELETES: Readonly<Record<string, BroadDeleteEntry>>;
