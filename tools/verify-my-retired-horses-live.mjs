/**
 * ★**役割の画面が読む口（`my_retired_horses`）を、本物の DB で確かめる**（★0074・デザイナー第 2 便 §5 A-1〜A-6・2026-09-23）
 *
 *   ★分類: **STATE_CHANGING**（★取引の中で書きます。★**必ず `rollback` します**）
 *   ★本番には向けません（`assertNotProduction`）。
 *
 * ============================================================================
 * 【★この道具が要る理由】
 *   ★読む口が「変えられる」と言った馬を ★RPC が弾いたら、★画面は押せるボタンを出して失敗する（0040:115 CL-4）。
 *   ★0074 は判定を `breeding_role_block` の 1 か所に寄せたが、★**寄せたこと自体を確かめないと意味がない**。
 *   → ⑤ で ★**同じ馬について、読む口の理由と、実際に RPC を呼んだ理由を突き合わせる**。
 *
 * 【★判定】
 *   ① ★出る列が決めたとおり（★素質・能力・遺伝子の列が 1 つも無い・D-114 / D-116）
 *   ② ★自分の引退馬だけ出る（★対照: 他人の引退馬・自分の現役馬は出ない）
 *   ③ ★枠の数が RPC と同じ数え方（★繁殖入りさせた分だけ増える）・★上限は TS の定数と同じ
 *   ④ ★未認証では ST010（★読む口も素通しにしない）
 *   ⑤ 🔴 ★**理由が RPC と一致する**（★null → done / 語 → 同じ語）。
 *      ★5 通り（許可・same_role・sex_mismatch・lifetime_foals_reached・owner_limit）を突き合わせる。
 *      ★対照: ★突き合わせる相手（RPC）を呼ばずに「一致」と言えないよう、★RPC の戻りも並べて出す
 *   ⑥ ★rollback の後、★頭数・依頼・記録の数が元に戻っている
 *
 * 【⚠️ ★偽の DB では確かめられないこと】
 *   ★`security definer` と `auth.uid()`、★grant / revoke、★RPC との突き合わせ（⑤）は
 *   ★本物の DB の予行でしか確かめられません。
 *
 * ★使い方: npx tsx tools/verify-my-retired-horses-live.mjs --env staging
 * ============================================================================
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { exitWithVerdict, verdictOf, VERDICT } from './lib/counted-verdict.mjs';
import { OWNERSHIP_LIMITS } from '../packages/scheduler/src/index.ts';
import { DEFAULT_BALANCE } from '../packages/sim-engine/src/index.ts';

const env = loadEnv();

const connect = async () => {
  const cl = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  cl.on('error', (e) => { console.error(`🔴 ★接続が落ちました: ${e.message}`); process.exit(VERDICT.UNDECIDABLE); });
  await cl.connect();
  return cl;
};
const c = await connect();
await assertNotProduction(c, 'verify-my-retired-horses-live.mjs');
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
const readAs = (userId) => asUserOn(c, userId, async () => (await c.query('select * from my_retired_horses()')).rows);
const roleAs = (userId, reqId, horseId, toRole) => asUserOn(c, userId, async () => (await c.query(
  'select * from request_breeding_role($1, $2, $3)', [reqId, horseId, toRole],
)).rows[0]);
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

let n = 0;
const uuid = () => `0f000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;
const U1 = '0f000000-0000-4000-8000-00000000f7a1';
const U2 = '0f000000-0000-4000-8000-00000000f7a2';

/** ★出てよい列（★この順・この数） */
const EXPECTED_COLUMNS = [
  'horse_id', 'horse_name', 'horse_sex', 'horse_birth_week', 'retired_at_week',
  'retirement_reason', 'retirement_role', 'foal_count', 'g1_wins', 'wins', 'starts',
  'sire_name', 'dam_name', 'broodmare_count', 'stallion_count',
  'broodmare_limit', 'stallion_limit', 'lifetime_foals', 'broodmare_block', 'stallion_block',
];
/** ★出てはいけない語（★素質・能力・遺伝子・D-114 / D-116） */
const FORBIDDEN = [
  'genotype', 'potential', 'stats', 'unlock_rate', 'inbreed', 'nicks', 'skill_genes',
  'distance_center', 'distance_range', 'surface_aptitude', 'strategy_aptitude', 'heavy_aptitude',
  'growth', 'temper', 'durability', 'frail',
];

console.log('# ★役割の画面の読む口を、本物の DB で確かめる（★必ず rollback します）');
const count = async (cl, sql) => Number((await cl.query(sql)).rows[0].n);
const before = {
  horses: await count(c, 'select count(*)::int n from horses'),
  requests: await count(c, 'select count(*)::int n from role_requests'),
  stories: await count(c, 'select count(*)::int n from horse_story_event'),
};

await c.query('begin');
try {
  for (const u of [U1, U2]) {
    await c.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())',
      [u, `verify-my-retired+${u.slice(-4)}@example.invalid`]);
    await c.query("insert into users (id, display_name, stable_name, entry_points) values ($1, '検証', '検証牧場', 0)", [u]);
  }
  const hadWeek = (await q('select game_week from world_state where id = true')).length > 0;
  if (!hadWeek) await c.query('insert into world_state (id, game_week) values (true, 300)');

  const LIMIT_BM = OWNERSHIP_LIMITS.broodmare;
  const FOALS = DEFAULT_BALANCE.MARE_LIFETIME_FOALS;

  // ★素材（★持ち主の居ない引退馬を借りて、取引の中だけ自分のものにする）
  const mares = (await q(
    "select id::text id from horses where owner_id is null and retirement_role = 'honored' and sex = 'female'"
      + ' and foal_count < $1 and retired_at_week is not null order by id limit $2', [FOALS, LIMIT_BM + 4],
  )).map((r) => r.id);
  const stallions = (await q(
    "select id::text id from horses where owner_id is null and retirement_role = 'honored' and sex = 'male'"
      + ' and retired_at_week is not null order by id limit 2',
  )).map((r) => r.id);
  const active = (await q('select id::text id from horses where owner_id is null and retired_at_week is null order by id limit 1'))[0]?.id;
  if (mares.length < LIMIT_BM + 3 || stallions.length < 1 || !active) {
    check(false, '★素材が足りません（★判定できません）',
      `★牝 ${mares.length} / 牡 ${stallions.length} / 現役 ${active ? 1 : 0}`);
    throw new Error('素材不足');
  }
  const own = async (ids, user) => {
    await c.query('update horses set owner_id = $1, npc_stable_id = null where id = any($2::uuid[])', [user, ids]);
  };

  // ★U1: 牝 3 頭・牡 1 頭・現役 1 頭 ／ ★U2（対照）: 牝 1 頭
  const mineMares = mares.slice(0, 3);
  const otherMare = mares[3];
  await own([...mineMares, stallions[0], active], U1);
  await own([otherMare], U2);
  // ★8 産済みの牝（lifetime_foals_reached の素）
  await c.query('update horses set foal_count = $1 where id = $2', [FOALS, mineMares[2]]);

  const rows = await readAs(U1);

  // ① 出る列
  const cols = Object.keys(rows[0] ?? {});
  const forbidden = cols.filter((k) => FORBIDDEN.some((f) => k.includes(f)));
  check(JSON.stringify(cols) === JSON.stringify(EXPECTED_COLUMNS) && forbidden.length === 0,
    '① ★出る列が決めたとおり（★素質・能力・遺伝子が 1 つも無い）',
    `★${cols.length} 列 / 禁じた語 ${forbidden.length} 件${forbidden.length ? `（${forbidden.join(',')}）` : ''}`);

  // ② 自分の引退馬だけ（★対照: 他人の引退馬・自分の現役馬）
  const ids = rows.map((r) => r.horse_id);
  check(ids.length === 4 && mineMares.every((m) => ids.includes(m)) && ids.includes(stallions[0])
    && !ids.includes(otherMare) && !ids.includes(active),
    '② ★自分の引退馬だけ出る（★対照: 他人の引退馬・自分の現役馬は出ない）',
    `★${ids.length} 頭 / 他人の馬 ${ids.includes(otherMare) ? '出た' : '出ない'} / 現役 ${ids.includes(active) ? '出た' : '出ない'}`);

  // ③ 枠の数と上限
  const before0 = rows[0];
  await roleAs(U1, uuid(), mineMares[0], 'broodmare');
  const rows2 = await readAs(U1);
  check(Number(before0.broodmare_count) === 0 && Number(rows2[0].broodmare_count) === 1
    && Number(before0.broodmare_limit) === LIMIT_BM
    && Number(before0.stallion_limit) === OWNERSHIP_LIMITS.stallion
    && Number(before0.lifetime_foals) === FOALS,
    '③ ★枠の数が RPC と同じ数え方で増える・★上限は TS の定数と同じ',
    `★繁殖牝馬 ${before0.broodmare_count} → ${rows2[0].broodmare_count} / 上限 ${before0.broodmare_limit}・${before0.stallion_limit} / 生涯 ${before0.lifetime_foals}`);

  /**
   * ④ ★未認証（2 通り）
   *   ⚠️ ★`set_config('request.jwt.claims', …, true)` は ★**取引の間ずっと残る**。
   *      ★`reset role` だけでは消えず、★直前に利用者として呼んだ申告がそのまま効く。
   *      → ★**申告を空にしてから**呼ぶ（★セーブポイントで戻すので、後ろの判定に残らない）。
   *      ★これに気づかず「落ちなかった」を最初に見た（★この註記は同じ穴に落ちないため）。
   *   (a) ★申告が無い（auth.uid() が null）→ ST010
   *   (b) ★anon のロール → そもそも実行できない（42501・★revoke が効いている）
   */
  //   ⚠️ ★落ちた文は取引を壊す（★以後「aborted」で全部通らない）。★1 回ごとにセーブポイントへ戻す。
  const probe = async (setup) => {
    await c.query('savepoint no_auth');
    await c.query("select set_config('request.jwt.claims', '', true)");
    if (setup) await setup();
    const e = await errOf(() => c.query('select * from my_retired_horses()'));
    await c.query('rollback to savepoint no_auth');
    await c.query('reset role');
    return e;
  };
  const eNoSub = await probe(null);
  const eAnon = await probe(() => c.query('set local role anon'));
  check(eNoSub !== null && String(eNoSub.code) === 'ST010'
    && eAnon !== null && String(eAnon.code) === '42501',
    '④ ★未認証では ST010・★anon は実行できない（42501）',
    `★申告なし ${eNoSub ? eNoSub.code : '落ちなかった'} / anon ${eAnon ? eAnon.code : '落ちなかった'}`);

  // ⑤ 🔴 理由が RPC と一致する
  //    ★読む口の理由を先に取り、★同じ馬に RPC を呼んで、★戻ってきた理由と比べる。
  //    ★RPC は書くので、★1 件ごとにセーブポイントで戻す（★状態を動かさない）。
  const cases = [];
  const compare = async (horseId, toRole, label) => {
    const row = (await readAs(U1)).find((r) => r.horse_id === horseId);
    const expected = toRole === 'broodmare' ? row.broodmare_block : row.stallion_block;
    await c.query('savepoint cmp');
    const got = await roleAs(U1, uuid(), horseId, toRole);
    await c.query('rollback to savepoint cmp');
    const actual = got.status === 'done' ? null : got.failure_reason;
    cases.push({ label, expected, actual, ok: expected === actual });
    return expected === actual;
  };
  // ★U1 は ③ で 1 頭を繁殖入りさせたまま（★same_role の素）
  const okAllow = await compare(mineMares[1], 'broodmare', '許可');
  const okSame = await compare(mineMares[0], 'broodmare', 'same_role');
  const okSex = await compare(stallions[0], 'broodmare', 'sex_mismatch');
  const okFoals = await compare(mineMares[2], 'broodmare', 'lifetime_foals_reached');
  // ★上限まで埋める（★owner_limit の素）
  const filler = mares.slice(4, 4 + (LIMIT_BM - 1));
  await own(filler, U1);
  for (const f of filler) await roleAs(U1, uuid(), f, 'broodmare');
  const okLimit = await compare(mineMares[1], 'broodmare', 'owner_limit');
  check(okAllow && okSame && okSex && okFoals && okLimit,
    '⑤ 🔴 ★読む口の理由が、★RPC を呼んだ結果と一致する（★5 通り）',
    cases.map((x) => `${x.label}: 読 ${x.expected ?? 'null'} / RPC ${x.actual ?? 'null'}${x.ok ? '' : ' 🔴'}`).join(' / '));
} catch (e) {
  check(false, '★予行が途中で落ちました', `🔴 ${e.message}`);
} finally {
  await c.query('rollback');
}

const after = {
  horses: await count(c, 'select count(*)::int n from horses'),
  requests: await count(c, 'select count(*)::int n from role_requests'),
  stories: await count(c, 'select count(*)::int n from horse_story_event'),
};
check(JSON.stringify(before) === JSON.stringify(after),
  '⑥ ★rollback の後、★頭数・依頼・記録の数が元に戻っている', `★前 ${JSON.stringify(before)} / 後 ${JSON.stringify(after)}`);
await c.end();

console.log('');
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★役割の画面の読む口' }));
