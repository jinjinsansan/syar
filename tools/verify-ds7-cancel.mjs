/**
 * ★**DS-7: 組成が間に合わなかったレースを、本当に中止して返金できるか**（★rollback 付き）
 *
 * 🔴 ★**偽の DB では緑でした。** ★`d117-two-phase-loop.test.ts` の `cancelRace` は
 *   ★私が書いた偽物で、★**言われたとおり中止した**ことにしていました。
 *   ★実物は `where status = 'scheduled'` だったので、★**0 行返して何もしません**でした。
 *   → ★★これが「✅ が別の理由で出ていないか」そのものです。★実 DB で確かめます。
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**（`loadEnv` の既定は本番）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
// ★取引の中で書くので、本番からは締め出す（R-24・最後に rollback しても錠は掴る）
import { assertNotProduction } from './lib/guard.mjs';
import { cancelRace } from '../apps/worker/src/cancel.ts';
/**
 * 🔴 ★**`cancelRace` は自分で `begin`/`commit` します。**
 *   ★入れ子の取引は無いので、★内側の `commit` は ★**外側ごと確定**させます。
 *   → ★この検査は 2026-09-19 に ★**staging を汚しました**（★レース 2 件・所有馬 2 頭・1,000 EP）。
 *   → ★取引の文を横取りする包みを渡します。★確定するかは**外側だけ**が決めます。
 */
import { sandboxTx } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-ds7-cancel.mjs');
await c.query('begin');

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };

try {
  const CY = Number((await c.query('select coalesce(max(cycle_index), 0) + 200000 as n from races')).rows[0].n);
  const frozen = (await c.query(
    `select course_frozen from races where course_frozen is not null order by cycle_index desc limit 1`)).rows[0].course_frozen;

  console.log(`--- 下ごしらえ: 公示だけのレース cycle=${CY} を作る ---`);
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

  /**
   * ★所有者のいる馬（＝プレイヤーの登録）を 1 頭でっち上げる。
   * ⚠️ ★staging に ★**`public.users` は 0 件**です（★`/setup` がまだ繋がっていない）。
   *    → ★この取引の中で 1 人だけ作ります（★`rollback` で消えます）。
   */
  let user = (await c.query(`select id, entry_points from public.users limit 1`)).rows[0];
  if (user === undefined) {
    /**
     * ⚠️ ★`public.users.id` は `auth.users.id` を参照しています（Supabase）。
     *    → ★先に `auth.users` に 1 行。★`rollback` で両方消えます。
     */
    const auth = (await c.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ds7@example.invalid')
       returning id`)).rows[0];
    user = (await c.query(
      `insert into public.users (id, display_name, stable_name, entry_points)
       values ($1, 'DS7 検査', 'DS7 厩舎', 100000)
       returning id, entry_points`, [auth.id])).rows[0];
    console.log('  （users が 0 件だったので、この取引の中で 1 人作りました）');
  }
  must(user !== undefined, 'ユーザーが引けた');
  const horse = (await c.query(
    `select id from horses where owner_id is null and retired_at_week is null limit 1`)).rows[0];
  /**
   * ⚠️ ★`horses_owner_xor_npc`: ★所有者と NPC 厩舎は**同時に持てません**。
   *    → ★買われた馬と同じ形にします（★`npc_stable_id` を外す）。
   */
  await c.query(
    `update horses set owner_id = $1, npc_stable_id = null where id = $2`, [user.id, horse.id]);
  await c.query(
    `insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
     values ($1, $2, 1, 55, 'senko', $3::jsonb)`,
    [raceId, horse.id, JSON.stringify({ feeEP: 300 })],
  );
  const before = Number((await c.query(`select entry_points from public.users where id = $1`, [user.id])).rows[0].entry_points);
  console.log(`  登録 1 頭 / 所有者の EP ${before}（登録料 200 ＋ 騎手 300 を払った想定）`);

  console.log('--- ① 公示のままのレースを中止できるか（★旧は 0 行で何もしなかった）---');
  const { client: sandboxed, swallowed } = sandboxTx(c);
  const r = await cancelRace(sandboxed, CY);
  // 🔴 ★横取りが 0 件なら、★包みが効いていない（★製品が取引を張らなくなった等）。★黙って進めない
  must(swallowed.length > 0, `★取引の文を横取りした（${swallowed.join(',') || '★0 件 — 包みが効いていない'}）`);
  must(r.cancelled === true, `中止した（cancelled=${r.cancelled}）`);
  const st = (await c.query(`select status from races where id = $1`, [raceId])).rows[0].status;
  must(st === 'cancelled', `status = cancelled（${st}）`);

  console.log('--- ② 登録料と騎手の料金が返ったか（★馬券は 0 枚）---');
  must(r.refundedBets === 0, `馬券の返還は 0 枚（${r.refundedBets}）`);
  must(r.refundedEp === 500, `返金 500 EP（登録料 200 ＋ 騎手 300）＝ ${r.refundedEp}`);
  const after = Number((await c.query(`select entry_points from public.users where id = $1`, [user.id])).rows[0].entry_points);
  must(after === before + 500, `所有者の EP が ${before} → ${after}`);

  console.log('--- ③ 取消の理由が残っているか（★黙って消さない・D-111 ⑤）---');
  const e = (await c.query(
    `select scratched_at, scratch_reason from race_entries where race_id = $1`, [raceId])).rows[0];
  must(e.scratched_at !== null, '取消の時刻が入っている');
  must(typeof e.scratch_reason === 'string' && e.scratch_reason.includes('開催中止'),
    `理由: ${String(e.scratch_reason).slice(0, 40)}`);

  console.log('--- ④ 二度呼んでも二度返さない（★冪等）---');
  const r2 = await cancelRace(sandboxTx(c).client, CY);
  must(r2.cancelled === false, `もう中止済み（cancelled=${r2.cancelled}）`);
  const after2 = Number((await c.query(`select entry_points from public.users where id = $1`, [user.id])).rows[0].entry_points);
  must(after2 === after, `EP が動いていない（${after2}）`);

  console.log('--- ⑤ 確定済みのレースは中止にならない（★結果の事後差し替え・★対照）---');
  await c.query(`update races set status = 'settled' where id = $1`, [raceId]);
  const r3 = await cancelRace(sandboxTx(c).client, CY);
  must(r3.cancelled === false, `settled は中止にしない（cancelled=${r3.cancelled}）`);

  console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
} finally {
  await c.query('rollback');
  // ★本当に戻ったかを確かめる（★「rollback した」と書くだけにしない）
  const left = Number((await c.query(
    `select count(*)::int as n from races where cycle_index >= 200000`)).rows[0].n);
  console.log(left === 0 ? '✅ ★戻りました（検査のレースは 0 件）' : `🔴 ★戻っていません（${left} 件 残っている）`);
  await c.end();
  console.log('（rollback しました）');
}
