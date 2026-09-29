// @ts-check
/**
 * 🔴 ★**発走時刻からの着順（0098）を 生きた DB で確かめる**（★2026-09-29・レビュー側 B 条件 2・3・5）
 *
 * 【★確かめること】（★確定済みのレースを 1 つ ★予行の中で「発走前」に戻して ★本物の resolveRace / settleRace を通す）
 *   ① ★resolveRace（① 決める）が ★race_live_results に着順を書き ★元の着順と一致する（★決定論）
 *   ② ★① の後も ★race_entries.finish_pos・seed_reveal・bets・PP 台帳は ★動かない（★払戻は ② まで）
 *   ③ ★発走前は ★anon・authenticated の両方で ★race_entries_public の着順が null
 *   ④ ★race_live_results は ★anon・authenticated から ★直に読めない
 *   ⑤ ★発走時刻を過ぎると ★race_entries_public に ① の着順が出る（★anon・authenticated）
 *   ⑥ ★中止（cancelled）では ★発走後でも出ない
 *   ⑦ ★② の番人: ★① を書き換えると ★settleRace は LiveResultMismatchError で止まる（★確定しない）
 *   ⑧ ★settleRace（② 締める）が ★① と一致して確定し ★race_entries.finish_pos が元どおりになる
 *
 * ⚠️ ★**書きますが、★必ず戻します**（`beginSandbox` / `endSandbox`・SB-3）。★resolveRace・settleRace は ★自分で commit するので `sandboxTx` で包む。
 * ⚠️ ★本番には向けません（`assertNotProduction`）。★`now()` は ★取引の頭で止まるので ★発走時刻は `now() ± 秒` で作る。
 *
 *   npx tsx tools/verify-live-results.mjs --env staging
 */
import pg from 'pg';
import { createHash, createHmac } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox, sandboxTx } from './lib/sandbox-tx.mjs';
import '../apps/worker/src/pg-types.ts';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-live-results.mjs');

let fail = 0;
const check = (/** @type {boolean} */ ok, /** @type {string} */ label, detail = '') => {
  if (!ok) fail += 1;
  console.log(`  ${ok ? '✅' : '🔴'} ${label}${detail === '' ? '' : `  ${detail}`}`);
};
const hash = {
  sha256: (/** @type {string} */ m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (/** @type {string} */ k, /** @type {string} */ m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

/** ★役を切り替えて 公開ビューの着順を読む（★savepoint で包み ★役は必ず戻す） */
async function publicFinish(/** @type {string} */ raceId, /** @type {'anon'|'authenticated'} */ role, /** @type {string} */ uid) {
  await c.query('savepoint as_role');
  try {
    if (role === 'authenticated') await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await c.query(`set local role ${role}`);
    const r = await c.query('select gate, finish_pos from race_entries_public where race_id = $1 order by gate', [raceId]);
    return r.rows.map((x) => x.finish_pos);
  } finally { await c.query('rollback to savepoint as_role'); }
}
async function directRead(/** @type {'anon'|'authenticated'} */ role) {
  await c.query('savepoint direct');
  try {
    await c.query(`set local role ${role}`);
    await c.query('select * from race_live_results limit 1');
    return 'read';
  } catch (e) { return e instanceof Error ? e.message : String(e); } finally { await c.query('rollback to savepoint direct'); }
}

const tx = await beginSandbox(c);
try {
  const uid = (await c.query('select id from users order by created_at limit 1')).rows[0]?.id ?? '00000000-0000-0000-0000-000000000000';
  const race = (await c.query(`select r.id, r.cycle_index from races r
      where r.status = 'settled'
        and (select count(*) from race_entries e where e.race_id = r.id and e.scratched_at is null and e.entrant_snapshot is not null and e.finish_pos is not null) >= 2
      order by r.scheduled_at desc limit 1`)).rows[0];
  if (race === undefined) throw new Error('★予行に使える確定済みのレースが staging にありません（★測れない・0 と読まない）');
  const cycle = Number(race.cycle_index);
  const original = (await c.query('select gate, finish_pos, finish_time from race_entries where race_id = $1 and scratched_at is null order by gate', [race.id])).rows;
  console.log(`  対象: cycle ${cycle}（${original.length} 頭）`);

  /** ★「発走 2 分前・① 前」に戻す */
  await c.query(`update races set status = 'scheduled', seed_reveal = null, scheduled_at = now() + interval '120 seconds' where id = $1`, [race.id]);
  await c.query('update race_entries set finish_pos = null, finish_time = null, cap_violations = null, prize_pp = null where race_id = $1', [race.id]);
  await c.query('delete from race_live_results where race_id = $1', [race.id]);
  const snap = async () => (await c.query(`select
      (select count(*) from pp_ledger)::int as pp,
      (select count(*) from bets where race_id = $1 and status = 'pending')::int as pending,
      (select seed_reveal from races where id = $1) as seed,
      (select count(*) from race_entries where race_id = $1 and finish_pos is not null)::int as written`, [race.id])).rows[0];
  const before = await snap();

  const boxed = sandboxTx(c);
  const store = createPgStore(boxed.client, hash);

  /** ① 決める */
  await store.resolveRace(cycle);
  const live = (await c.query('select gate, finish_pos, finish_time from race_live_results where race_id = $1 order by gate', [race.id])).rows;
  /** ★時刻は 3 桁で揃う（★race_entries.finish_time は numeric(7,3)・① も同じ桁に丸めて書く） */
  const same = live.length === original.length && live.every((l, i) => l.finish_pos === original[i].finish_pos && Math.abs(Number(l.finish_time) - Number(original[i].finish_time)) < 1e-9);
  check(same, '① resolveRace が ① の表に書き、元の着順と一致（★決定論）', `${live.length} 行`);
  const after1 = await snap();
  check(JSON.stringify(after1) === JSON.stringify(before), '② ① の後も race_entries.finish_pos・seed_reveal・bets・PP は動かない', JSON.stringify(after1));

  /** ③ 発走前は 読めない */
  for (const role of /** @type {const} */ (['anon', 'authenticated'])) {
    const fins = await publicFinish(race.id, role, uid);
    check(fins.length > 0 && fins.every((x) => x === null), `③ 発走前は ${role} で着順が null`, `${fins.length} 行`);
  }
  /** ④ ① の表は直に読めない */
  for (const role of /** @type {const} */ (['anon', 'authenticated'])) {
    const r = await directRead(role);
    check(r.includes('permission denied'), `④ race_live_results を ${role} で直に読めない`, r.slice(0, 60));
  }

  /** ⑤ 発走後は 出る */
  await c.query(`update races set scheduled_at = now() - interval '5 seconds' where id = $1`, [race.id]);
  for (const role of /** @type {const} */ (['anon', 'authenticated'])) {
    const fins = await publicFinish(race.id, role, uid);
    check(JSON.stringify(fins) === JSON.stringify(original.map((o) => o.finish_pos)), `⑤ 発走後は ${role} で ① の着順が出る`);
  }
  /** ⑥ 中止では出ない */
  await c.query('savepoint cancelled');
  await c.query(`update races set status = 'cancelled' where id = $1`, [race.id]);
  const finsC = await publicFinish(race.id, 'anon', uid);
  check(finsC.every((x) => x === null), '⑥ 中止（cancelled）では 発走後でも着順が出ない');
  await c.query('rollback to savepoint cancelled');

  /** ⑦ ② の番人 */
  await c.query('savepoint mismatch');
  await c.query('update race_live_results set finish_pos = finish_pos + 100 where race_id = $1 and gate = (select min(gate) from race_live_results where race_id = $1)', [race.id]);
  let mis = '';
  try { await store.settleRace(cycle); } catch (e) { mis = e instanceof Error ? e.name : String(e); }
  check(mis === 'LiveResultMismatchError', '⑦ ① を書き換えると settleRace は LiveResultMismatchError で止まる', mis);
  await c.query('rollback to savepoint mismatch');

  /** ⑧ ② 締める */
  await store.settleRace(cycle);
  const settled = (await c.query('select status from races where id = $1', [race.id])).rows[0]?.status;
  const fin = (await c.query('select gate, finish_pos from race_entries where race_id = $1 and scratched_at is null order by gate', [race.id])).rows;
  check(settled === 'settled' && JSON.stringify(fin.map((f) => f.finish_pos)) === JSON.stringify(original.map((o) => o.finish_pos)),
    '⑧ settleRace が ① と一致して確定し、着順が元どおり', `status=${settled}`);
  check(boxed.swallowed.length > 0, '★取引の文を飲み込んだ（★包みが効いている）', `${boxed.swallowed.length} 文`);
} catch (e) {
  check(false, `★途中で落ちました: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  const end = await endSandbox(c, tx);
  console.log(!end.committed ? '  ✅ ★予行を戻した（★途中の commit なし・SB-3）' : `  🔴 ★予行が戻っていない（取引 ${end.before} → ${end.after}）`);
  if (end.committed) fail += 1;
  await c.end();
}
console.log(fail === 0 ? '\n★合格' : `\n🔴 ${fail} 件 落ちました`);
process.exitCode = fail === 0 ? 0 : 1;
