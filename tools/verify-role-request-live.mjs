/**
 * ★**引退馬の役割の変更（`request_breeding_role`）と、生涯 8 産の降ろしを、本物の DB で確かめる**（★I-1 段 3・2026-09-22）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *   ★本番には向けません（`assertNotProduction`）。
 *
 * ============================================================================
 * 【★判定】
 *   ① ★持ち主が功労馬の牝馬を繁殖入りさせる → done・役割が変わる・生涯の記録（reason = owner）が 1 行
 *   ② ★同じ要求 ID の再送 → 同じ結果・依頼も記録も増えない
 *   ③ ★同じ要求 ID で別の依頼 → ST040
 *   ④ ★失敗の理由: not_owner / not_retired / sex_mismatch / same_role / lifetime_foals_reached
 *   ⑤ ★上限: 繁殖牝馬 10 頭ちょうどまでは通り、11 頭目は owner_limit。★種牡馬も 5 と 6 で同じ
 *   ⑥ ★降ろす（→ 功労馬）は上限を見ない。★降ろした後は、止まっていた 1 頭が上がる
 *   ⑦ ★RPC が ★利用者の行をロックする（★行の `xmax` に錠の印が付く・★失敗して戻っても印は残る）。
 *      ★購入は ★出品の確認で落ちる呼び方でも印が付く（★＝出品より前、つまり数えるより前にロックしている）。
 *      ★対照: ★0025 の購入の定義（★取引の中で一時的に戻す）では ★印が付かない／★読むだけの RPC も付けない
 *      ⚠️ ★staging に確定済みの利用者がいなくても測れるよう、★2 本目の接続は使いません
 *   ⑧ ★生涯 8 産の繁殖牝馬がいる年の頭の週が ★落ちない（★0069）・★降ろした記録（reason = lifetime_foals）が残る。
 *      ★対照: ★制約を 0010 の形に戻すと ★同じ週が落ちる（★この予行が制約に当たっていること）
 *   ⑨ ★rollback の後、★頭数・依頼・記録の数が元に戻っている
 *
 * 【⚠️ ★偽の DB では確かめられないこと】
 *   ★制約（⑧）とロック（⑦）は ★本物の DB の予行でしか確かめられません
 *   （★`verify-pool-supply` の偽の DB は制約を再現しないので、12 年回しても ⑧ を捕まえられなかった）。
 *
 * ★使い方: npx tsx tools/verify-role-request-live.mjs --env staging
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { runBreedingWeek } from '../apps/worker/src/breeding-runner.ts';
import { DEFAULT_PRESEED_OPTIONS } from '../apps/cli/src/preseed.ts';
import { FIELD_SIZE } from '../apps/cli/src/race-field.ts';
import { OWNERSHIP_LIMITS, weekIndexAt } from '../packages/scheduler/src/index.ts';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';

const env = loadEnv();
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error('verify-role-request-live: STAR_EPOCH_ISO を読めません');
const WEEK_MS = 4 * 60 * 60 * 1000;

const connect = async () => {
  const cl = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  cl.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
  await cl.connect();
  return cl;
};
const c = await connect();
await assertNotProduction(c, 'verify-role-request-live.mjs');
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

/** ★利用者として呼ぶ（★セーブポイントで包み、失敗しても外側の取引を壊さない） */
const asUserOn = async (cl, userId, fn) => {
  await cl.query('savepoint as_user');
  await cl.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  await cl.query('set local role authenticated');
  try {
    const out = await fn();
    await cl.query('reset role');
    await cl.query('release savepoint as_user');
    return out;
  } catch (e) {
    await cl.query('rollback to savepoint as_user');
    await cl.query('reset role');
    throw e;
  }
};
const role = (userId, reqId, horseId, toRole) => asUserOn(c, userId, async () => (await c.query(
  'select * from request_breeding_role($1, $2, $3)', [reqId, horseId, toRole],
)).rows[0]);
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

let n = 0;
const uuid = (tag) => `0f000000-0000-4000-8000-${tag}${String(n++).padStart(12 - tag.length, '0')}`;
const U1 = '0f000000-0000-4000-8000-00000000f701';
const U2 = '0f000000-0000-4000-8000-00000000f702';

console.log('# ★引退馬の役割の変更と生涯 8 産の降ろしを、本物の DB で確かめる（★必ず rollback します）');
const count = async (cl, sql) => Number((await cl.query(sql)).rows[0].n);
const before = {
  horses: await count(c, 'select count(*)::int n from horses'),
  requests: await count(c, 'select count(*)::int n from role_requests'),
  stories: await count(c, 'select count(*)::int n from horse_story_event'),
};

await c.query('begin');
try {
  // ── 準備（★取引の中だけ） ──
  for (const u of [U1, U2]) {
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
      [u, `verify-role-request+${u.slice(-4)}@example.invalid`]);
    await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 0)", [u]);
  }
  // ★いまの週が無い DB（★staging は 0 行のことがある）では ★取引の中で置く
  const hadWeek = (await q('select game_week from world_state where id = true')).length > 0;
  if (!hadWeek) await c.query('insert into world_state (id, game_week) values (true, 300)');
  const own = async (ids) => {
    await c.query('update horses set owner_id = $1, npc_stable_id = null where id = any($2::uuid[])', [U1, ids]);
  };
  const mares = (await q(
    "select id::text id from horses where owner_id is null and retirement_role = 'honored' and sex = 'female'"
      + ' and foal_count < $1 order by id limit 13', [DEFAULT_BALANCE.MARE_LIFETIME_FOALS],
  )).map((r) => r.id);
  const sires = (await q(
    "select id::text id from horses where owner_id is null and retirement_role = 'stallion' and sex = 'male' order by id limit 7",
  )).map((r) => r.id);
  const active = (await q('select id::text id from horses where owner_id is null and retired_at_week is null order by id limit 1'))[0]?.id;
  if (mares.length < 13 || sires.length < 7 || active === undefined) {
    throw new Error(`★準備が足りません（牝馬 ${mares.length}/13・種牡馬 ${sires.length}/7・現役 ${active === undefined ? 0 : 1}/1）`);
  }
  await own([...mares, ...sires, active]);
  // ★種牡馬は ★まず功労馬に置く（★上げる検査のため）
  await c.query("update horses set retirement_role = 'honored' where id = any($1::uuid[])", [sires]);

  // ① 繁殖入り
  const r1 = uuid('a');
  const res1 = await role(U1, r1, mares[0], 'broodmare');
  const h1 = (await q('select retirement_role from horses where id = $1', [mares[0]]))[0];
  const s1 = await q("select detail from horse_story_event where horse_id = $1 and event_type = 'breeding-role-changed'", [mares[0]]);
  check(res1.status === 'done' && res1.from_role === 'honored' && h1.retirement_role === 'broodmare'
    && s1.length === 1 && s1[0].detail.reason === 'owner' && s1[0].detail.to === 'broodmare',
  '① ★持ち主が功労馬の牝馬を繁殖入りさせる（★done・役割・生涯の記録 1 行）',
  `★${res1.status} / ${res1.from_role} → ${h1.retirement_role} / 記録 ${s1.length} 行`);

  // ② 再送
  const res1b = await role(U1, r1, mares[0], 'broodmare');
  const reqN = Number((await q('select count(*)::int n from role_requests where id = $1', [r1]))[0].n);
  const s1b = await q("select 1 from horse_story_event where horse_id = $1 and event_type = 'breeding-role-changed'", [mares[0]]);
  check(res1b.status === 'done' && reqN === 1 && s1b.length === 1,
    '② ★同じ要求 ID の再送 → 同じ結果・依頼も記録も増えない', `★依頼 ${reqN} 行 / 記録 ${s1b.length} 行`);

  // ③ 同じ ID で別の依頼
  const e3 = await errOf(() => role(U1, r1, mares[0], 'honored'));
  check(e3?.code === 'ST040', '③ ★同じ要求 ID で別の依頼 → ST040', `★${e3?.code ?? 'エラー無し'}`);

  // ④ 失敗の理由
  await c.query('update horses set foal_count = $1 where id = $2', [DEFAULT_BALANCE.MARE_LIFETIME_FOALS, mares[12]]);
  const cases = [
    ['not_owner', U2, mares[1], 'broodmare'],
    ['not_retired', U1, active, 'honored'],
    ['sex_mismatch', U1, mares[1], 'stallion'],
    ['same_role', U1, mares[0], 'broodmare'],
    ['lifetime_foals_reached', U1, mares[12], 'broodmare'],
  ];
  const got4 = [];
  for (const [want, u, h, to] of cases) {
    const r = await role(u, uuid('b'), h, to);
    got4.push(`${want}:${r.status}/${r.failure_reason}`);
    if (!(r.status === 'failed' && r.failure_reason === want)) fails.push(`④ ${want}`);
  }
  checked += 1;
  console.log(`  ${got4.every((g) => g.endsWith('/'.concat(g.split(':')[0]))) ? '✓' : '🔴'} ④ ★失敗の理由 5 種  ★${got4.join(' / ')}`);

  // ⑤ 上限（★繁殖牝馬: ① の 1 頭 ＋ ここで 8 頭 ＝ 9 頭、★次の 1 頭で 10 頭ちょうど、★その次は超える）
  await c.query("update horses set retirement_role = 'broodmare' where id = any($1::uuid[])", [mares.slice(1, 9)]);
  const atLimit = await role(U1, uuid('c'), mares[9], 'broodmare');
  const overLimit = await role(U1, uuid('c'), mares[10], 'broodmare');
  const mCount = Number((await q("select count(*)::int n from horses where owner_id = $1 and retirement_role = 'broodmare'", [U1]))[0].n);
  const sUp = [];
  for (let i = 0; i < OWNERSHIP_LIMITS.stallion + 1; i += 1) sUp.push(await role(U1, uuid('d'), sires[i], 'stallion'));
  const sDone = sUp.filter((r) => r.status === 'done').length;
  check(atLimit.status === 'done' && overLimit.failure_reason === 'owner_limit'
    && mCount === OWNERSHIP_LIMITS.broodmare && sDone === OWNERSHIP_LIMITS.stallion
    && sUp[OWNERSHIP_LIMITS.stallion].failure_reason === 'owner_limit',
  `⑤ ★上限: 繁殖牝馬 ${OWNERSHIP_LIMITS.broodmare} 頭ちょうどまで通り・次は owner_limit（★種牡馬 ${OWNERSHIP_LIMITS.stallion} も同じ）`,
  `★繁殖牝馬 ${mCount} 頭 / 次 ${overLimit.failure_reason} / 種牡馬 done ${sDone}・次 ${sUp[OWNERSHIP_LIMITS.stallion].failure_reason}`);

  // ⑥ 降ろす → 止まっていた 1 頭が上がる
  const down = await role(U1, uuid('e'), mares[0], 'honored');
  const retry = await role(U1, uuid('e'), mares[10], 'broodmare');
  check(down.status === 'done' && retry.status === 'done',
    '⑥ ★降ろすは上限を見ない・★降ろした後は止まっていた 1 頭が上がる', `★降ろす ${down.status} / 上げ直し ${retry.status}`);

  // ⑧ 生涯 8 産の降ろし（★NPC の繁殖牝馬 1 頭を 8 産にして、年の頭の週を流す）
  const npcMare = (await q(
    "select id::text id from horses where owner_id is null and retirement_role = 'broodmare' order by id limit 1",
  ))[0]?.id;
  if (npcMare === undefined) throw new Error('★NPC の繁殖牝馬がいません');
  await c.query('update horses set foal_count = $1 where id = $2', [DEFAULT_BALANCE.MARE_LIFETIME_FOALS, npcMare]);
  const nowWeek = weekIndexAt(Number((await q('select (extract(epoch from now()) * 1000)::bigint ms'))[0].ms), EPOCH);
  const yearStart = Math.ceil(nowWeek / 52) * 52;
  const nowMs = EPOCH + (yearStart + 1) * WEEK_MS;
  const run = () => runBreedingWeek(c, nowMs, EPOCH, () => {}, undefined, 'top',
    (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2, DEFAULT_PRESEED_OPTIONS.mares);
  // ★対照: 制約を 0010 の形に戻すと落ちる
  await c.query('savepoint old_constraint');
  await c.query('alter table horses drop constraint horses_retirement_reason_known');
  await c.query("alter table horses add constraint horses_retirement_reason_known check (retirement_reason is null or retirement_reason in ('age', 'career_ending_injury'))");
  const eOld = await errOf(run);
  await c.query('rollback to savepoint old_constraint');
  const eNew = await errOf(run);
  const m8 = (await q('select retirement_role, retirement_reason from horses where id = $1', [npcMare]))[0];
  const s8 = await q("select detail from horse_story_event where horse_id = $1 and event_type = 'breeding-role-changed'", [npcMare]);
  check(eOld !== null && /horses_retirement_reason_known/.test(String(eOld.message))
    && eNew === null && m8.retirement_role === 'honored' && m8.retirement_reason === 'mare_lifetime_foals'
    && s8.length === 1 && s8[0].detail.reason === 'lifetime_foals',
  '⑧ ★生涯 8 産がいる年の頭の週が落ちない・★記録が残る（★対照: 0010 の制約では落ちる）',
  `★週 ${yearStart} / 旧い制約: ${eOld === null ? '落ちない（🔴 対照が効いていない）' : '落ちた'} / 今: ${eNew === null ? '落ちない' : `落ちた ${eNew.message}`}`
    + ` / ${m8.retirement_role}・${m8.retirement_reason} / 記録 ${s8.length} 行`);
  // ⑦ ロックの印（★取引の中で新しく作った利用者は ★xmax が 0。★RPC が for update すると付く）
  const probeUser = async (tag) => {
    const id = `0f000000-0000-4000-8000-00000000f7${tag}`;
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
      [id, `verify-role-request+f7${tag}@example.invalid`]);
    await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 0)", [id]);
    return id;
  };
  const xmaxOf = async (id) => (await q('select xmax::text x from users where id = $1', [id]))[0].x;
  const unlisted = (await q('select id::text id from horses h where owner_id is null and retired_at_week is null'
    + ' and not exists (select 1 from horse_market_listing l where l.horse_id = h.id and l.active) order by id limit 1'))[0].id;
  const uRole = await probeUser('b1');
  const x0 = await xmaxOf(uRole);
  await role(uRole, uuid('f'), mares[1], 'honored');   // ★not_owner で返る（★例外にならない）
  const xRole = await xmaxOf(uRole);
  const uBuy = await probeUser('b2');
  const eBuy = await errOf(() => asUserOn(c, uBuy, () => c.query('select buy_horse($1, $2)', [unlisted, uuid('f')])));
  const xBuy = await xmaxOf(uBuy);
  // ★対照 1: 0025 の購入の定義（★取引の中で一時的に戻す）
  const sql0025 = readFileSync('db/migrations/0025_horse_market.sql', 'utf8');
  const fnStart = sql0025.search(/CREATE OR REPLACE FUNCTION public\.buy_horse/);
  // ★関数の終わり（★`$function$` の次の行の `;`）。★改行が CRLF でも LF でも拾う
  const endMatch = /\$function\$\r?\n;/.exec(sql0025.slice(fnStart));
  if (fnStart < 0 || endMatch === null) throw new Error('★0025 から buy_horse の定義を切り出せません');
  const fnEnd = fnStart + endMatch.index + endMatch[0].length;
  await c.query('savepoint old_buy');
  await c.query(sql0025.slice(fnStart, fnEnd));
  const uOld = await probeUser('b3');
  const eOldBuy = await errOf(() => asUserOn(c, uOld, () => c.query('select buy_horse($1, $2)', [unlisted, uuid('f')])));
  const xOld = await xmaxOf(uOld);
  await c.query('rollback to savepoint old_buy');
  // ★対照 2: 読むだけの RPC
  const uRead = await probeUser('b4');
  await asUserOn(c, uRead, () => c.query('select * from my_onboarding_state($1, $2)',
    [DEFAULT_BALANCE.MIN_BREEDING_AGE_YEARS * 52, DEFAULT_BALANCE.MARE_LIFETIME_FOALS]));
  const xRead = await xmaxOf(uRead);
  const listedErr = (e) => e !== null && /出品されていません/.test(String(e.message));
  check(x0 === '0' && xRole !== '0' && listedErr(eBuy) && xBuy !== '0' && listedErr(eOldBuy) && xOld === '0' && xRead === '0',
    '⑦ ★役割の変更と購入は ★利用者の行をロックする（★購入は出品の確認より前）・★対照: 0025 の購入と読むだけの RPC は付けない',
    `★xmax 初め ${x0} / 役割 ${xRole === '0' ? '0' : '印あり'} / 購入 ${xBuy === '0' ? '0' : '印あり'}（${listedErr(eBuy) ? '出品で落ちた' : String(eBuy?.message)}）`
      + ` / 0025 ${xOld === '0' ? '0' : '印あり'}（${listedErr(eOldBuy) ? '出品で落ちた' : String(eOldBuy?.message)}） / 読むだけ ${xRead === '0' ? '0' : '印あり'}`);
} catch (e) {
  check(false, '★予行が途中で落ちました', `🔴 ${e.message}`);
} finally {
  await c.query('rollback');
}

// ⑨ 元に戻っている
const after = {
  horses: await count(c, 'select count(*)::int n from horses'),
  requests: await count(c, 'select count(*)::int n from role_requests'),
  stories: await count(c, 'select count(*)::int n from horse_story_event'),
};
check(JSON.stringify(before) === JSON.stringify(after),
  '⑨ ★rollback の後、★頭数・依頼・記録の数が元に戻っている', `★前 ${JSON.stringify(before)} / 後 ${JSON.stringify(after)}`);
await c.end();

console.log('');
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★役割の変更と生涯 8 産の降ろし' }));
