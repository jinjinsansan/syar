/**
 * ★**SY-1 の「自分のレースを写す」部分だけを確かめる**（★2026-09-19・rollback 付き）
 *
 * ⚠️ ★`verify-v11-synthetic.mjs` そのものは ★**わざと書く道具**なので流しません。
 *    ★私が足した ★**写し／消し の SQL だけ**を、同じ文で確かめます。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-sy1-clone.mjs');
const __tx = await beginSandbox(c);
let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
const n = async (q, p = []) => Number((await c.query(q, p)).rows[0].n);
try {
  const BASE = 900000;
  const src = (await c.query(
    `select r.id, r.cycle_index from races r
      where r.status = 'settled'
        and exists (select 1 from race_entries e where e.race_id = r.id and e.entrant_snapshot is not null)
        and exists (select 1 from race_odds o where o.race_id = r.id)
      order by r.cycle_index desc limit 1`)).rows[0];
  must(src !== undefined, `写し元が引けた（cycle=${src?.cycle_index}）`);
  const srcE = await n(`select count(*)::int as n from race_entries where race_id=$1 and scratched_at is null`, [src.id]);
  const srcO = await n(`select count(*)::int as n from race_odds where race_id=$1`, [src.id]);
  console.log(`  写し元: 出走 ${srcE} 頭 / オッズ ${srcO} 行`);

  const CY = BASE;
  await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance, track_condition,
                        course_id, scheduled_at, seed_commit, server_seed, purse, status, course_frozen,
                        min_wins, max_wins, entry_fee_ep, weight_kg, entry_deadline_at, game_week)
     select $1, '★V-11 検査用', class_rank, grade, surface, distance, track_condition,
            course_id, now() + interval '30 minutes', seed_commit, server_seed, purse, 'scheduled', course_frozen,
            min_wins, max_wins, entry_fee_ep, weight_kg, now() + interval '5 minutes', game_week
       from races where id = $2`, [CY, src.id]);
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity, entrant_snapshot)
     select (select id from races where cycle_index = $1), horse_id, gate, weight, strategy, popularity, entrant_snapshot
       from race_entries where race_id = $2 and scratched_at is null`, [CY, src.id]);
  await c.query(
    `insert into race_odds (race_id, bet_type, selection, probability, odds, capped)
     select (select id from races where cycle_index = $1), bet_type, selection, probability, odds, capped
       from race_odds where race_id = $2`, [CY, src.id]);
  const newId = (await c.query(`select id from races where cycle_index=$1`, [CY])).rows[0].id;
  must(await n(`select count(*)::int as n from race_entries where race_id=$1`, [newId]) === srcE, '出走表が同じ頭数で写った');
  must(await n(`select count(*)::int as n from race_odds where race_id=$1`, [newId]) === srcO, 'オッズが同じ行数で写った');
  must(await n(`select count(*)::int as n from race_entries where race_id=$1 and entrant_snapshot is not null`, [newId]) === srcE,
    '★凍結（entrant_snapshot）も写った（★settleRace が動く条件）');
  must(await n(`select count(*)::int as n from races where id=$1 and status='scheduled' and scheduled_at > now()`, [newId]) === 1,
    '★発売中・これから発走の形になっている');

  console.log('--- 消す（dropTestRace と同じ文）---');
  await c.query(`delete from horse_story_event where race_id in (select id from races where cycle_index >= $1)`, [BASE]);
  await c.query(`delete from race_odds where race_id in (select id from races where cycle_index >= $1)`, [BASE]);
  await c.query(`delete from race_entries where race_id in (select id from races where cycle_index >= $1)`, [BASE]);
  await c.query(`delete from races where cycle_index >= $1`, [BASE]);
  must(await n(`select count(*)::int as n from races where cycle_index >= $1`, [BASE]) === 0, '写したものが消えた');
  must(await n(`select count(*)::int as n from races where id=$1`, [src.id]) === 1, '★写し元は残っている（★本物に触っていない）');
  must(await n(`select count(*)::int as n from race_entries where race_id=$1`, [src.id]) === srcE, '★写し元の出走表も無事');
  console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
}
