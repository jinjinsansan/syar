/**
 * ★**SB-2: 台帳に、掃除しそこねた行が残っていないか**（★2026-09-19・読むだけ）
 *
 * 🔴 ★私は汚染の証拠として `ep_ledger` 2 行を挙げたのに、★**掃除の表には載せませんでした**。
 *   ★「掃除した」の表に載っていないものが、いちばん残ります。
 * ⚠️ ★§3.4 の収支は `ep_ledger` を集計します。★混ざったままなら、そこが狂います。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const rows = async (q) => (await c.query(q)).rows;
const n = async (q) => Number((await c.query(q)).rows[0].n);

for (const t of ['ep_ledger', 'pp_ledger']) {
  console.log(`\n=== ${t} ===`);
  console.log(`  行数: ${await n(`select count(*)::int as n from ${t}`)}`);
  const orphan = await n(`select count(*)::int as n from ${t} l
                           where not exists (select 1 from public.users u where u.id = l.user_id)`);
  console.log(`  🔴 孤児（users にいない user_id）: ${orphan}`);
  const badRef = await n(`select count(*)::int as n from ${t} l
                           where l.ref_id is not null
                             and not exists (select 1 from races r where r.id = l.ref_id)`);
  console.log(`  ref_id が races に無い行: ${badRef}`);
  for (const r of await rows(`select reason, count(*)::int as n, sum(delta)::bigint as total from ${t} group by 1 order by 1`))
    console.log(`    ${String(r.reason).padEnd(16)} ${String(r.n).padStart(4)} 行 / 合計 ${r.total}`);
}

console.log('\n=== ★検査が残しそうな他のもの ===');
for (const [label, q] of [
  ['race_odds（cycle_index >= 100000 のレースの）',
   `select count(*)::int as n from race_odds o join races r on r.id=o.race_id where r.cycle_index >= 100000`],
  ['bets（同上）', `select count(*)::int as n from bets b join races r on r.id=b.race_id where r.cycle_index >= 100000`],
  ['race_entries（レースが無い孤児）',
   `select count(*)::int as n from race_entries e where not exists (select 1 from races r where r.id=e.race_id)`],
  ['horses に owner_id があるが users にいない',
   `select count(*)::int as n from horses h where h.owner_id is not null and not exists (select 1 from public.users u where u.id=h.owner_id)`],
  ['owner_id も npc_stable_id も無い馬（★制約の穴）',
   `select count(*)::int as n from horses where owner_id is null and npc_stable_id is null`],
]) console.log(`  ${label}: ${await n(q)}`);
await c.end();
