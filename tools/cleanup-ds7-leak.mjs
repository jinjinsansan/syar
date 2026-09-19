/**
 * ★**私が staging に残した検査データを消す**（★2026-09-19・**WK-1/WK-2** の後始末）
 *
 * 【🔴 何を残したか】
 *   ★`tools/verify-ds7-cancel.mjs` は `begin` → `cancelRace(c, …)` → `rollback` の形でした。
 *   ★ところが `cancelRace` は ★**自分で `begin`/`commit` します**。★入れ子の取引は無いので、
 *   ★**内側の `commit` が外側ごと確定**させ、★`rollback` は戻すものがありませんでした。
 *   → ★2 回流したので、★**2 回ぶん残りました**。
 *
 * 【🔴 なぜ消すのか — ★測っているものを、私が動かしています】
 *   ★`RACEABLE_WHERE` も `ACTIVE_WHERE` も ★**`owner_id is null`** で絞ります。
 *   ★所有者を付けた 2 頭は ★**母集団から外れます**（✔ 実測 7,333 → 7,331）。
 *   → ★**AL-11 と VP-9 が測っている集団そのものを汚しています。** ★戻さないと測り直しになります。
 *
 * 【★消す範囲（★名指しできるものだけ）】
 *   ① `races.cycle_index >= 100000` … ★検査は `max + 100000` / `+200000` で作るので、★本物と重なりません
 *   ② ①に紐づく `race_entries`
 *   ③ `public.users.display_name = 'DS7 検査'` と、その `ep_ledger`
 *   ④ ③が所有者になっている `horses.owner_id` を `null` に戻す（★`npc_stable_id` も戻す）
 *   ⑤ `auth.users.email = 'ds7@example.invalid'`
 *
 * ⚠️ ★**他の検査が作ったもの（`a5@test.local` 等）には触りません。** ★私のものだけです。
 * ⚠️ ★**既定は下見だけ。** ★`--write` を付けたときだけ消します（`backfill-entry-prize.mjs` と同じ形）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const WRITE = process.argv.includes('--write');
const env = loadEnv();
console.log('接続先:', env.STAR_ENV, WRITE ? '／★--write（消します）' : '／下見だけ（★--write で消します）');
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'cleanup-ds7-leak.mjs');

const n = async (q, p = []) => Number((await c.query(q, p)).rows[0].n);

/** ★私が所有者にした馬（★`DS7 検査` が持っているものだけ） */
const OWNED = `select h.id from horses h join public.users u on u.id = h.owner_id where u.display_name = 'DS7 検査'`;

console.log('\n=== 下見 ===');
const races = await n(`select count(*)::int as n from races where cycle_index >= 100000`);
const entries = await n(`select count(*)::int as n from race_entries e join races r on r.id = e.race_id where r.cycle_index >= 100000`);
const users = await n(`select count(*)::int as n from public.users where display_name = 'DS7 検査'`);
const ledger = await n(`select count(*)::int as n from ep_ledger l join public.users u on u.id = l.user_id where u.display_name = 'DS7 検査'`);
const horses = await n(`select count(*)::int as n from (${OWNED}) t`);
const auth = await n(`select count(*)::int as n from auth.users where email = 'ds7@example.invalid'`);
console.log(`  races（cycle_index >= 100000）: ${races}`);
console.log(`  race_entries（上に紐づく）    : ${entries}`);
console.log(`  public.users（DS7 検査）      : ${users}`);
console.log(`  ep_ledger（上の人の）         : ${ledger}`);
console.log(`  所有者を付けた馬              : ${horses}`);
console.log(`  auth.users（ds7@…）           : ${auth}`);

if (!WRITE) {
  console.log('\n（下見だけ。★消すには --write）');
  await c.end();
  process.exit(0);
}

await c.query('begin');
try {
  // ★順は外部キーの向きどおり（★子から）
  await c.query(`delete from race_entries where race_id in (select id from races where cycle_index >= 100000)`);
  await c.query(`delete from race_odds where race_id in (select id from races where cycle_index >= 100000)`);
  /**
   * 🔴 ⚠️ ★**元の `npc_stable_id` は戻せません。**
   *   ★`horses_owner_xor_npc` があるので、★`owner_id` を付けたとき ★**`npc_stable_id` は null にされました**。
   *   ✔ ★確かめました: ★`birth_snapshot` は null で、★どこにも控えがありません。
   *   → ★★**2 頭の「所属厩舎」は失われました。** ★戻すのは「厩舎に属している」ことだけです。
   *
   *   ★影響: ★① 市場の候補（`npc_stable_id is not null`）… ★**戻ります**
   *          ★② `race_entries_public.owner_label`（`npc_stables.prefix`）… ★**2 頭だけ別の名前**になります
   *   ★`md5(id)` から決めるので、★**40 厩舎に散らばり**、★同じ入力なら同じ厩舎です。
   */
  await c.query(`update horses h set owner_id = null, npc_stable_id = (
                   select s.id from npc_stables s order by s.id
                    offset (('x' || substr(md5(h.id::text), 1, 8))::bit(32)::bigint
                            % (select count(*) from npc_stables)) limit 1)
                  where h.id in (${OWNED})`);
  await c.query(`delete from ep_ledger where user_id in (select id from public.users where display_name = 'DS7 検査')`);
  await c.query(`delete from races where cycle_index >= 100000`);
  await c.query(`delete from public.users where display_name = 'DS7 検査'`);
  await c.query(`delete from auth.users where email = 'ds7@example.invalid'`);
  await c.query('commit');
  console.log('\n✅ 消しました');
} catch (e) {
  await c.query('rollback');
  console.log(`\n🔴 失敗（rollback しました）: ${e.message}`);
  process.exitCode = 1;
}

console.log('\n=== 後始末のあと ===');
console.log(`  races（cycle_index >= 100000）: ${await n(`select count(*)::int as n from races where cycle_index >= 100000`)}`);
console.log(`  public.users（DS7 検査）      : ${await n(`select count(*)::int as n from public.users where display_name = 'DS7 検査'`)}`);
console.log(`  所有者の付いた馬（全体）      : ${await n(`select count(*)::int as n from horses where owner_id is not null`)}`);
console.log(`  ★ACTIVE_WHERE の頭数         : ${await n(`select count(*)::int as n from horses where retired_at_week is null and owner_id is null`)}`);
await c.end();
