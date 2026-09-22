/**
 * ★**仔の命名の確定**（★PLAN I-3・正典 D-120・2026-09-22）。
 *
 * 【★何をするか】（★裁定 `REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md` §1・§2 ／ `REVIEW_I3_NAMING_VERDICT_20260922.md` §4）
 *   ★利用者の RPC（`request_foal_name`・移行 `0065`）は ★命名の要求を積むだけ。
 *   ★ここが ★名前の形（`checkPlayerHorseName`）・★重複（`name_key`）・★禁止名（実在馬名）を判定し、
 *   ★通れば ★下書き（`foal_drafts.record`）から ★`horses` に 1 行入れる。★`horses` に書く ★4 か所目（段 0）。
 *
 * 【★1 件の要求は 1 取引】
 *   ★要求 → 下書き の順にロック → 判定 → `horses` に挿入 → 下書きに `named_horse_id` → 要求を完了。
 *   ★この関数は ★取引に触りません（★呼ぶ側 `runPlayerBreeding` が張る・★実演が包んで戻せるように）。
 *
 * 【★命名は「失敗」にしてよい】
 *   ★配合と違い、★命名の判定に落ちても ★引き直しの得はありません（★仔の中身は確定済みで変わらない）。
 *   ★だから ★判定に落ちたら理由を付けて `failed`。★利用者は別の名前で要求し直せます。
 *
 * 【⚠️ ★命名が 78 週より遅れた場合】（★裁定 `ff7028c` §5）
 *   ★`last_processed_week` は ★下書きの値（★誕生週 ＋ 78）のまま入れます。★欠けた週は週送りの追いつきが処理し、
 *   ★**その週ぶんの調教費がまとめて引き落とされます**。★画面で知らせる要件（★デザイナーの成果物で入れる）。
 */
import type pg from 'pg';

import { checkPlayerHorseName, normalizeName } from '@star/sim-engine';
import type { NameBlocklist, PlayerNameRejection } from '@star/sim-engine';
import { loadNameBlocklist } from '../../cli/src/name-blocklist.js';

/** ★命名の失敗の理由（★画面はこの語を読んで出す・★黙って消さない） */
export type FoalNameFailure =
  | PlayerNameRejection
  /** ★正規化して、★既に居る馬の名前と重なる */
  | 'name_taken'
  /** ★実在競走馬名（NG リスト）に当たる */
  | 'name_blocked'
  /** ★その仔には既に名前が付いている（★先に通った要求がある） */
  | 'already_named'
  /** ★下書きが無い／本人の仔ではない */
  | 'draft_not_found';

export type FoalNameOutcome = 'done' | 'failed' | 'skipped';

/** ★命名に要るもの（★周に 1 回 読む） */
export interface FoalNamingContext {
  readonly blocked: NameBlocklist;
  /** ★禁止名のリストの版（★無ければ null＝検査していない・★`name_checked_with` に残す） */
  readonly version: string | null;
}

export function foalNamingContext(): FoalNamingContext {
  const ng = loadNameBlocklist(undefined, false);
  return { blocked: ng.blocklist, version: ng.version };
}

/**
 * ★`horses` に入れる列（★下書きの `record` の鍵）。★ここに無い鍵は入れない（★想定外の列を黙って足さない）。
 *   ★`foalDraftRecord`（`player-breeding.ts`）が作る鍵と一致すること（★検査で釘付け）。
 */
export const DRAFT_RECORD_COLUMNS = [
  'sex', 'birth_year', 'generation', 'sire_id', 'dam_id', 'sire_line', 'dam_sire_line',
  'genotype', 'potential', 'stats', 'unlock_rate', 'surface_aptitude', 'distance_center',
  'distance_range', 'strategy_aptitude', 'heavy_aptitude', 'growth', 'temper', 'durability',
  'frail', 'skill_genes', 'inbreed_coeff', 'nicks_multiplier', 'pedigree_cache', 'foal_count',
  'g1_wins', 'birth_week', 'last_processed_week',
] as const;

/** ★JSON で入れる列（★DB は jsonb） */
const JSON_COLUMNS: ReadonlySet<string> = new Set([
  'genotype', 'potential', 'stats', 'surface_aptitude', 'strategy_aptitude', 'skill_genes', 'pedigree_cache',
]);

/** ★正規化した名前が、★既に居る馬と重なるか（★`name_key` が空の行が残っていれば、★名前から数え直す） */
async function nameTaken(client: pg.ClientBase, nameKey: string): Promise<boolean> {
  const byKey = await client.query('select 1 from horses where name_key = $1 limit 1', [nameKey]);
  if ((byKey.rowCount ?? 0) > 0) return true;
  const nulls = await client.query('select 1 from horses where name_key is null limit 1');
  if ((nulls.rowCount ?? 0) === 0) return false;
  // ⚠️ ★段 2 の埋め込みの前の DB。★正規化を SQL に写さず、★名前を TS で正規化して比べる
  const names = await client.query<{ name: string }>('select name from horses where name_key is null');
  return names.rows.some((r) => normalizeName(r.name) === nameKey);
}

/**
 * ★**命名の要求 1 件を確定する**。
 * 🔴 ★**`begin` / `commit` / `rollback` をしません**（★呼ぶ側が 1 件ごとに張る）。
 */
export async function confirmFoalName(
  client: pg.ClientBase,
  requestId: string,
  ctx: FoalNamingContext,
): Promise<FoalNameOutcome> {
  const reqRes = await client.query<{ id: string; user_id: string; draft_id: string; proposed_name: string }>(
    "select id, user_id, draft_id, proposed_name from foal_requests"
      + " where id = $1 and status = 'pending' and kind = 'name' for update skip locked",
    [requestId],
  );
  const req = reqRes.rows[0];
  if (req === undefined) return 'skipped';

  const fail = async (reason: FoalNameFailure): Promise<FoalNameOutcome> => {
    await client.query(
      "update foal_requests set status = 'failed', failure_reason = $2, processed_at = now() where id = $1",
      [req.id, reason],
    );
    return 'failed';
  };

  const draftRes = await client.query<{ id: string; user_id: string; named_horse_id: string | null; record: Record<string, unknown> }>(
    'select id, user_id, named_horse_id, record from foal_drafts where id = $1 for update',
    [req.draft_id],
  );
  const draft = draftRes.rows[0];
  if (draft === undefined || draft.user_id !== req.user_id) return fail('draft_not_found');
  if (draft.named_horse_id !== null) return fail('already_named');

  // ★形（★画面と同じ関数・裁定 f117984 §4-5）
  const shape = checkPlayerHorseName(req.proposed_name);
  if (!shape.ok) return fail(shape.reason);
  // ★禁止名（★実在馬名）。★リストが無ければ素通しで ★`version = null` を行に残す（★裁定 ff7028c §4）
  if (ctx.blocked(shape.nameKey)) return fail('name_blocked');
  // ★重複（★正規化した名前で・★段 3 の後は DB の unique が最後の砦）
  if (await nameTaken(client, shape.nameKey)) return fail('name_taken');

  const rec = draft.record;
  const cols: string[] = ['id', 'owner_id', 'name', 'name_key', 'name_checked_with'];
  const vals: unknown[] = [draft.id, req.user_id, shape.display, shape.nameKey, ctx.version];
  for (const k of DRAFT_RECORD_COLUMNS) {
    if (!(k in rec)) throw new Error(`player-naming: ★下書きの record に ${k} がありません（★黙って既定値で埋めません）`);
    cols.push(k);
    vals.push(JSON_COLUMNS.has(k) ? JSON.stringify(rec[k]) : rec[k]);
  }
  await client.query(
    `insert into horses (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    vals,
  );
  await client.query('update foal_drafts set named_horse_id = $1 where id = $1', [draft.id]);
  await client.query(
    "update foal_requests set status = 'done', result_id = $2, processed_at = now() where id = $1",
    [req.id, draft.id],
  );
  return 'done';
}
