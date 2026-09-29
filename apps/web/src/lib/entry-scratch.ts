/**
 * ★**出走の取消**（★2026-09-29・正典 D-123 ①・レビュー側の指示）
 *
 * ★口は 3 つ（★どれもサーバー・★画面は時刻で判定しない）:
 *   `my_open_entries`（`0097`）… ★本人の馬の まだ取消になっていない登録と ★レースの段
 *   `request_entry_scratch`（`0079`）… ★依頼を積む（★段が `announced` の間だけ受ける）
 *   `my_entry_scratch`（`0079`）… ★依頼の結果（★確定はワーカーの `scratchEntry`・★返金は既存の経路）
 *
 * ⚠️ ★失敗の文言は ★サーバーのものをそのまま出す（★推測で言い換えない）。
 */
import { authClient } from './supabase';

export interface OpenEntry {
  readonly entryId: string;
  readonly raceId: string;
  readonly horseId: string;
  /** ★サーバーの段（★取り消せるのは `announced` の間だけ） */
  readonly raceStatus: string;
}

/** ★取り消せる段（★判定の本体は `request_entry_scratch`・★ここは押せるかの下見） */
export const SCRATCHABLE_RACE_STATUS = 'announced';

export async function loadMyOpenEntries(): Promise<readonly OpenEntry[]> {
  const auth = authClient();
  const { data: sess } = await auth.auth.getSession();
  if (sess.session === null) return [];
  const { data, error } = await auth.rpc('my_open_entries');
  // ⚠️ ★失敗を空にしない（★「登録が無い」に見えてしまう）
  if (error !== null) throw new Error(`登録を読めませんでした: ${error.message}`);
  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    entryId: String(row['entry_id']), raceId: String(row['race_id']),
    horseId: String(row['horse_id']), raceStatus: String(row['race_status']),
  }));
}

export type ScratchState = 'pending' | 'done' | 'failed';

export async function requestEntryScratch(requestId: string, entryId: string): Promise<
  { readonly ok: true; readonly status: ScratchState } | { readonly ok: false; readonly message: string }
> {
  const { data, error } = await authClient().rpc('request_entry_scratch', { p_request_id: requestId, p_entry_id: entryId });
  if (error !== null) return { ok: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return { ok: false, message: '取消の依頼を受け付けられませんでした' };
  if (row.status === 'failed') return { ok: false, message: String(row.failure_reason ?? '取消できませんでした') };
  return { ok: true, status: row.status as ScratchState };
}

export async function readEntryScratch(requestId: string): Promise<{ readonly status: ScratchState; readonly failureReason: string | null } | null> {
  const { data, error } = await authClient().rpc('my_entry_scratch', { p_request_id: requestId });
  if (error !== null) throw new Error(`取消の結果を読めませんでした: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return null;
  return { status: row.status as ScratchState, failureReason: row.failure_reason === null ? null : String(row.failure_reason) };
}
