// @ts-check
/**
 * ★**本番で 初めての「毎日の受け取り」と「投票」が 通ったかを 読むだけで確かめる**（★2026-09-29・レビュー側）
 *
 * 【★なぜ】
 *   ★`claim_daily_ep` は ★本番で 1 度も走っていない（★日次 EP の受領 0 件）。★/vote は 10 EP で制約に落ち ★投票 0 件（簿 VOTE-NEVER-SUCCEEDED）。
 *   ★オーナーが押す 1 手が ★どちらも初回。★オーナーの言葉を受けて ★台帳の行で確かめる（★額・日付・鍵）。
 *
 * 【★読むもの】 ★select だけ（★書かない）。
 *   ① ★ep_ledger の `daily:` 鍵の行（★inflow）: 件数・直近 5 行（額・残高・時刻・鍵の日付）
 *   ② ★bets: 件数・直近 5 行（額・券種・目・時刻・状態）
 *   ③ ★world_state.day_started_at（★鍵の「その日」と突き合わせる）
 *
 *   npx tsx tools/verify-first-daily-and-bet.mjs --env production
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
try {
  await c.query('begin read only');
  const day = (await c.query('select day_started_at from world_state limit 1')).rows[0];
  console.log(`★world_state.day_started_at: ${day?.day_started_at?.toISOString?.() ?? String(day?.day_started_at)}`);

  const dailyN = (await c.query(`select count(*)::int n from ep_ledger where reason = 'inflow' and dedupe_key like 'daily:%'`)).rows[0].n;
  console.log(`\n★① 毎日の受け取り（ep_ledger・inflow・鍵 daily:）: ${dailyN} 件`);
  for (const r of (await c.query(
    `select created_at, delta, balance_after, split_part(dedupe_key, ':', 3) as day_key
       from ep_ledger where reason = 'inflow' and dedupe_key like 'daily:%' order by created_at desc limit 5`,
  )).rows) console.log(`   ${r.created_at.toISOString()}  +${r.delta} EP  残高 ${r.balance_after}  鍵の日 ${r.day_key}`);

  const betN = (await c.query('select count(*)::int n from bets')).rows[0].n;
  console.log(`\n★② 投票（bets）: ${betN} 件`);
  for (const r of (await c.query(
    `select b.created_at, b.amount, b.bet_type, b.selection, b.odds_at_purchase, b.status, r.name as race
       from bets b join races r on r.id = b.race_id order by b.created_at desc limit 5`,
  )).rows) console.log(`   ${r.created_at.toISOString()}  ${r.race}  ${r.bet_type} ${JSON.stringify(r.selection)}  ${r.amount} EP  ${r.odds_at_purchase} 倍  ${r.status}`);
} finally {
  await c.query('rollback').catch(() => undefined);
  await c.end();
}
