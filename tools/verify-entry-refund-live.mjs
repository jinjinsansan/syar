// @ts-check
/**
 * 🔴 ★**出走の取消（D-123 ①）を 生きた DB の取引の中で確かめる**（★2026-09-29・レビュー側の条件 ⑥「EP が戻ることを数字で」）
 *
 * 【★確かめること】
 *   ★① ★`my_open_entries`（`0097`）が ★本人の登録を ★段つきで返す（★announced）
 *   ★② ★`request_entry_scratch`（`0079`）が ★announced の間は受け、★依頼を積む
 *   ★③ ★ワーカーの経路（`scratchEntry`・D-111 ⑤）で ★出走料＋騎手の料金が ★EP で戻る（★残高が 数字で戻る）
 *   ★④ ★scheduled（出走表が出た後）は ★「もう取り消せません」で拒まれる
 *   ★⑤ ★PP の台帳は 1 行も増えない
 *
 * 【★DB に何も残さない】 ★全部を ★1 つの取引の中で行い ★最後に ★必ず rollback。
 *   ⚠️ ★ワーカーの `runEntryScratch` は ★自分で begin/commit する（★外の取引ごと確定させる）ので ★呼ばない。
 *      ★代わりに ★runner と同じ形で 取消の対象を組み、★既存の `scratchEntry` を呼ぶ（★返し方を 2 通りにしない）。
 *   ⚠️ ★`0097` の `begin;` `commit;` は ★外して ★取引の中で当てる（★staging に未適用でも測れる）。
 *
 * ⚠️ ★**必ず `--env staging`**（★`loadEnv` の既定は本番・★本番では止まる）。
 *   npx tsx tools/verify-entry-refund-live.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { scratchEntry, jockeyFeeOfFrozen } from '../apps/worker/src/scratch.ts';
import { JOCKEYS } from '../packages/scheduler/src/jockeys.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-entry-refund-live.mjs');

let failed = 0;
const must = (/** @type {boolean} */ b, /** @type {string} */ m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };

const MIGRATION = readFileSync('db/migrations/0097_my_open_entries.sql', 'utf8')
  .split('\n').filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n');

const snap = async () => (await c.query(`select (select count(*) from ep_ledger)::int as ep, (select count(*) from pp_ledger)::int as pp,
  (select count(*) from entry_scratch_requests)::int as req, (select count(*) from race_entries where scratched_at is not null)::int as scr`)).rows[0];
const before = await snap();

try {
  await c.query('begin');
  await c.query(MIGRATION);
  /** ★対象: ★利用者の馬の まだ取消になっていない登録を 1 件（★レースの段は この取引の中で announced に戻す） */
  const t = (await c.query(`select e.id as entry_id, e.race_id, e.horse_id, e.jockey_frozen, h.owner_id, r.entry_fee_ep
      from race_entries e join horses h on h.id = e.horse_id join races r on r.id = e.race_id
     where h.owner_id is not null and e.scratched_at is null
     order by r.scheduled_at desc limit 1`)).rows[0];
  if (t === undefined) throw new Error('★利用者の馬の登録が staging に 1 件もありません（★測れない・0 と読まない）');
  await c.query(`update races set status = 'announced' where id = $1`, [t.race_id]);
  const jockeyFee = jockeyFeeOfFrozen(t.jockey_frozen, t.entry_id);
  const expected = Number(t.entry_fee_ep) + jockeyFee;
  const bal = async () => Number((await c.query('select entry_points from users where id = $1', [t.owner_id])).rows[0].entry_points);
  const pp0 = Number((await c.query('select count(*)::int as n from pp_ledger')).rows[0].n);
  const bal0 = await bal();
  console.log(`  対象: 登録 ${t.entry_id.slice(0, 8)}… 出走料 ${t.entry_fee_ep} EP ＋ 騎手 ${jockeyFee} EP ＝ 戻るはず ${expected} EP・残高 ${bal0}`);

  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: t.owner_id, role: 'authenticated' })]);
  await c.query('set local role authenticated');
  const open = (await c.query('select * from public.my_open_entries()')).rows;
  const mine = open.find((r) => r.entry_id === t.entry_id);
  must(mine !== undefined && mine.race_status === 'announced', `① my_open_entries が 本人の登録を announced で返す（${open.length} 件）`);
  /** ★④ scheduled（出走表が出た後）は拒む（★取消の前に savepoint で試して戻す） */
  await c.query('savepoint s4');
  await c.query('reset role');
  await c.query(`update races set status = 'scheduled' where id = $1`, [t.race_id]);
  await c.query('set local role authenticated');
  let refused = '';
  try { await c.query('select * from public.request_entry_scratch($1, $2)', [randomUUID(), t.entry_id]); } catch (e) { refused = e instanceof Error ? e.message : String(e); }
  await c.query('rollback to savepoint s4');
  must(refused.includes('もう取り消せません'), `④ scheduled（出走表が出た後）は拒む（「${refused}」）`);
  const reqId = randomUUID();
  const req = (await c.query('select * from public.request_entry_scratch($1, $2)', [reqId, t.entry_id])).rows[0];
  must(req?.status === 'pending', `② request_entry_scratch が受けて 依頼を積んだ（${req?.status}）`);
  await c.query('reset role');

  /** ★ワーカーと同じ形で 取消の対象を組み、★既存の scratchEntry を呼ぶ */
  const r = await scratchEntry(c, { entryId: t.entry_id, raceId: t.race_id, horseId: t.horse_id, jockeyFeeEP: jockeyFee }, 'owner_request');
  const bal1 = await bal();
  must(bal1 - bal0 === expected, `③ 残高 ${bal0} → ${bal1}（+${bal1 - bal0} EP・★出走料＋騎手の料金 ${expected} EP と一致・scratchEntry は ${r.refundedEp} EP と報告）`);
  const pp1 = Number((await c.query('select count(*)::int as n from pp_ledger')).rows[0].n);
  must(pp1 === pp0, `⑤ PP の台帳は増えない（${pp0} → ${pp1}）`);

  /**
   * ★⑥ **騎手つきの往復**（★2026-09-29・レビュー側の条件「在ることと 正しい額が戻ることは別」）。
   *   ★料金のある騎手で ★`enter_race` から登録（★出走料＋騎手の料金が引かれる）→ ★runner と同じ形で `scratchEntry` →
   *   ★残高が ★登録の前に戻ること・★戻った額が 出走料＋騎手の料金 であることを見る。
   *   ★場は この取引の中で作る（★別のレースを announced・締切 1 時間後・資格 0〜99 に倒し、★残高を足す）。
   */
  /** ★騎手は TS の名簿（正）から取る（★jockeys の表は利用者から閉じていて、道具も直に読まない・jockeys-closed ②） */
  const top = [...JOCKEYS].sort((x, y) => y.feeEP - x.feeEP)[0];
  const jockey = top === undefined || top.feeEP <= 0 ? undefined : { id: top.id, fee_ep: top.feeEP };
  if (jockey === undefined) throw new Error('★料金のある騎手が名簿に居ない（★騎手つきの返金を測れない）');
  const r2 = (await c.query(`select r.id from races r where r.id <> $1
      and not exists (select 1 from race_entries e where e.race_id = r.id and e.horse_id = $2)
     order by r.scheduled_at desc limit 1`, [t.race_id, t.horse_id])).rows[0];
  if (r2 === undefined) throw new Error('★登録に使えるレースが無い');
  await c.query(`update races set status = 'announced', entry_deadline_at = now() + interval '1 hour',
      min_wins = 0, max_wins = 99, entry_fee_ep = coalesce(entry_fee_ep, 200), weight_kg = coalesce(weight_kg, 55) where id = $1`, [r2.id]);
  await c.query('update users set entry_points = entry_points + 10000 where id = $1', [t.owner_id]);
  const fee2 = Number((await c.query('select entry_fee_ep from races where id = $1', [r2.id])).rows[0].entry_fee_ep);
  const b0 = await bal();
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: t.owner_id, role: 'authenticated' })]);
  await c.query('set local role authenticated');
  const entryId = (await c.query('select public.enter_race($1, $2, $3, $4, $5) as id', [r2.id, t.horse_id, 'sashi', jockey.id, randomUUID()])).rows[0].id;
  await c.query('reset role');
  const b1 = await bal();
  const row = (await c.query('select jockey_frozen from race_entries where id = $1', [entryId])).rows[0];
  const jfee = jockeyFeeOfFrozen(row.jockey_frozen, entryId);
  must(b0 - b1 === fee2 + Number(jockey.fee_ep), `⑥ 登録で 出走料 ${fee2} ＋ 騎手 ${jockey.fee_ep}（${jockey.id}）を引いた（${b0} → ${b1}・−${b0 - b1} EP）`);
  const r6 = await scratchEntry(c, { entryId, raceId: r2.id, horseId: t.horse_id, jockeyFeeEP: jfee }, 'owner_request');
  const b2 = await bal();
  must(b2 === b0 && b2 - b1 === fee2 + Number(jockey.fee_ep), `⑥ 取消で 出走料＋騎手の料金が戻った（${b1} → ${b2}・+${b2 - b1} EP・scratchEntry は ${r6.refundedEp} EP と報告・登録の前 ${b0} に一致）`);
} catch (e) {
  must(false, `★途中で落ちました: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await c.query('rollback').catch(() => undefined);
}
const after = await snap();
must(JSON.stringify(before) === JSON.stringify(after), `★DB に何も残っていない（前 ${JSON.stringify(before)} ／ 後 ${JSON.stringify(after)}）`);
await c.end();
console.log(failed === 0 ? '\n★合格' : `\n🔴 ${failed} 件 落ちました`);
process.exitCode = failed === 0 ? 0 : 1;
