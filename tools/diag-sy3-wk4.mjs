/**
 * ★**SY-3: `verify-v11-synthetic` が何本 消費したか／WK-4: ワーカーはなぜ止まったか**
 * （★2026-09-19・読むだけ）
 *
 * 【★2 つの原因を分ける】
 *   ★`scheduled` が 1 件しかないのは、★**この道具のせい**とは限りません。
 *   ★**ワーカーが 09-16 に止まった**ので、★新しいレースが生まれていないだけかもしれません。
 *
 * 【★見分け方】
 *   ★ワーカーは ★**`scheduled_at` を過ぎてから**確定します（`pendingSettlements`: `scheduled_at <= now()`）。
 *   ★この道具は ★**`scheduled_at > now()` のレース**を取って、その場で確定させます。
 *   → ★**確定した時刻が `scheduled_at` より前なら、この道具**です。
 *   ★確定の時刻は `horse_story_event.created_at`（★確定の中で書かれる・§18）で近似します。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
const rows = async (q) => (await c.query(q)).rows;
const n = async (q) => Number((await c.query(q)).rows[0].n);

console.log('\n=== SY-3: 確定の時刻 対 発走予定時刻 ===');
const cols = (await rows(`select column_name from information_schema.columns
                           where table_name='horse_story_event' and table_schema='public'`)).map(r=>r.column_name);
console.log('  horse_story_event の列:', cols.join(', '));

const q = `select r.cycle_index, r.status, r.scheduled_at,
                  min(e.created_at) as settled_about
             from races r join horse_story_event e on e.race_id = r.id
            group by 1,2,3 order by r.cycle_index`;
let early = 0, late = 0;
try {
  for (const x of await rows(q)) {
    const before = x.settled_about < x.scheduled_at;
    if (before) early += 1; else late += 1;
  }
  console.log(`  ★発走予定より**前**に確定 = この道具の印: ${early} 件`);
  console.log(`  ★発走予定より**後**に確定 = ワーカーの印  : ${late} 件`);
} catch (e) { console.log('  （story から辿れません:', e.message.split('\n')[0], '）'); }

console.log('\n=== 参考: races の内訳 ===');
for (const r of await rows(`select status, count(*)::int as n, min(scheduled_at) as lo, max(scheduled_at) as hi
                              from races group by 1 order by 1`))
  console.log(`  ${String(r.status).padEnd(10)} ${String(r.n).padStart(3)} 件  発走 ${r.lo?.toISOString().slice(0,16)} .. ${r.hi?.toISOString().slice(0,16)}`);

console.log('\n=== WK-4: ワーカーが最後に何かした時刻 ===');
for (const [label, q2] of [
  ['最後に作られたレース', `select max(created_at) as t from races`],
  ['最後に発走予定のレース', `select max(scheduled_at) as t from races`],
  ['最後の story', `select max(created_at) as t from horse_story_event`],
  ['最後の unlock_daily', `select max(created_at) as t from unlock_daily`],
]) {
  try { console.log(`  ${label}: ${(await rows(q2))[0].t?.toISOString() ?? '(無し)'}`); }
  catch { console.log(`  ${label}: (表が無い)`); }
}
console.log(`\n  ★これから発走するレース（scheduled_at > now()）: ${await n(`select count(*)::int as n from races where scheduled_at > now()`)} 件`);
await c.end();
