/**
 * ★**SB-1 ③: `settleRace` を呼ぶ検査も漏らしていたか**（★2026-09-19・読むだけ）
 *
 * ✔ ★`world_state` は 0 行 ＝ ★**ワーカーは一度も動いていません**。
 *   → ★★**確定したレースがあるなら、それは検査が作ったもの**です。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const rows = async (q) => (await c.query(q)).rows;
const n = async (q) => Number((await c.query(q)).rows[0].n);
console.log(`\nraces 全体: ${await n('select count(*)::int as n from races')}`);
for (const r of await rows(`select status, count(*)::int as n, min(cycle_index) as lo, max(cycle_index) as hi
                              from races group by 1 order by 1`))
  console.log(`  ${String(r.status).padEnd(12)} ${String(r.n).padStart(3)} 件  cycle ${r.lo}..${r.hi}`);
console.log(`\n着順が入った出走: ${await n('select count(*)::int as n from race_entries where finish_pos is not null')}`);
console.log(`prize_pp が入った出走: ${await n('select count(*)::int as n from race_entries where prize_pp is not null')}`);
console.log(`bets: ${await n('select count(*)::int as n from bets')}`);
console.log(`horse_story_event: ${await n('select count(*)::int as n from horse_story_event')}`);
console.log('\n★確定したレースの作成時刻（★ワーカーが動いていないので、すべて検査由来）:');
for (const r of await rows(`select cycle_index, status, created_at from races
                             where status in ('settled','cancelled') order by created_at desc limit 8`))
  console.log(`  cycle=${String(r.cycle_index).padStart(7)} ${r.status.padEnd(10)} ${r.created_at.toISOString()}`);
await c.end();
