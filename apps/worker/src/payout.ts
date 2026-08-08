/**
 * 馬券の精算（正典 §9・§11.2）
 *
 * 【★PP の発行なので、二重に走ると経済が壊れる】
 *   `bets.status` を条件に含め、**pending の馬券だけ**を精算します。
 *   既に won/lost なら対象外なので、同じレースを2回精算しても増えません。
 *   `settleRace` のトランザクション内から呼ばれる前提です。
 *
 * 【★EP で買い PP で払い戻す（§9・憲法 §0.2）】
 *   購入は `ep_ledger`、払戻は `pp_ledger`。**同じ台帳に混ぜません**。
 *   返還（取消・除外）だけは EP で返します（§9.1）。
 */

import { settle, ep, pp, type RaceOutcome, type TicketKind } from '@star/betting';
import type pg from 'pg';

export interface FinishedEntry {
  readonly gate: number;
  readonly finishPosition: number;
}

/** DB の bet_type を券種に対応させる（★DB は 'wide'、コードは 'quinella_place'） */
const BET_TYPE_MAP: Readonly<Record<string, TicketKind>> = {
  win: 'win',
  place: 'place',
  wide: 'quinella_place',
  quinella: 'quinella',
  exacta: 'exacta',
  trio: 'trio',
  trifecta: 'trifecta',
};

export async function settlePayouts(
  client: pg.Client | pg.PoolClient,
  raceId: string,
  finished: readonly FinishedEntry[],
): Promise<{ won: number; lost: number; paid: number }> {
  const order = [...finished].sort((a, b) => a.finishPosition - b.finishPosition).map((f) => f.gate);
  const outcome: RaceOutcome = { order, fieldSize: finished.length };

  const bets = await client.query<{
    id: string; user_id: string; bet_type: string; selection: number[];
    amount: number; odds_at_purchase: string;
  }>(
    // ★pending だけ。既に精算済みの馬券は触らない（二重払戻の防止）
    `select id, user_id, bet_type, selection, amount, odds_at_purchase
       from bets where race_id = $1 and status = 'pending' for update`,
    [raceId],
  );

  let won = 0;
  let lost = 0;
  let paid = 0;
  for (const b of bets.rows) {
    const kind = BET_TYPE_MAP[b.bet_type];
    if (kind === undefined) {
      // ★知らない券種を黙って外れ扱いにしない。客の馬券を勝手に捨てることになる
      throw new Error(`settlePayouts: 未知の券種 ${b.bet_type}（bet=${b.id}）`);
    }
    const s = settle(
      {
        selection: { kind, horses: b.selection },
        stake: ep(b.amount),
        oddsAtPurchase: Number(b.odds_at_purchase),
      },
      outcome,
    );

    if (s.hit) {
      won += 1;
      paid += s.payout;
      await client.query(`update bets set status = 'won', payout = $1 where id = $2`, [s.payout, b.id]);
      // ★PP を発行する。EP の台帳には書かない（憲法 §0.2 の一方通行）
      await client.query(
        `update users set prize_points = prize_points + $1 where id = $2`,
        [s.payout, b.user_id],
      );
      await client.query(
        `insert into pp_ledger (user_id, delta, balance_after, reason, ref_id)
         select $1, $2, prize_points, 'payout', $3 from users where id = $1`,
        [b.user_id, s.payout, raceId],
      );
    } else {
      lost += 1;
      await client.query(`update bets set status = 'lost' where id = $1`, [b.id]);
    }
  }
  return { won, lost, paid: Number(pp(paid)) };
}
