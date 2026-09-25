// @ts-check
/**
 * ★**取消の馬を「登録した馬」として返していないか**（★D-117 DS-2・★rollback 付き）
 *
 * 🔴 ★返すと何が起きるか:
 *   ★もう走らないと決まった馬を「必ず入れる馬」として出走表に押し込み、
 *   ★`fillRace` の件数照合（★取消でない行だけを数える）が**必ず食い違って投げます**。
 *   → ★そのレースは永久に組成できず、★DS-7 で中止。★**1 頭の取消がレースごと落とします。**
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
// ★取引の中で書くので、本番からは締め出す（R-24・最後に rollback しても錠は掴る）
import { assertNotProduction } from './lib/guard.mjs';
// ★SB-3: 印を使わずに「途中で確定していないか」を確かめる
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { createHash, createHmac } from 'node:crypto';

const hash = {
  sha256: (m) => createHash('sha256').update(m).digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m).digest('hex'),
};

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-registered-excludes-scratched.mjs');
const __tx = await beginSandbox(c);

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };

try {
  const store = createPgStore(c, hash);
  const CY = Number((await c.query('select coalesce(max(cycle_index), 0) + 300000 as n from races')).rows[0].n);
  const frozen = (await c.query(
    `select course_frozen from races where course_frozen is not null order by cycle_index desc limit 1`)).rows[0].course_frozen;
  await c.query(
    `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                        track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status,
                        course_frozen, min_wins, max_wins, entry_fee_ep, weight_kg, entry_deadline_at, game_week)
     values ($1, $2, 1, null, 'turf', 1600, 'good', 'star-park',
             to_timestamp($3 / 1000.0), 'c', 's', 100000, 'announced',
             $4::jsonb, 0, 0, 200, 55, to_timestamp($5 / 1000.0), 42)`,
    [CY, `R${CY}`, Date.now() + 600_000, JSON.stringify(frozen), Date.now() - 60_000],
  );
  const raceId = (await c.query('select id from races where cycle_index = $1', [CY])).rows[0].id;

  const horses = (await c.query(
    `select id from horses where owner_id is null and retired_at_week is null limit 3`)).rows.map((r) => r.id);
  must(horses.length === 3, `馬を 3 頭引けた（${horses.length}）`);
  for (let i = 0; i < 3; i += 1) {
    await c.query(
      `insert into race_entries (race_id, horse_id, gate, weight, strategy) values ($1, $2, $3, 55, 'senko')`,
      [raceId, horses[i], i + 1],
    );
  }

  console.log('--- ① 取消が 0 頭なら 3 頭とも返る（★対照）---');
  const all = await store.registeredHorses(CY);
  must(all.length === 3, `3 頭（${all.length}）`);

  console.log('--- ② 1 頭を取消にすると、その馬は返らない ---');
  await c.query(
    `update race_entries set scratched_at = now(), scratch_reason = '検査'
      where race_id = $1 and horse_id = $2`, [raceId, horses[1]]);
  const left = await store.registeredHorses(CY);
  must(left.length === 2, `2 頭（${left.length}）`);
  must(!left.includes(horses[1]), '取消にした馬が入っていない');
  must(left.includes(horses[0]) && left.includes(horses[2]), '残り 2 頭はそのまま');

  console.log('--- ③ 全部取消なら 0 頭（★R-21: 0 を「該当なし」と読まないため、件数も出す）---');
  await c.query(
    `update race_entries set scratched_at = now(), scratch_reason = '検査'
      where race_id = $1 and scratched_at is null`, [raceId]);
  const none = await store.registeredHorses(CY);
  must(none.length === 0, `0 頭（${none.length}）`);
  const rows = Number((await c.query(
    `select count(*)::int n from race_entries where race_id = $1`, [raceId])).rows[0].n);
  must(rows === 3, `★行そのものは 3 件 残っている（${rows}）＝ 消していない（理由と返金の記録）`);

  console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
  console.log('（rollback しました）');
}
