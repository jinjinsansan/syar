/**
 * ★**仔に名前を付ける画面が使う形**（★PLAN I-3・第 1 便の命名の画面・2026-09-24）
 *
 * 【★この層がしないこと】
 *   🔴 ★**名前の形を、ここで判定しません。** ★`checkPlayerHorseName`（`@star/sim-engine`）が判定します。
 *      ★画面とワーカーが ★**同じ関数**を呼ぶので、★「画面が通したのにサーバーが弾く」が起きません。
 *   🔴 ★**重複と禁止名（実在馬名）は、画面では分かりません。** ★DB と NG の一覧が要るので、
 *      ★**確定のときにワーカーが見ます**。★だから画面は「送ってみるまで分からない」形になります。
 *
 * 【★理由の語は画面に出しません】
 *   ★`name_taken` のような語ではなく、★**言葉**に写します（★第 1 便 §4 と同じ作法）。
 */
import { checkPlayerHorseName, PLAYER_NAME_MIN_CHARS, PLAYER_NAME_MAX_CHARS } from '@star/sim-engine';
import { authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

export { PLAYER_NAME_MIN_CHARS, PLAYER_NAME_MAX_CHARS };

/** ★名前を付ける前の仔（★`my_foal_drafts`・`0061` / `0076`） */
export interface FoalDraftView {
  readonly id: string;
  readonly sex: string;
  readonly sireName: string;
  readonly damName: string;
  readonly birthWeek: number;
  /** ★母の産駒の数（★`0076`）。★生まれた直後だけ「この仔の番号」と一致する */
  readonly damFoalCount: number;
}

/** ★名前が付かなかった理由の見せ方（★語は出さない） */
export type NameFailureVariant =
  /** ★形が違う（★文字・長さ）。★送る前に分かる */
  | 'shape'
  /** ★同じ名前の馬が既にいる */
  | 'taken'
  /** ★使えない名前（★実在の馬の名前など） */
  | 'blocked'
  /** ★その仔にはもう名前が付いている */
  | 'already'
  /** ★仔が見つからない */
  | 'missing'
  /** ★一時的な不具合（★利用者は悪くない） */
  | 'temp';

/** ★形の理由（★`PlayerNameRejection`）は、すべて「形が違う」に寄せる */
const SHAPE_REASONS: readonly string[] = [
  'empty', 'invalid_chars', 'length', 'too_short_normalized', 'reserved_prefix',
];

/**
 * ★**サーバーの理由 → 見せ方**（★写すだけ）。
 * ⚠️ ★知らない語は ★**`temp`**（★利用者のせいにしない）。
 *    ★`apps/cli/test/name-screen-wiring.test.ts` が、★ワーカーの型と突き合わせて分類漏れを落とします。
 */
export function nameFailureOf(reason: string | null): NameFailureVariant {
  if (reason === null) return 'temp';
  if (SHAPE_REASONS.includes(reason)) return 'shape';
  if (reason === 'name_taken') return 'taken';
  if (reason === 'name_blocked') return 'blocked';
  if (reason === 'already_named') return 'already';
  if (reason === 'draft_not_found') return 'missing';
  return 'temp';
}

/**
 * ★**送る前に分かることだけを見る**（★形だけ）。
 * ⚠️ ★`ok` でも ★**通るとは限りません**（★重複・禁止名は確定のときに分かる）。
 *    ★画面に「使えます」と出さないこと。
 */
export function nameShapeOf(input: string): { readonly ok: boolean; readonly variant: NameFailureVariant | null } {
  const r = checkPlayerHorseName(input);
  return r.ok ? { ok: true, variant: null } : { ok: false, variant: nameFailureOf(r.reason) };
}

/** ★`my_foal_drafts()` の 1 行 */
interface FoalDraftRow {
  readonly draft_id: string;
  readonly sex: string;
  readonly sire_name: string;
  readonly dam_name: string;
  readonly birth_week: number | string;
  readonly named_horse_id: string | null;
  readonly dam_foal_count: number | string;
}

/** ★**名前を付ける前の仔を読む**（★名前が付いた仔は返さない） */
export async function loadFoalDrafts(): Promise<readonly FoalDraftView[]> {
  const auth = authClient();
  const { data: sessionData } = await auth.auth.getSession();
  if (sessionData.session === null) throw new SignInRequiredError();
  const { data, error } = await auth.rpc('my_foal_drafts');
  if (error !== null) throw new Error(`名前を付ける前の仔を読めませんでした: ${error.message}`);
  return ((data ?? []) as readonly FoalDraftRow[])
    .filter((r) => r.named_horse_id === null)
    .map((r) => ({
      id: r.draft_id,
      sex: r.sex,
      sireName: r.sire_name,
      damName: r.dam_name,
      birthWeek: Number(r.birth_week),
      damFoalCount: Number(r.dam_foal_count),
    }));
}

/** ★依頼の状態（★`my_foal_request`・`0076` で `stud_fee_ep` が付いた） */
export interface NameRequestState {
  readonly status: 'pending' | 'done' | 'failed';
  readonly failure: NameFailureVariant | null;
  /** ★名前が付いた馬の id（★成功したときだけ） */
  readonly horseId: string | null;
  readonly createdAtMs: number;
}

/**
 * ★**名前を送る**（★依頼 → ワーカーが確定）。
 * ⚠️ ★`requestId` は ★**押すたびに変えない**（★再送には前の結果が返る）。
 * ⚠️ ★受付でその場で弾かれるもの（★長すぎる・他人の仔・既に名前がある）は ★**例外**で返ります。
 */
export async function requestFoalName(input: {
  readonly requestId: string;
  readonly draftId: string;
  readonly name: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: NameFailureVariant }> {
  const { error } = await authClient().rpc('request_foal_name', {
    p_request_id: input.requestId,
    p_draft_id: input.draftId,
    p_name: input.name,
  });
  if (error === null) return { ok: true };
  const code = String((error as { code?: string }).code ?? '');
  // ★ST031 長すぎる ／ ST032 その仔には付けられない ／ ST033 既に名前がある
  if (code === 'ST031') return { ok: false, failure: 'shape' };
  if (code === 'ST032') return { ok: false, failure: 'missing' };
  if (code === 'ST033') return { ok: false, failure: 'already' };
  return { ok: false, failure: 'temp' };
}

/** ★依頼 1 件の状態を読む（★待ちの画面が繰り返し呼ぶ） */
export async function loadNameRequest(requestId: string): Promise<NameRequestState | null> {
  const { data, error } = await authClient().rpc('my_foal_request', { p_request_id: requestId });
  if (error !== null) throw new Error(`依頼の状態を読めませんでした: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    readonly status?: string; readonly failure_reason?: string | null;
    readonly result_id?: string | null; readonly created_at?: string;
  } | undefined;
  if (row === undefined) return null;
  const status = row.status === 'done' || row.status === 'failed' ? row.status : 'pending';
  return {
    status,
    failure: status === 'failed' ? nameFailureOf(row.failure_reason ?? null) : null,
    horseId: row.result_id ?? null,
    createdAtMs: row.created_at === undefined ? 0 : new Date(row.created_at).getTime(),
  };
}
