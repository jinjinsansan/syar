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
/** 集計の対象。★内部口座は実経済の指標から分けるが、消しはしない（0009） */
export type FlowScope = 'player' | 'internal';

const SCOPE_SQL: Readonly<Record<FlowScope, string>> = {
  player: `u.account_type <> 'internal'`,
  internal: `u.account_type = 'internal'`,
};

/**
 * 1日ぶんの資金フローを、口座の区分ごとに集める。
 *
 * ★`users` を内部結合します。結合できない行があると**黙って集計から消える**ので、
 *   呼び出し側で「player + internal = 全体」を突き合わせます（`aggregateDay`）。
 */
async function collectFlow(
  client: pg.Client | pg.PoolClient,
  date: string,
  scope: FlowScope,
): Promise<PointFlowInput> {
  const where = SCOPE_SQL[scope];

  // --- 券種別の売上と払戻（★実際の馬券から数える） ---
  const bets = await client.query<{ bet_type: string; stake: string; payout: string }>(
    `select b.bet_type,
            sum(b.amount)::text as stake,
            coalesce(sum(b.payout), 0)::text as payout
       from bets b
       join users u on u.id = b.user_id
      where b.created_at >= $1::date and b.created_at < ($1::date + interval '1 day')
        and b.status <> 'refunded'
        and ${where}
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
    `select l.reason, sum(l.delta)::text as total from ep_ledger l
       join users u on u.id = l.user_id
      where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day')
        and ${where}
      group by l.reason`,
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
    `select l.reason, sum(l.delta)::text as total from pp_ledger l
       join users u on u.id = l.user_id
      where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day')
        and ${where}
      group by l.reason`,
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

  return { byKind, epInflow, epBurnedOther, ppPrize, ppExchanged };
}

/**
 * 指定日（サーバーの日付）の資金フローを集計して `point_flow_daily` に保存する。
 *
 * ★冪等: 同じ日を何度集計しても同じ行になる（`on conflict do update`）。
 *   ワーカーと同じ性質を集計にも持たせます。
 *
 * ★内部口座は**別掲**します（0009・§11.2）。除外して消すと、
 *   口座に印を付けるだけで流量を隠せてしまいます。
 */
export async function aggregateDay(client: pg.Client | pg.PoolClient, date: string): Promise<void> {
  const player = summarizeDay(await collectFlow(client, date, 'player'));
  const internal = summarizeDay(await collectFlow(client, date, 'internal'));

  // ★R-21: 区分の合計が全体と一致することを確かめる。
  //   `users` に結合できない行があると**黙って両方から漏れます**。
  //   「player も internal も 0 だから経済が動いていない」と読み違える形です。
  const total = await client.query<{ bets: string; ep: string; pp: string }>(
    `select
       (select count(*) from bets b
         where b.created_at >= $1::date and b.created_at < ($1::date + interval '1 day'))::text as bets,
       (select count(*) from ep_ledger l
         where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day'))::text as ep,
       (select count(*) from pp_ledger l
         where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day'))::text as pp`,
    [date],
  );
  const split = await client.query<{ bets: string; ep: string; pp: string }>(
    `select
       (select count(*) from bets b join users u on u.id = b.user_id
         where b.created_at >= $1::date and b.created_at < ($1::date + interval '1 day'))::text as bets,
       (select count(*) from ep_ledger l join users u on u.id = l.user_id
         where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day'))::text as ep,
       (select count(*) from pp_ledger l join users u on u.id = l.user_id
         where l.created_at >= $1::date and l.created_at < ($1::date + interval '1 day'))::text as pp`,
    [date],
  );
  for (const k of ['bets', 'ep', 'pp'] as const) {
    if (total.rows[0]![k] !== split.rows[0]![k]) {
      throw new Error(
        `aggregateDay: ${k} が区分に振り分けられていません（全体 ${total.rows[0]![k]} / 区分 ${split.rows[0]![k]}）`,
      );
    }
  }

  // ★券種横断の margin は判定に使わない（R-16）。記録はするが、
  //   アラートは券種別で出す（summarizeDay が既にそうしている）
  await client.query(
    `insert into point_flow_daily (
       date, ep_inflow, ep_burned, pp_issued, pp_exchanged, margin_actual,
       ep_inflow_internal, ep_burned_internal, pp_issued_internal, pp_exchanged_internal,
       margin_actual_internal)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (date) do update set
       ep_inflow = excluded.ep_inflow, ep_burned = excluded.ep_burned,
       pp_issued = excluded.pp_issued, pp_exchanged = excluded.pp_exchanged,
       margin_actual = excluded.margin_actual,
       ep_inflow_internal = excluded.ep_inflow_internal,
       ep_burned_internal = excluded.ep_burned_internal,
       pp_issued_internal = excluded.pp_issued_internal,
       pp_exchanged_internal = excluded.pp_exchanged_internal,
       margin_actual_internal = excluded.margin_actual_internal`,
    [
      date,
      player.epInflow, player.epBurned, player.ppIssued, player.ppExchanged, player.marginActualOverall,
      internal.epInflow, internal.epBurned, internal.ppIssued, internal.ppExchanged,
      internal.marginActualOverall,
    ],
  );
}
