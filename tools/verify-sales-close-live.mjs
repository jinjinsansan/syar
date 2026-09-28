// @ts-check
/**
 * 🔴 ★**投票の締切（`0096`）を 生きた DB の取引の中で確かめる**（★2026-09-29・レビュー側の条件）
 *
 * 【★確かめること】
 *   ★対照: ★`0096` の前（★いまの place_bet）は ★締切の 1 秒後（＝発走の 59 秒前）でも ★通る（★直す理由の実測）
 *   ★① ★`0096` の後は ★締切の 1 秒前（＝発走の 61 秒前）は ★通る
 *   ★② ★`0096` の後は ★締切の 1 秒後（＝発走の 59 秒前）は ★「発売時間外」で拒まれる
 *   ★③ ★`sales_close_lead_seconds()` は 60
 *
 * 【★DB に何も残さない】
 *   ★全部を ★1 つの取引の中で行い、★最後に ★必ず rollback（★`0096` の本体も ★取引の中で当てて 戻す）。
 *   ⚠️ ★`0096` の `begin;` `commit;` は ★外して流す（★中の commit が 外の取引ごと確定させないように）。
 *   ★`now()` は ★取引の開始時刻で固定なので ★発走の時刻を `now() + 秒` で作れば ★境目がぶれない。
 *
 * ⚠️ ★**必ず `--env staging`**（★`loadEnv` の既定は本番・★本番では止まる）。
 *   npx tsx tools/verify-sales-close-live.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
/** ★/vote が実際に送る 1 口の額（★ここも同じ 1 か所から・★2026-09-29 まで 10 で 制約に必ず落ちていた） */
import { BET_PER_PICK_EP } from '../apps/web/src/lib/claims.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-sales-close-live.mjs');

let failed = 0;
const must = (/** @type {boolean} */ b, /** @type {string} */ m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };

/** ★本体（★begin/commit を外す） */
const MIGRATION = readFileSync('db/migrations/0096_sales_close_before_start.sql', 'utf8')
  .split('\n').filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n');

/**
 * ★発走を `now() + secs` 秒にしたレースで ★/vote と同じ額（`BET_PER_PICK_EP`）を投票してみる（★bets_amount_range は 100 以上・100 刻み）（★savepoint で包み 結果だけ返す）
 * @param {string} uid @param {string} raceId @param {unknown} selection @param {number} secs
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function tryBet(uid, raceId, selection, secs) {
  await c.query('savepoint try_bet');
  try {
    await c.query(`update races set status = 'scheduled', scheduled_at = now() + make_interval(secs => $2) where id = $1`, [raceId, secs]);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await c.query('select public.place_bet($1, $2, $3::jsonb, $4, $5)', [raceId, 'win', JSON.stringify(selection), BET_PER_PICK_EP, randomUUID()]);
    await c.query('rollback to savepoint try_bet');
    return { ok: true, message: '' };
  } catch (e) {
    await c.query('rollback to savepoint try_bet');
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** ★戻したことを数えるため ★取引の前の姿を覚える */
const snap = async () => (await c.query(`select (select count(*) from bets)::int as bets, (select count(*) from users)::int as users,
  (select count(*) from pg_proc where proname = 'sales_close_lead_seconds')::int as fn`)).rows[0];
const before = await snap();

try {
  await c.query('begin');
  /** ★単勝の目が在るレースを 1 つ（★自馬の制限に当たらないよう ★新しい口座で買う） */
  const race = (await c.query(
    /** ★まだ確定していないレース（★確定済みは seed を公開しているので 発走前に戻すと 制約 races_reveal_only_after_close に当たる） */
    `select o.race_id, o.selection from race_odds o join races r on r.id = o.race_id
      where o.bet_type = 'win' and r.status = 'scheduled' and r.seed_reveal is null
      order by r.scheduled_at desc limit 1`,
  )).rows[0];
  if (race === undefined) throw new Error('★単勝のオッズが 1 行も無い（★staging にレースが無い）');
  const uid = randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now(), now())`,
    [uid, `close-${uid.slice(0, 8)}@test.local`],
  );
  await c.query(`insert into users (id, display_name, stable_name, entry_points) values ($1, $2, '検査厩舎', 100000)`, [uid, `検査 ${uid.slice(0, 8)}`]);
  console.log(`★レース ${String(race.race_id).slice(0, 8)}・目 ${JSON.stringify(race.selection)}・★取引の中の口座 ${uid.slice(0, 8)}`);

  console.log('\n★対照（★0096 の前）');
  const before59 = await tryBet(uid, race.race_id, race.selection, 59);
  must(before59.ok, `★発走の 59 秒前（＝締切の 1 秒後）でも 通る（★直す理由）${before59.ok ? '' : `: ${before59.message}`}`);

  await c.query(MIGRATION);
  console.log('\n★0096 を 取引の中で当てた後');
  const lead = Number((await c.query('select public.sales_close_lead_seconds() as s')).rows[0].s);
  must(lead === 60, `★sales_close_lead_seconds() = ${lead}（★60）`);
  const at61 = await tryBet(uid, race.race_id, race.selection, 61);
  must(at61.ok, `★① 発走の 61 秒前（＝締切の 1 秒前）は 通る${at61.ok ? '' : `: ${at61.message}`}`);
  const at59 = await tryBet(uid, race.race_id, race.selection, 59);
  must(!at59.ok && /発売時間外/.test(at59.message), `★② 発走の 59 秒前（＝締切の 1 秒後）は「発売時間外」で拒まれる（${at59.ok ? '★通った' : at59.message}）`);
} finally {
  await c.query('rollback').catch(() => undefined);
}
/** ★戻したことを数える（★取引の前と後で 同じか） */
const after = await snap();
await c.end();
console.log('');
must(JSON.stringify(after) === JSON.stringify(before),
  `★rollback で戻った: 投票 ${before.bets}→${after.bets}・口座 ${before.users}→${after.users}・締切の関数 ${before.fn}→${after.fn}（★前後で同じ）`);
console.log(failed === 0 ? '✅ ★合格' : `🔴 ★不合格 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
