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

/**
 * ★**登録の後・発走の前に引退した馬を取消にする**（★正典 **D-111 ③**・★**DS-5 ③**・2026-09-19）
 *
 * 【🔴 ★なぜ、ここに要るのか — ★D-111 ③ は一度も動いていませんでした】
 *   ★引退を見ていたのは ★**`entry-freeze.ts` の 1 か所だけ**でした。
 *   ★その掃き出しの `where` は ★**`e.entrant_snapshot is null`**。
 *   ★ところが ★**`fillRace` は登録済みの行に `entrant_snapshot` を書きます**（`pg-store.ts:377`）。
 *   → ★★**組成が済んだ登録の行を、掃き出しは二度と見ません。**
 *   ✔ ★実 DB で確かめました（`tools/verify-ds5-retire-scratch.mjs`・2026-09-19）:
 *     ★組成の後 **0 件** ／ ★対照（組成していない行）**1 件** → ★**`where` は生きているのに届いていない**。
 *
 *   ⚠️ ★`horse-repo.ts` の註記は「★登録の後に引退した馬は `entry-freeze` が取消にします」と
 *      ★書いていました。★**書いてあるだけで、届いていませんでした**（★R-16）。
 *
 * 【★なぜ「組成の前」か】
 *   ★§10.4 は「★プレイヤー馬を優先し、★**残りを NPC 馬で充填**」です。
 *   → ★**組成の前に取消にすれば、★空いた枠は自然に NPC で埋まります。**
 *   ★組成の後だと、★**1 頭 少ないまま走る**か、★出走表を組み直すことになります。
 *
 * 【⚠️ ★DS-5 ② で、これが常態になりました】
 *   ★G1 の登録の窓は **3 時間 48 分 ＝ 1 ゲーム内週の 95%**（★12 分のときは 10%）。
 *   → ★**登録と発走の間に週送りが入るのが普通**になり、★260 週到達と致命的な故障を跨ぎます。
 *
 * 【✅ ★**組成 → 発走の窓も塞ぎました** — ★**DS-5 ④**（2026-09-19）】
 *   ★この関数は ★**2 か所から呼ばれます**（★同じ 1 本を使う・D-052）:
 *     ★① ★**抽選の前**（`main.ts`）… ★登録 → 組成（★G1 なら 3 時間 48 分）
 *     ★② ★**確定の前**（`pg-store.ts` の `scratchRetiredBeforeStart`）… ★組成 → 発走（12 分）
 *   🔴 ★②では ★**`retiredByWeek` を必ず渡します。** ★渡さないと、
 *     ★**レースの最中／後に引退した馬まで取消**になり、★**走った馬の結果を消します。**
 *   ⚠️ ★`entry-freeze` は②を拾えません（★引退した馬も**凍結は持っている**）。
 *     ★**D-111 ④（D-056 の安全網）も拾いません**（★あれは「凍結が無い」を見るもの）。
 *
 * @returns ★取消にした頭数と返した EP、★そして ★**取り除いた馬の id**（★呼ぶ側が登録から外すため）
 */
export async function scratchRetiredEntries(
  client: pg.Client | pg.PoolClient,
  cycleIndex: number,
  reason: string,
  /**
   * ★**この週までに引退していた馬だけ**を対象にします（★**DS-5 ④**・2026-09-19）。
   *
   * 【★なぜ要るか】
   *   ★組成の前に呼ぶときは ★**いま引退していれば必ず発走前**なので、境目は要りません。
   *   🔴 ★しかし ★**発走の直前に呼ぶとき**は、★確定は発走より後に走るので、
   *     ★**「レースの最中／後に引退した馬」まで取消にしてしまいます。**
   *     ★その馬は ★**実際に走っています。★取消は誤りで、★他の客の馬券まで返ってしまいます**（§9.1）。
   *
   * 【★なぜ「週」で比べるか】
   *   ★`retired_at_week` は ★**ゲーム内の週**です（`training-runner.ts:384` が `birth + ageWeeks` で書く）。
   *   ★週送りの処理が遅れて走っても、★**書かれる週は変わりません**（★実時刻に依らない・憲法④）。
   *   → ★**レースの `scheduled_at` が属する週**と比べれば、★実時刻のずれに影響されません。
   *
   * 【🔴 ⚠️ ★**`<=` が誤爆しないのは、★別の場所の並びのおかげです**（★レビュー側の指摘・2026-09-19）】
   *   ★境目（★`retired_at_week == 発走の週 W`）の馬は、★**W のレースより後に引退した**かもしれません。
   *   ✔ ★それでも安全なのは、★**`main.ts` が週送り（`advanceTrainingWeeks`）を `runCycle` より後に置いている**から:
   *     ★週 W が締まるのは W+1 の周 → ★`retired_at_week = W` が DB に現れるのは
   *     ★**W のレースが全部 終わった後** → ★**W のレースがその値を見ることはありません。**
   *
   *   🔴 ★★**この並びが入れ替わると、`<=` は静かに誤爆します**（★レース中／後に引退した馬まで取消）。
   *   ⚠️ ★**入れ替える理由は実際に在ります** — ★`main.ts` の註記自身が
   *     「★前に置くと 7,000 頭の週送りで確定が待たされる」と書いており、★逆向きの圧力（D-038）を知る人なら動かしえます。
   *   → ★**並びは `apps/cli/test/week-advance-after-settle.test.ts` が固定しています。**
   *
   * ⚠️ ★省くと ★**「いま引退しているか」**になります（★組成の前の呼び出しはそれで正しい）。
   */
  retiredByWeek?: number,
): Promise<{ scratched: number; refundedEp: number; horseIds: readonly string[] }> {
  const rows = (await client.query<{
    id: string; race_id: string; horse_id: string;
    jockey_frozen: { feeEP?: number } | null; retired_at_week: string | number;
  }>(
    `select e.id, e.race_id, e.horse_id, e.jockey_frozen, h.retired_at_week
       from race_entries e
       join races r on r.id = e.race_id
       join horses h on h.id = e.horse_id
      where r.cycle_index = $1
        and e.scratched_at is null
        and h.retired_at_week is not null
        and ($2::bigint is null or h.retired_at_week <= $2::bigint)
      order by e.gate`,
    [cycleIndex, retiredByWeek ?? null],
  )).rows;

  let scratched = 0;
  let refundedEp = 0;
  const horseIds: string[] = [];
  for (const row of rows) {
    /**
     * ⚠️ ★**理由に週を入れます**（★本人に届く文・D-111 ⑤）。
     *    ★「取消になった」だけだと、★なぜかが分かりません。
     */
    const r = await scratchEntry(
      client,
      {
        entryId: row.id,
        raceId: row.race_id,
        horseId: row.horse_id,
        jockeyFeeEP: Number(row.jockey_frozen?.feeEP ?? 0),
      },
      `${reason}（${row.retired_at_week} 週で引退しました）`,
    );
    if (r.scratched) scratched += 1;
    refundedEp += r.refundedEp;
    horseIds.push(row.horse_id);
  }
  return { scratched, refundedEp, horseIds };
}
