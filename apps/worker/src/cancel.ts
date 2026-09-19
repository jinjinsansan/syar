/**
 * 開催中止と返還（正典 §10.2・§9.1）
 *
 * 【★なぜ必要か】
 *   §10.2:「生成失敗時はそのラウンドを**開催中止**とし**全ベットを EP で返還**。
 *          結果の事後差し替えは絶対にしない」
 *
 *   これが無いと、発売後にレースが成立しなかったとき
 *   **買った人の EP が返らないまま馬券が pending で残ります**。
 *
 * 【★返還は EP（§9.1）】
 *   購入は EP なので、返還も EP です。PP で返すと
 *   **EP→PP の変換経路**ができてしまい、憲法 §0.2 の一方通行が壊れます。
 *   （PP は景品に繋がる出口を持つため、EP から PP を作れてはいけない）
 *
 * 【★二重返還を防ぐ】
 *   `bets.status = 'pending'` だけを対象にし、`'refunded'` に更新します。
 *   既に返還済みなら 0行更新で終わります（A-5 の place_bet と同じ構造）。
 */

import type pg from 'pg';
// ★取消と返金は 1 か所（★D-111 ③⑤・D-117 DS-7 と同じ関数・D-052）
import { scratchAllEntries } from './scratch.js';

export interface CancelResult {
  readonly cancelled: boolean;
  readonly refundedBets: number;
  readonly refundedEp: number;
}

/**
 * レースを開催中止にし、全ベットを EP で返還する。
 *
 * @param reason 中止の理由（監査のため races.name に残さず、ログに出す）
 */
export async function cancelRace(
  client: pg.Client | pg.PoolClient,
  cycleIndex: number,
): Promise<CancelResult> {
  await client.query('begin');
  try {
    /**
     * ★確定済みのレースは中止にしない。結果の事後差し替えになる（§8.6）
     *
     * 🔴 ★**`announced` も受けます**（★2026-09-19・**D-117 DS-7**）。
     *   ★旧は `status = 'scheduled'` だけでした。★D-117 で「★組成が間に合わなかったレース」
     *   ★（`announced` のまま発売開始を過ぎたもの）を中止する経路ができたのに、
     *   ★**この 1 行のせいで黙って 0 行を返して**いました。
     *   → ★中止にならず `announced` のまま残り、★`announcedRaces()` が**毎周それを返し**、
     *     ★**毎周「中止しました」と通報しながら、実際には何も起きない**ところでした。
     * ⚠️ ★`settled` は入れません（★結果の事後差し替え）。
     */
    const race = await client.query<{ id: string; was: string }>(
      `update races set status = 'cancelled'
        where cycle_index = $1 and status in ('scheduled', 'announced')
        returning id, status as was`,
      [cycleIndex],
    );
    if (race.rowCount === 0) {
      // 既に中止済みか、確定済み。**何もしない**
      await client.query('rollback');
      return { cancelled: false, refundedBets: 0, refundedEp: 0 };
    }
    const raceId = race.rows[0]!.id;

    // ★pending の馬券だけを返還（二重返還の防止）
    const bets = await client.query<{ id: string; user_id: string; amount: number }>(
      `select id, user_id, amount from bets
        where race_id = $1 and status = 'pending' for update`,
      [raceId],
    );

    let refundedEp = 0;
    for (const b of bets.rows) {
      // ★EP で返す。PP で返すと EP→PP の変換経路ができる（憲法 §0.2）
      await client.query(`update users set entry_points = entry_points + $1 where id = $2`, [
        b.amount,
        b.user_id,
      ]);
      await client.query(
        `insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
         select $1, $2, entry_points, 'refund', $3 from users where id = $1`,
        [b.user_id, b.amount, raceId],
      );
      await client.query(`update bets set status = 'refunded' where id = $1`, [b.id]);
      refundedEp += Number(b.amount);
    }

    /**
     * 🔴 ★**登録料と騎手の料金も返します**（★2026-09-19・**D-117 DS-7**・D-111 ⑤）。
     *
     *   ★馬券は `place_bet` が `scheduled` しか受けないので、★組成前のレースには 1 枚もありません。
     *   ★**取られているのは登録料です。** ★上のループは馬券しか見ていないので、
     *   ★**中止にしても登録料が返らない**ところでした。
     * ⚠️ ★`scratchAllEntries` は ★**取消でない行だけ**を対象にし、★`dedupe_key` で二度払いを防ぎます。
     *    ★組成済みのレース（NPC が入っている）でも、★所有者のいない馬には返金しません。
     */
    const scratched = await scratchAllEntries(
      client, raceId,
      `レースが開催中止になりました（cycle=${cycleIndex}・§9.1・D-037/D-117 DS-7）`,
    );

    await client.query('commit');
    return {
      cancelled: true,
      refundedBets: bets.rowCount ?? 0,
      refundedEp: refundedEp + scratched.refundedEp,
    };
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
