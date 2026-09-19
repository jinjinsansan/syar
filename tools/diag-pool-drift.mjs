/**
 * ★**WK-1/WK-2: 集団が動いているのか、動いていないのか**（★2026-09-19・読むだけ）
 *
 * 🔴 ★私は「7,333 → 7,332 の 1 頭減り」から「★staging のワーカーが動いている」と書きました。
 *   ★しかし同じ日に「★`world_state` は 0 行。★ワーカーが一度も動いていない」とも報告しています。
 *   → ★★**どちらかが違います。★推測せずに数えます。**
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const one = async (q, p = []) => (await c.query(q, p)).rows[0];
const ws = await one(`select count(*)::int as n from world_state`);
console.log(`\n① world_state の行数: ${ws.n}`);
if (ws.n > 0) console.log('   中身:', JSON.stringify(await one(`select * from world_state limit 1`)));
const r = await one(`select count(*)::int as n, max(retired_at_week) as mx from horses where retired_at_week is not null`);
console.log(`② 引退済み: ${r.n} 頭（最大 retired_at_week = ${r.mx}）`);
const lp = await one(`select min(last_processed_week) as mn, max(last_processed_week) as mx,
                             count(distinct last_processed_week)::int as kinds from horses`);
console.log(`③ last_processed_week: ${lp.mn}..${lp.mx}（${lp.kinds} 種類）`);
const act = await one(`select count(*)::int as n from horses where retired_at_week is null and owner_id is null`);
const act2 = await one(`select count(*)::int as n from horses where retired_at_week is null`);
const own = await one(`select count(*)::int as n from horses where owner_id is not null`);
console.log(`④ ACTIVE_WHERE（retired is null かつ owner is null）: ${act.n} 頭`);
console.log(`   retired is null だけ: ${act2.n} 頭 / owner_id が付いている馬: ${own.n} 頭`);
const newest = await one(`select count(*)::int as n from horses where created_at > now() - interval '6 hours'`);
console.log(`⑤ 直近 6 時間に作られた馬: ${newest.n} 頭`);
const races = await one(`select count(*)::int as n,
    count(*) filter (where created_at > now() - interval '6 hours')::int as recent,
    max(created_at) as latest from races`);
console.log(`⑥ races: ${races.n} 件 / 直近 6 時間: ${races.recent} 件 / 最新 ${races.latest}`);
const ep = await one(`select count(*)::int as n, max(created_at) as latest from ep_ledger`);
console.log(`⑦ ep_ledger: ${ep.n} 行 / 最新 ${ep.latest}`);
await c.end();
