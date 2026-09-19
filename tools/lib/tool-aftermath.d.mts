/**
 * ★`tool-aftermath.mjs` の型（★**TL-1**・2026-09-19）。
 *
 * ⚠️ ★`classification.d.mts` / `open-findings.d.mts` と同じ作法です — ★道具は `.mjs`、★型はここ。
 * ⚠️ ★**中身を写しません**（★一覧は `.mjs` が持ちます・D-052）。★ここは形だけです。
 */

/**
 * ★後始末の作法。
 *
 * ★`restores` … ★戻す。★**戻したことを数える**こと（★`sandboxTx` の SB-3、または自前の照合）
 * ★`consumes` … ★使い切る。★**何を消費するかを宣言**すること
 *                （⚠️ ★悪いことではありません。★悪いのは**黙って**消費すること・R-27）
 * ★`pending`  … 🔴 ★**片付けるが、片付いたことを数えていない**。
 *                ⚠️ ★**「3 つ目の正しい状態」ではありません。★空にするのが目標**です。
 */
export type AftermathMode = 'restores' | 'consumes' | 'pending';

export interface Aftermath {
  readonly mode: AftermathMode;
  /** ★なぜその作法なのか（★`consumes` なら**何を消費するか**） */
  readonly why: string;
  /**
   * ★`restores` のうち ★**`sandboxTx` を使わないもの**に必須。
   *
   * ★**戻ったことを数えている行の写し**（★道具の源にそのまま含まれること）。
   * 🔴 ★語の一覧で探す形は **R-29 で漏れました** — ★`verify-a2.mjs` を誤って落とした。
   * → ★**主張に引用を付ける**（AU-7）。★コードが変われば引用が壊れ、★検査が落ちます。
   */
  readonly countedBy?: string;
}

/** ★`tools/` からの相対パス → 後始末の作法 */
export const TOOL_AFTERMATH: Readonly<Record<string, Aftermath>>;
