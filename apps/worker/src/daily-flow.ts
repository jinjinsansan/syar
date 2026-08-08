/**
 * 日次の資金フロー集計（正典 §4.6・§11.2）
 *
 * 【★これが「監視が無いより悪い」状態を防ぐ】
 *   §11.2 は「1日の純発行量をダッシュボードで毎日確認する」と定めています。
 *   集計が無ければ確認できず、**数字が出ないので気づけません**。
 *   逆に誤った集計は「数字が出るので信用してしまう」ぶん、無いより悪い。
 *
 * 【★実際に台帳から数える】
 *   推定や理論値を使いません。`ep_ledger` / `pp_ledger` / `bets` の実データを数えます。
 *   理論値で埋めると「経済が理論どおりか」を確かめる手段が消えます。
 */

import { summarizeDay, type PointFlowInput, type TicketDayTotals } from '@star/betting';
import type { TicketKind } from '@star/betting';
import type pg from 'pg';

/** DB の bet_type → 券種（DB は 'wide'、コードは 'quinella_place'） */
const BET_TYPE_MAP: Readonly<Record<string, TicketKind>> = {
  win: 'win', place: 'place', wide: 'quinella_place', quinella: 'quinella',
  exacta: 'exacta', trio: 'trio', trifecta: 'trifecta',
};

/**
 * 指定日（サーバーの日付）の資金フローを集計して `point_flow_daily` に保存する。
 *
 * ★冪等: 同じ日を何度集計しても同じ行になる（`on conflict do update`）。
 *   ワーカーと同じ性質を集計にも持たせます。
 */
export async function aggregateDay(client: pg.Client | pg.PoolClient, date: string): Promise<void> {
  // --- 券種別の売上と払戻（★実際の馬券から数える） ---
  const bets = await client.query<{ bet_type: string; stake: string; payout: string }>(
    `select b.bet_type,
            sum(b.amount)::text as stake,
            coalesce(sum(b.payout), 0)::text as payout
       from bets b
      where b.created_at >= $1::date and b.created_at < ($1::date + interval '1 day')
        and b.status <> 'refunded'
      group by b.bet_type`,
    [date],
  );
  const byKind: Partial<Record<TicketKind, TicketDayTotals>> = {};
  for (const r of bets.rows) {
    const kind = BET_TYPE_MAP[r.bet_type];
    // ★知らない券種を黙って捨てない。集計から漏れると margin が過小に出る
    if (kind === undefined) throw new Error(`aggregateDay: 未知の券種 ${r.bet_type}`);
    byKind[kind] = { stake: Number(r.stake), payout: Number(r.payout), refund: 0 };
  }

  // --- EP の流入と焼却（馬券以外） ---
  const ep = await client.query<{ reason: string; total: string }>(
    `select reason, sum(delta)::text as total from ep_ledger
      where created_at >= $1::date and created_at < ($1::date + interval '1 day')
      group by reason`,
    [date],
  );
  let epInflow = 0;
  let epBurnedOther = 0;
  for (const r of ep.rows) {
    const v = Number(r.total);
    if (r.reason === 'inflow') epInflow += v;
    // ★'bet' は馬券側で数えるのでここでは除く（二重計上を避ける）
    else if (r.reason !== 'bet' && r.reason !== 'refund') epBurnedOther += -v;
  }

  // --- PP の発行（賞金）と交換 ---
  const pp = await client.query<{ reason: string; total: string }>(
    `select reason, sum(delta)::text as total from pp_ledger
      where created_at >= $1::date and created_at < ($1::date + interval '1 day')
      group by reason`,
    [date],
  );
  let ppPrize = 0;
  let ppExchanged = 0;
  for (const r of pp.rows) {
    const v = Number(r.total);
    if (r.reason === 'prize') ppPrize += v;
    else if (r.reason === 'prize_exchange') ppExchanged += -v;
    // ★'payout' は馬券側で数える（二重計上を避ける）
  }

  const input: PointFlowInput = { byKind, epInflow, epBurnedOther, ppPrize, ppExchanged };
  const day = summarizeDay(input);

  // ★券種横断の margin は判定に使わない（R-16）。記録はするが、
  //   アラートは券種別で出す（summarizeDay が既にそうしている）
  await client.query(
    `insert into point_flow_daily (date, ep_inflow, ep_burned, pp_issued, pp_exchanged, margin_actual)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (date) do update set
       ep_inflow = excluded.ep_inflow, ep_burned = excluded.ep_burned,
       pp_issued = excluded.pp_issued, pp_exchanged = excluded.pp_exchanged,
       margin_actual = excluded.margin_actual`,
    [date, day.epInflow, day.epBurned, day.ppIssued, day.ppExchanged, day.marginActualOverall],
  );
}
