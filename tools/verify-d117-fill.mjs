/**
 * ★**D-117 の 2 段（公示 → 組成）を、本物の Postgres に通す**（★rollback 付き）
 *
 * ★偽の DB は SQL の文面しか見ません。
 *   ★型の不一致（"operator is not unique" の類）や制約は ★**実 DB でしか出ません**。
 *   ★`pg-store.ts` の `announceRace` / `fillRace` が出す文をそのまま流します。
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**（`loadEnv` の既定は本番）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
// ★取引の中で書くので、本番からは締め出す（R-24・最後に rollback しても錠は掴る）
import { assertNotProduction } from './lib/guard.mjs';
// ★SB-3: 印を使わずに「途中で確定していないか」を確かめる
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-d117-fill.mjs');
const __tx = await beginSandbox(c);

const ok = (b, m) => console.log(`  ${b ? '✅' : '🔴'} ${m}`);
let failed = 0;
const must = (b, m) => { ok(b, m); if (!b) failed += 1; };

try {
  // ★ぶつからない番号（★既存の最大 + 100000）
  const CY = Number((await c.query('select coalesce(max(cycle_index), 0) + 100000 as n from races')).rows[0].n);
  const frozen = (await c.query(
    `select course_frozen from races where course_frozen is not null order by cycle_index desc limit 1`,
  )).rows[0]?.course_frozen;
  if (!frozen) throw new Error('course_frozen を持つレースが 1 件もありません');

  console.log(`--- ① 公示（announceRace の SQL そのまま）cycle=${CY} ---`);
  const ins = await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                        track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status,
                        course_frozen, min_wins, max_wins, entry_fee_ep, weight_kg,
                        entry_deadline_at, game_week)
     values ($1, $2, $3, $4, $8, $9, $12, $10,
             to_timestamp($5 / 1000.0), $6, $7, $11, 'announced',
             $13::jsonb, $14, $15, $16, $17, to_timestamp($18 / 1000.0), $19)
     on conflict (cycle_index) do nothing`,
    // ★並びは `pg-store.ts` の配列と同じ（$1..$19。★SQL 側の placeholder は順不同）
    [CY, `R${CY}`, 1, null, Date.now() + 3600_000, 'commit-x', 'seed-x',
     'turf', 1600, 'star-park', 100000, 'good', JSON.stringify(frozen),
     0, 0, 200, 55, Date.now() + 600_000, 42],
  );
  must(ins.rowCount === 1, `行が 1 件入った（${ins.rowCount}）`);
  const raceId = (await c.query('select id from races where cycle_index = $1', [CY])).rows[0].id;

  console.log('--- ② races_public に出る（★DS-4・オッズが無くても壊れない）---');
  const pub = (await c.query(
    `select status, track_condition, entry_deadline_at is not null as has_deadline
       from races_public where cycle_index = $1`, [CY])).rows[0];
  must(pub !== undefined, 'races_public に見えている');
  must(pub?.status === 'announced', `status = announced（${pub?.status}）`);
  must(pub?.track_condition === 'good', `馬場が公示されている（${pub?.track_condition}）`);
  must(pub?.has_deadline === true, '締切が入っている');
  const oddsN = Number((await c.query(
    `select count(*)::int as n from race_odds where race_id = $1`, [raceId])).rows[0].n);
  must(oddsN === 0, `オッズはまだ 0 件（${oddsN}）`);

  console.log('--- ③ 登録の行を 1 つ作る（★enter_race が作る形）---');
  const horse = (await c.query(
    `select id from horses where owner_id is null and retired_at_week is null limit 1`)).rows[0];
  must(horse !== undefined, '馬が引けた');
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
     values ($1, $2, 1, 55, 'senko', $3::jsonb)`,
    [raceId, horse.id, JSON.stringify({ feeEP: 300 })],
  );
  const hidden = (await c.query(
    `select count(*)::int as all_, count(gate)::int as with_gate
       from race_entries_public where race_id = $1`, [raceId])).rows[0];
  must(hidden.all_ === 1 && hidden.with_gate === 0, `公示のあいだ枠は隠れる（★DF-3・${hidden.with_gate}/${hidden.all_}）`);

  console.log('--- ④ 組成（fillRace の SQL そのまま）---');
  const lock = (await c.query(
    `select id, status from races where cycle_index = $1 for update`, [CY])).rows[0];
  must(lock.status === 'announced', `掴んだ行は announced（${lock.status}）`);

  // ★登録済みの行は**更新**（枠を振り直す・jockey_frozen を消さない）
  const upd = await c.query(
    `update race_entries e
        set gate = v.gate, weight = v.weight, strategy = v.strategy,
            popularity = v.popularity, entrant_snapshot = v.snapshot
       from (select * from unnest($2::uuid[], $3::int[], $4::numeric[], $5::text[], $6::int[], $7::jsonb[])
               as t(horse_id, gate, weight, strategy, popularity, snapshot)) v
      where e.race_id = $1 and e.horse_id = v.horse_id`,
    [raceId, [horse.id], [5], [55], ['sashi'], [2], [JSON.stringify({ horseId: horse.id, gate: 5 })]],
  );
  must(upd.rowCount === 1, `登録の行を更新できた（${upd.rowCount}）`);
  const kept = (await c.query(
    `select gate, strategy, popularity, jockey_frozen from race_entries where race_id = $1`, [raceId])).rows[0];
  must(Number(kept.gate) === 5, `枠が振り直された（${kept.gate}）`);
  must(kept.strategy === 'sashi', `脚質が入った（${kept.strategy}）`);
  must(kept.jockey_frozen?.feeEP === 300, '🔴 ★jockey_frozen が消えていない（★入れ直しでなく更新）');

  // ★NPC を挿入
  const npcs = (await c.query(
    `select id from horses where owner_id is null and id <> $1 limit 3`, [horse.id])).rows.map((r) => r.id);
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity, entrant_snapshot)
     select $1, t.horse_id, t.gate, t.weight, t.strategy, t.popularity, t.snapshot
       from unnest($2::uuid[], $3::int[], $4::numeric[], $5::text[], $6::int[], $7::jsonb[])
         as t(horse_id, gate, weight, strategy, popularity, snapshot)`,
    [raceId, npcs, [1, 2, 3], [55, 55, 55], ['senko', 'senko', 'senko'], [1, 3, 4],
     npcs.map((id) => JSON.stringify({ horseId: id }))],
  );
  const n = Number((await c.query(
    `select count(*)::text as n from race_entries where race_id = $1`, [raceId])).rows[0].n);
  must(n === 4, `出走表が 4 頭（${n}）`);

  await c.query(`update races set status = 'scheduled' where id = $1 and status = 'announced'`, [raceId]);
  const after = (await c.query(`select status from races where id = $1`, [raceId])).rows[0];
  must(after.status === 'scheduled', `発売できる状態になった（${after.status}）`);

  console.log('--- ⑤ 枠が見えるようになる（★対照）---');
  const shown = (await c.query(
    `select count(*)::int as all_, count(gate)::int as with_gate
       from race_entries_public where race_id = $1`, [raceId])).rows[0];
  must(shown.with_gate === shown.all_ && shown.all_ === 4, `4/4 の枠が見える（${shown.with_gate}/${shown.all_}）`);

  console.log('--- ⑥ 二度目の組成は弾かれる（★冪等）---');
  const again = await c.query(
    `update races set status = 'scheduled' where id = $1 and status = 'announced'`, [raceId]);
  must(again.rowCount === 0, `もう announced ではないので 0 行（${again.rowCount}）`);

  console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
  console.log('（rollback しました）');
}
