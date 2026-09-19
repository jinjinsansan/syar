/** ★私が staging に残したものを数える（★読むだけ・2026-09-19） */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const rows = async (q, p = []) => (await c.query(q, p)).rows;
console.log('\n① 検査で作ったレース（cycle_index >= 100000）:');
for (const r of await rows(`select cycle_index, name, status, created_at from races where cycle_index >= 100000 order by cycle_index`))
  console.log(`   cycle=${r.cycle_index} ${r.name} status=${r.status} ${r.created_at.toISOString()}`);
console.log('\n② 所有者の付いた馬:');
for (const r of await rows(`select h.id, h.name, h.owner_id, u.display_name from horses h left join public.users u on u.id = h.owner_id where h.owner_id is not null`))
  console.log(`   ${r.id} ${r.name} → ${r.display_name ?? '(users に無い)'}`);
console.log('\n③ public.users:');
for (const r of await rows(`select id, display_name, stable_name, entry_points from public.users`))
  console.log(`   ${r.display_name} / ${r.stable_name} / ${r.entry_points} EP`);
console.log('\n④ ep_ledger:');
for (const r of await rows(`select user_id, delta, reason, dedupe_key, created_at from ep_ledger order by created_at`))
  console.log(`   ${r.delta} ${r.reason} key=${r.dedupe_key ?? '-'} ${r.created_at.toISOString()}`);
console.log('\n⑤ race_entries（検査のレースのもの）:');
const n = (await c.query(`select count(*)::int as n from race_entries e join races r on r.id=e.race_id where r.cycle_index >= 100000`)).rows[0].n;
console.log(`   ${n} 行`);
console.log('\n⑥ auth.users:');
for (const r of await rows(`select id, email from auth.users`)) console.log(`   ${r.email}`);
await c.end();
