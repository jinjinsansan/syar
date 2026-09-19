/**
 * ★`tool-restores.mjs` の型（★**SB-6**・2026-09-19）。
 *
 * ⚠️ ★`classification.d.mts` / `snapshot-file.d.mts` と同じ作法です — ★中身は `.mjs` が持ちます（D-052）。
 */

/** ★戻すときに渡す client の、★**使うところだけ**（★`pg.Client` 全部は要りません） */
export interface RestoreClient {
  query(
    sql: string,
    params: readonly unknown[],
  ): Promise<{ readonly rowCount: number | null }>;
}

/** ★1 本の道具の「控えの名前」と「戻し方」 */
export interface ToolRestore<TData = unknown> {
  /** ★`tmp/snapshots/<name>.json` の名前 */
  readonly snapshot: string;
  /** ★どの道具のものか（★`classification.mjs` / `tool-aftermath.mjs` と同じ綴り） */
  readonly tool: string;
  /**
   * ★控えの中身を使って元に戻す。
   * 🔴 ★**冪等であること** — ★一部だけ適用済みで残ることがあります。
   */
  restore(client: RestoreClient, data: TData): Promise<{ readonly rows: number }>;
}

/** ★`verify-g6.mjs`: ★NPC 馬 1 頭の所属厩舎を戻す */
export declare const RESTORE_G6: ToolRestore<{
  readonly horseId: string;
  readonly npcStableId: number | string;
  readonly uid: string;
}>;

/** ★`verify-prize.mjs`: ★出走表の「最終枠を除く全頭」を、★**それぞれ元の厩舎へ**戻す */
export declare const RESTORE_PRIZE: ToolRestore<{
  /** ★`[馬 id, 元の npc_stable_id]` の組。★厩舎は馬ごとに違う */
  readonly horses: readonly (readonly [string, number | string])[];
  readonly uid: string;
}>;

/** ★道具の名前 → ★戻し方 */
export declare const TOOL_RESTORES: Readonly<Record<string, ToolRestore<never>>>;
