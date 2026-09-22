/**
 * ★**自分の繁殖牝馬で配合する経路（`kind = 'breed'`）を、本物の DB で通す**（★裁定 `REVIEW_BREED_OWN_MARE_VERDICT_20260922.md`・2026-09-22）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *   ★本番には向けません（`assertNotProduction`）。
 *
 * ============================================================================
 * 【★判定】
 *   ① ★受付（`request_breeding`）: 待ちで積む／同じ ID の再送は前の行／同じ ID で別の依頼は ST040／
 *      ★同じ母・同じ年の 2 件目は ST042／自分の繁殖牝馬でない ST024／持ち主のいる父 ST025／上限 0 は ST023
 *   ② ★確定（`confirmBreeding`）: done・下書き 1 行・★要求に引いた額・★残高が額だけ減る・
 *      ★台帳の最後の行の `balance_after` ＝ `users.entry_points`（★裁定 §4）
 *   ③ ★額が上限を超える依頼 → fee_above_max・★残高も台帳も動かない
 *   ④ ★EP が足りない依頼 → ep_short・★残高も台帳も動かない・★下書きは無い
 *   ⑤ ★読む口（`npc_stallion_facts`）: 事実だけ（★素質・能力・残り枠・額の列が無い）・★総獲得賞金 ＝ `horse_total_prize_pp`
 *   ⑥ ★`horse_total_prize_pp` ＝ 出走の賞金を手で足した値（★取引の中で 2 つに書き・1 つは null のまま）。
 *      ★出走が 3 つ以上ある馬がいない DB（★レースを走らせていない staging）では ★判定しないと明示する（★合格に数えない）
 *   ⑦ ★rollback の後、★要求・下書き・台帳・馬の数が元に戻っている
 *
 * ★使い方: npx tsx tools/verify-breed-own-mare-live.mjs --env staging
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { confirmBreeding, playerBreedingContext } from '../apps/worker/src/player-breeding.ts';
import { npcStudFee, weekIndexAt, WEEKS_PER_YEAR } from '../packages/scheduler/src/index.ts';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';

const env = loadEnv();
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('verify-breed-own-mare-live: STAR_EPOCH_ISO を読めません');

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
await c.connect();
await assertNotProduction(c, 'verify-breed-own-mare-live.mjs');
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};
const asUser = async (userId, fn) => {
  await c.query('savepoint as_user');
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  await c.query('set local role authenticated');
  try {
    const out = await fn();
    await c.query('reset role');
    await c.query('release savepoint as_user');
    return out;
  } catch (e) {
    await c.query('rollback to savepoint as_user');
    await c.query('reset role');
    throw e;
  }
};
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const request = (u, id, dam, sire, max) => asUser(u, async () => (await c.query(
  'select * from request_breeding($1, $2, $3, $4)', [id, dam, sire, max],
)).rows[0]);

let n = 0;
const uuid = () => `0f000000-0000-4000-8000-0000000f8${String(n++).padStart(3, '0')}`;
const U1 = '0f000000-0000-4000-8000-00000000f801';
const U2 = '0f000000-0000-4000-8000-00000000f802';

console.log('# ★自分の繁殖牝馬で配合する経路を、本物の DB で通す（★必ず rollback します）');
const count = async (sql) => Number((await q(sql))[0].n);
const snapshot = async () => ({
  requests: await count('select count(*)::int n from foal_requests'),
  drafts: await count('select count(*)::int n from foal_drafts'),
  ledger: await count('select count(*)::int n from ep_ledger'),
  horses: await count('select count(*)::int n from horses'),
});
const before = await snapshot();

await c.query('begin');
try {
  // ── 準備（★取引の中だけ） ──
  const nowMs = Number((await q('select (extract(epoch from now()) * 1000)::bigint ms'))[0].ms);
  const week = weekIndexAt(nowMs, EPOCH);
  const hadWeek = (await q('select game_week from world_state where id = true')).length > 0;
  if (!hadWeek) await c.query('insert into world_state (id, game_week) values (true, $1)', [week]);
  for (const [u, ep] of [[U1, 1_000_000], [U2, 1]]) {
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
      [u, `verify-breed-own-mare+${u.slice(-4)}@example.invalid`]);
    await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', $2)", [u, ep]);
  }
  const mares = (await q(
    "select id::text id from horses where owner_id is null and sex = 'female' and retirement_role = 'honored'"
      + ' and not bred_this_year and foal_count < $1 and birth_week is not null and $2::bigint - birth_week >= $3'
      + ' order by id limit 12',
    [DEFAULT_BALANCE.MARE_LIFETIME_FOALS, week, DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * WEEKS_PER_YEAR],
  )).map((r) => r.id);
  if (mares.length < 12) throw new Error(`★準備が足りません（産める牝馬 ${mares.length}/12）`);
  // ★U1 に 10 頭・U2 に 2 頭を ★繁殖牝馬として持たせる
  await c.query("update horses set owner_id = $1, npc_stable_id = null, retirement_role = 'broodmare' where id = any($2::uuid[])",
    [U1, mares.slice(0, 10)]);
  await c.query("update horses set owner_id = $1, npc_stable_id = null, retirement_role = 'broodmare' where id = any($2::uuid[])",
    [U2, mares.slice(10, 12)]);
  const sires = await q(
    "select id::text id, g1_wins, horse_total_prize_pp(id)::text prize from horses where owner_id is null and sex = 'male'"
      + " and retirement_role = 'stallion' and birth_week is not null and $1::bigint - birth_week >= $2"
      + ' and coverings_this_year = 0 order by id limit 8',
    [week, DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * WEEKS_PER_YEAR],
  );
  if (sires.length < 1) throw new Error('★準備が足りません（NPC の種牡馬がいません）');
  const feeOf = (s) => npcStudFee(Number(s.g1_wins), Number(s.prize));
  const ownedSire = (await q("select id::text id from horses where owner_id is null and sex = 'male' and retirement_role = 'stallion' order by id desc limit 1"))[0].id;
  await c.query('update horses set owner_id = $1, npc_stable_id = null where id = $2', [U2, ownedSire]);

  // ① 受付
  const r1 = uuid();
  const a = await request(U1, r1, mares[0], sires[0].id, feeOf(sires[0]));
  const a2 = await request(U1, r1, mares[0], sires[0].id, feeOf(sires[0]));
  const codes = {
    st040: (await errOf(() => request(U1, r1, mares[0], sires[0].id, feeOf(sires[0]) + 1)))?.code,
    st042: (await errOf(() => request(U1, uuid(), mares[0], sires[0].id, feeOf(sires[0]))))?.code,
    st024: (await errOf(() => request(U1, uuid(), mares[10], sires[0].id, feeOf(sires[0]))))?.code,
    st025: (await errOf(() => request(U1, uuid(), mares[1], ownedSire, 10_000)))?.code,
    st023: (await errOf(() => request(U1, uuid(), mares[1], sires[0].id, 0)))?.code,
  };
  check(a.status === 'pending' && a2.request_id === r1 && a2.status === 'pending'
    && codes.st040 === 'ST040' && codes.st042 === 'ST042' && codes.st024 === 'ST024'
    && codes.st025 === 'ST025' && codes.st023 === 'ST023',
  '① ★受付: 待ち・再送は前の行・ST040/042/024/025/023', `★${a.status} / 再送 ${a2.status} / ${JSON.stringify(codes)}`);

  // ② 確定（★母と父の組が近交などで断られることがあるので、★成功するまで組を変える）
  const ctx = await playerBreedingContext(c, nowMs, EPOCH, () => {});
  let okReq = null;
  let okFee = null;
  const tried = [];
  for (let i = 0; i < Math.min(8, sires.length) && okReq === null; i += 1) {
    const reqId = i === 0 ? r1 : uuid();
    if (i > 0) await request(U1, reqId, mares[i], sires[i].id, feeOf(sires[i]));
    const bal0 = Number((await q('select entry_points from users where id = $1', [U1]))[0].entry_points);
    const o = await confirmBreeding(c, reqId, ctx);
    const row = (await q('select status, failure_reason, stud_fee_ep from foal_requests where id = $1', [reqId]))[0];
    tried.push(`${o}:${row.failure_reason ?? ''}`);
    if (o === 'done') { okReq = { id: reqId, bal0, row }; okFee = feeOf(sires[i]); }
  }
  if (okReq === null) {
    check(false, '② ★確定', `★成功した組がありません（${tried.join(', ')}）`);
  } else {
    const bal1 = Number((await q('select entry_points from users where id = $1', [U1]))[0].entry_points);
    const last = (await q('select balance_after, delta, reason from ep_ledger where user_id = $1 order by id desc limit 1', [U1]))[0];
    const drafts = Number((await q('select count(*)::int n from foal_drafts where request_id = $1', [okReq.id]))[0].n);
    check(Number(okReq.row.stud_fee_ep) === okFee && bal1 === okReq.bal0 - okFee && drafts === 1
      && Number(last.balance_after) === bal1 && Number(last.delta) === -okFee && last.reason === 'stud_fee',
    '② ★確定: done・下書き 1・額を引く・★台帳の最後の残高 ＝ users.entry_points',
    `★額 ${okFee} / 残高 ${okReq.bal0} → ${bal1} / 台帳 ${last.balance_after}（${last.delta}・${last.reason}） / 下書き ${drafts} / 試した組 ${tried.join(', ')}`);
  }

  // ③ 額が上限を超える
  {
    const s = sires[0];
    const reqId = uuid();
    await request(U1, reqId, mares[9], s.id, Math.max(1, feeOf(s) - 1));
    const bal0 = Number((await q('select entry_points from users where id = $1', [U1]))[0].entry_points);
    const led0 = Number((await q('select count(*)::int n from ep_ledger where user_id = $1', [U1]))[0].n);
    const o = await confirmBreeding(c, reqId, ctx);
    const row = (await q('select failure_reason from foal_requests where id = $1', [reqId]))[0];
    const bal1 = Number((await q('select entry_points from users where id = $1', [U1]))[0].entry_points);
    const led1 = Number((await q('select count(*)::int n from ep_ledger where user_id = $1', [U1]))[0].n);
    check(o === 'failed' && row.failure_reason === 'fee_above_max' && bal1 === bal0 && led1 === led0,
      '③ ★額が上限を超える → fee_above_max・★残高も台帳も動かない', `★${o}:${row.failure_reason} / 残高 ${bal0}→${bal1} / 台帳 ${led0}→${led1}`);
  }

  // ④ EP が足りない（★U2 は 1 EP）
  {
    const s = sires[0];
    const reqId = uuid();
    await request(U2, reqId, mares[10], s.id, feeOf(s));
    const o = await confirmBreeding(c, reqId, ctx);
    const row = (await q('select failure_reason from foal_requests where id = $1', [reqId]))[0];
    const bal = Number((await q('select entry_points from users where id = $1', [U2]))[0].entry_points);
    const led = Number((await q("select count(*)::int n from ep_ledger where user_id = $1 and reason = 'stud_fee'", [U2]))[0].n);
    const drafts = Number((await q('select count(*)::int n from foal_drafts where request_id = $1', [reqId]))[0].n);
    // ⚠️ ★母と父の組が先に断られた場合（近交など）は ep_short に届かない → ★判定不能として落とす
    check(o === 'failed' && row.failure_reason === 'ep_short' && bal === 1 && led === 0 && drafts === 0,
      '④ ★EP が足りない → ep_short・★残高も台帳も動かない・★下書きは無い', `★${o}:${row.failure_reason} / 残高 ${bal} / 台帳 ${led} / 下書き ${drafts}`);
  }

  // ⑤ 読む口
  {
    const rows = await asUser(U1, async () => (await c.query('select * from npc_stallion_facts()')).rows);
    const cols = rows.length === 0 ? [] : Object.keys(rows[0]).sort();
    const want = ['birth_week', 'coverings_this_year', 'g1_wins', 'horse_id', 'name', 'total_prize_pp'];
    const sample = rows.find((r) => r.horse_id === sires[0].id);
    check(rows.length > 0 && JSON.stringify(cols) === JSON.stringify(want)
      && sample !== undefined && String(sample.total_prize_pp) === String(sires[0].prize)
      && !rows.some((r) => r.horse_id === ownedSire),
    '⑤ ★読む口: 事実の列だけ・★総獲得賞金 ＝ horse_total_prize_pp・★持ち主のいる種牡馬は出ない',
    `★${rows.length} 頭 / 列 ${cols.join(',')}`);
  }

  // ⑥ 総獲得賞金 ＝ 手で足した値（★賞金のある馬で）
  {
    // ★出走が 3 つ以上ある馬を選び、★取引の中で賞金を 2 つに書く（★1 つは null のまま＝数えないことの対照）
    const h = (await q('select horse_id::text id from race_entries group by horse_id having count(*) >= 3 limit 1'))[0];
    if (h !== undefined) {
      const ids = (await q('select id::text id from race_entries where horse_id = $1 order by id limit 3', [h.id])).map((r) => r.id);
      await c.query('update race_entries set prize_pp = null where horse_id = $1', [h.id]);
      await c.query('update race_entries set prize_pp = 1000 where id = $1', [ids[0]]);
      await c.query('update race_entries set prize_pp = 234 where id = $1', [ids[1]]);
    }
    if (h === undefined) {
      // ★前例: verify-breeding-live の ⑤（★前提の無い DB では判定しないと明示し、★合格に数えない）
      const races = Number((await q('select count(*)::int n from race_entries'))[0].n);
      console.log(`  ・ ⑥ ★判定しません（★出走が 3 つ以上ある馬がいない・★出走 ${races} 件）。`
        + '★数え方の 1 か所化は ★`total-prize-single-source.test.ts` が構文で見ています');
    } else {
      const byFn = Number((await q('select horse_total_prize_pp($1)::text v', [h.id]))[0].v);
      const byHand = (await q('select prize_pp from race_entries where horse_id = $1', [h.id]))
        .filter((r) => r.prize_pp !== null).reduce((x, r) => x + Number(r.prize_pp), 0);
      check(byFn === byHand && byFn === 1234, '⑥ ★horse_total_prize_pp ＝ 出走の賞金を手で足した値（★1000 ＋ 234・★null の出走は数えない）', `★${byFn} / ${byHand}`);
    }
  }
} catch (e) {
  check(false, '★予行が途中で落ちました', `🔴 ${e.message}`);
} finally {
  await c.query('rollback');
}

const after = await snapshot();
check(JSON.stringify(before) === JSON.stringify(after),
  '⑦ ★rollback の後、★要求・下書き・台帳・馬の数が元に戻っている', `★前 ${JSON.stringify(before)} / 後 ${JSON.stringify(after)}`);
await c.end();
console.log('');
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★自分の繁殖牝馬で配合する経路' }));
