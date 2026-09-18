/**
 * ★**出走を取消し、払った料金を返す**（★正典 **D-111** ③⑤・移行 `0028`）
 *
 * 【★なぜ切り出したか】★2026-09-19・**D-117** **DS-7**
 *   ★D-117 で「★締切までに組成が終わらなかったレース」を中止する経路ができました。
 *   ★そこでも ★**登録した馬を取消にして料金を返す**必要があります。
 *   ★`entry-freeze.ts` の中に書いたままだと ★**2 通りの取消**ができます（D-052）。
 *
 * 【🔴 ★切り出すときに見つけた穴】
 *   ★`entry-freeze.ts` は返す額を ★**自前の定数 `ENTRY_FEE_EP = 200`** から作っていました。
 *   ★ところが ★**取る側**（`enter_race`・`0041`/`0042`）は ★**`races.entry_fee_ep` の行の値**を取ります
 *     （★EF-2 で D-103 ④ の形に直したところです）。
 *   → ★値は今どちらも 200 なので ★**今日は壊れていません**。
 *     ★しかし `packages/scheduler/src/entry-fee.ts` の値を変えると、
 *     ★**取る額だけが変わって、返す額は 200 のまま**になります（★静かな取りっぱぐれ・R-16）。
 *   → ★**行から読みます**（★取ったものを返す・D-103 ④）。
 *
 * ⚠️ ★**EP で返します**（★PP で返すと EP→PP の経路ができる・憲法 §0.2）。
 * ⚠️ ★乱数も時刻も読みません（★時刻は Postgres の `now()`・憲法 4）。
 * ⚠️ ★**トランザクションは呼ぶ側が張ります**（★取消と返金と、その周りの処理を 1 つにまとめるため）。
 */

import type pg from 'pg';

export interface ScratchTarget {
  /** `race_entries.id` */
  readonly entryId: string;
  /** `races.id` */
  readonly raceId: string;
  /** `horses.id`。★所有者を引くのに使います（★NPC は返金なし） */
  readonly horseId: string;
  /** ★騎手の料金（`race_entries.jockey_frozen.feeEP`）。★無ければ 0 */
  readonly jockeyFeeEP: number;
}

export interface ScratchResult {
  /** ★返した EP（★既に返していた・所有者がいない・0 円 なら 0） */
  readonly refundedEp: number;
  /** ★この呼び出しで取消にしたなら true（★既に取消だったら false） */
  readonly scratched: boolean;
}

/**
 * ★1 頭を取消にし、★**その登録で払った額**（登録料 ＋ 騎手の料金）を EP で返します。
 *
 * ★冪等です:
 *   ① ★取消は `scratched_at is null` の行だけを更新します（★理由を上書きしない）
 *   ② ★返金は `ep_ledger.dedupe_key = 'scratch:<entry_id>'` で二度払いを防ぎます
 */
export async function scratchEntry(
  client: pg.Client | pg.PoolClient,
  target: ScratchTarget,
  reason: string,
): Promise<ScratchResult> {
  const upd = await client.query(
    `update race_entries set scratched_at = now(), scratch_reason = $1
      where id = $2 and scratched_at is null`,
    [reason, target.entryId],
  );
  const scratched = (upd.rowCount ?? 0) > 0;

  /**
   * ★**取った額を行から読みます**（★上の註記の穴）。
   * ⚠️ ★`entry_fee_ep` が null の行には ★**そもそも登録できません**（`0041` の R-27 の形）。
   *    ★それでも null を 0 として扱わず、★**返せないことを言います**（★黙って 0 を返さない）。
   */
  const feeRow = (await client.query<{ entry_fee_ep: number | string | null }>(
    `select entry_fee_ep from races where id = $1`, [target.raceId],
  )).rows[0];
  if (feeRow === undefined) {
    throw new Error(`取消: レース ${target.raceId} がありません`);
  }
  if (feeRow.entry_fee_ep === null) {
    throw new Error(
      `取消: レース ${target.raceId} に entry_fee_ep がありません`
        + '（★いくら取ったか分からないので返せません・D-111 ⑤）',
    );
  }
  const fee = Number(feeRow.entry_fee_ep) + target.jockeyFeeEP;

  // ★NPC の馬には所有者がいないので返金はありません
  const owner = (await client.query<{ owner_id: string | null }>(
    `select owner_id from horses where id = $1`, [target.horseId],
  )).rows[0];
  if (owner?.owner_id == null || fee <= 0) return { refundedEp: 0, scratched };

  const key = `scratch:${target.entryId}`;
  const dup = await client.query(`select 1 from ep_ledger where dedupe_key = $1`, [key]);
  if (dup.rowCount !== 0) return { refundedEp: 0, scratched };

  const bal = (await client.query<{ entry_points: string }>(
    `update users set entry_points = entry_points + $1 where id = $2 returning entry_points`,
    [fee, owner.owner_id],
  )).rows[0];
  if (bal === undefined) {
    throw new Error(`取消: 所有者 ${owner.owner_id} がいません（★返金できません）`);
  }
  await client.query(
    `insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
     values ($1, $2, $3, 'refund', $4, $5)`,
    [owner.owner_id, fee, Number(bal.entry_points), target.raceId, key],
  );
  return { refundedEp: fee, scratched };
}

/**
 * ★**そのレースの、まだ取消になっていない登録を全部取消にする**（★D-117 **DS-7**）。
 *
 * ★組成が間に合わなかったレースで使います。★**発売はされていません**
 *   （`place_bet` は `scheduled` だけを受けるので、★組成前のレースの馬券は 1 枚もありません）。
 *   ★返すのは ★**登録料と騎手の料金**だけです。
 *
 * ★NPC の行は取消にしません — ★組成前のレースに NPC の行はありません
 *   （★NPC は組成のときに入ります）。★それでも将来 NPC が混ざったときのために、
 *   ★`scratchEntry` が所有者を見て返金だけを飛ばします。
 */
export async function scratchAllEntries(
  client: pg.Client | pg.PoolClient,
  raceId: string,
  reason: string,
): Promise<{ scratched: number; refundedEp: number }> {
  const rows = (await client.query<{
    id: string; horse_id: string; jockey_frozen: { feeEP?: number } | null;
  }>(
    `select id, horse_id, jockey_frozen from race_entries
      where race_id = $1 and scratched_at is null order by gate`,
    [raceId],
  )).rows;

  let scratched = 0;
  let refundedEp = 0;
  for (const row of rows) {
    const r = await scratchEntry(
      client,
      {
        entryId: row.id,
        raceId,
        horseId: row.horse_id,
        jockeyFeeEP: Number(row.jockey_frozen?.feeEP ?? 0),
      },
      reason,
    );
    if (r.scratched) scratched += 1;
    refundedEp += r.refundedEp;
  }
  return { scratched, refundedEp };
}
