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
    // ★確定済みのレースは中止にしない。結果の事後差し替えになる（§8.6）
    const race = await client.query<{ id: string }>(
      `update races set status = 'cancelled'
        where cycle_index = $1 and status = 'scheduled'
        returning id`,
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

    await client.query('commit');
    return { cancelled: true, refundedBets: bets.rowCount ?? 0, refundedEp };
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
