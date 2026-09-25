/**
 * ★**利用者が頼んだ出走の取消を確定する**（★2026-09-25・正典 **D-123**・移行 `0079`）
 *
 * 【★この層の仕事】
 *   ★`entry_scratch_requests` の `pending` を拾い、★**既に在る `scratchEntry` を呼ぶ**だけです。
 *   🔴 ★**返す処理をここに書きません**（★D-052・D-111 ⑤）。
 *      ★`scratch.ts` が ★登録料（`races.entry_fee_ep` の行から）と ★騎手の料金を返し、
 *      ★`ep_ledger.dedupe_key = 'scratch:<entry_id>'` で二度払いを防ぎます。
 *      ★ここで書き写すと ★**返し方が 2 通り**になります（★`scratch.ts` の註記が、まさにその穴を記録しています）。
 *
 * 【🔴 ★段はここでも見ます】
 *   ★受付（RPC）で `announced` を確かめていますが、★**積んでから確定するまでに段は進みます**。
 *   → ★確定の時点で ★**もう一度**見ます。★`announced` でなくなっていたら ★**断ります**
 *     （★`failed` にして理由を残す・★黙って取り消さない）。
 *   ⚠️ ★判定は ★**段**です。★時刻では見ません（★D-123）。
 *
 * ⚠️ ★**要求ごとに取引を張ります**（★1 件の失敗で残りを止めない）。
 * ⚠️ ★乱数も時刻も読みません（★時刻は Postgres の `now()`・憲法 4）。
 */

import type pg from 'pg';
import { scratchEntry } from './scratch.js';

/** ★1 周で拾う件数（★`foal_requests` と同じ考え方。★周を延ばさない） */
export const ENTRY_SCRATCH_BATCH = 20;

export interface EntryScratchResult {
  readonly done: number;
  readonly failed: number;
  readonly errors: number;
  readonly refundedEp: number;
  readonly backlog: number;
}

const EMPTY: EntryScratchResult = { done: 0, failed: 0, errors: 0, refundedEp: 0, backlog: 0 };

async function tableExists(client: pg.ClientBase, name: string): Promise<boolean> {
  const r = await client.query<{ t: string | null }>('select to_regclass($1)::text t', [`public.${name}`]);
  return r.rows[0]?.t !== null && r.rows[0]?.t !== undefined;
}

export async function runEntryScratch(
  client: pg.Client | pg.PoolClient,
  onAlert: (message: string) => void,
  limit: number = ENTRY_SCRATCH_BATCH,
): Promise<EntryScratchResult> {
  if (!(await tableExists(client, 'entry_scratch_requests'))) return EMPTY;

  const pending = (await client.query<{ id: string }>(
    "select id from entry_scratch_requests where status = 'pending'"
    + ' order by attempts, created_at, id limit $1',
    [limit],
  )).rows;
  if (pending.length === 0) return EMPTY;

  let done = 0; let failed = 0; let errors = 0; let refundedEp = 0;
  for (const { id } of pending) {
    await client.query('begin');
    try {
      /**
       * ★要求 → 登録 → レース の順にロックします（★`0070` と同じ順・★取り合いを作らない）。
       * ⚠️ ★`for update` を要求に掛けるので、★同じ要求を 2 つの周が同時に拾っても 1 回だけ進みます。
       */
      const req = (await client.query<{ entry_id: string }>(
        "select entry_id from entry_scratch_requests where id = $1 and status = 'pending' for update",
        [id],
      )).rows[0];
      if (req === undefined) { await client.query('rollback'); continue; }
      await client.query('update entry_scratch_requests set attempts = attempts + 1 where id = $1', [id]);

      const row = (await client.query<{
        entry_id: string; race_id: string; horse_id: string;
        jockey_frozen: { feeEP?: number } | null; scratched_at: string | null; race_status: string;
      }>(
        'select e.id as entry_id, e.race_id, e.horse_id, e.jockey_frozen, e.scratched_at,'
        + ' r.status as race_status'
        + ' from race_entries e join races r on r.id = e.race_id'
        + ' where e.id = $1 for update of e',
        [req.entry_id],
      )).rows[0];

      const refuse = async (reason: string): Promise<void> => {
        await client.query(
          "update entry_scratch_requests set status = 'failed', failure_reason = $2, processed_at = now()"
          + ' where id = $1', [id, reason],
        );
        await client.query('commit');
        failed += 1;
      };

      if (row === undefined) { await refuse('entry_missing'); continue; }
      if (row.scratched_at !== null) { await refuse('already_scratched'); continue; }
      /**
       * 🔴 ★**段をもう一度 見ます**（★積んでから確定までに進みます）。
       *   ★`announced` でなくなっていたら断ります（★黙って取り消さない・D-111 ⑤）。
       */
      if (row.race_status !== 'announced') { await refuse('race_not_announced'); continue; }

      // 🔴 ★返すのはここではありません。★既存の経路（D-111 ⑤）を呼ぶだけです
      const r = await scratchEntry(client, {
        entryId: row.entry_id,
        raceId: row.race_id,
        horseId: row.horse_id,
        jockeyFeeEP: Number(row.jockey_frozen?.feeEP ?? 0),
      }, 'owner_request');

      await client.query(
        "update entry_scratch_requests set status = 'done', processed_at = now() where id = $1", [id],
      );
      await client.query('commit');
      done += 1;
      refundedEp += r.refundedEp;
    } catch (cause: unknown) {
      await client.query('rollback').catch(() => { /* ★取引が壊れていても次へ */ });
      errors += 1;
      onAlert(`出走の取消 ${id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  const backlog = Number((await client.query<{ n: string }>(
    "select count(*)::text n from entry_scratch_requests where status = 'pending'",
  )).rows[0]?.n ?? 0);
  return { done, failed, errors, refundedEp, backlog };
}
