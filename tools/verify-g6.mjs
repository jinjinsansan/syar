/**
 * ★G-6: 調教の EP 消費を `ep_ledger` に記帳する（正典 §7.2・§11.4）
 *
 * 【★何を確かめるか】
 *   「記帳された」ことではなく、**記帳を外せない**ことを確かめます。
 *   台帳は憲法③（サーバー権威）の要で、ここが緩むと
 *   「引かれたのに記録が無い」「記録があるのに引かれていない」が作れます。
 *
 *   ① 引き落とし額と台帳の delta が一致する
 *   ② 残高が台帳の累計と一致する（balance_after が嘘をついていない）
 *   ③ ★同じ馬の同じ週を2回呼んでも二度引かれない（週送りは再実行される）
 *   ④ ★並列に呼んでも二度引かれない（アプリ側の「確認してから書く」はすり抜ける）
 *   ⑤ 残高不足なら引かれず、台帳にも残らない（部分適用が無い）
 *   ⑥ NPC 馬は課金対象でない（null が返る・台帳に載らない）
 *   ⑦ 休養（0 EP）は台帳に行を作らない
 *   ⑧ ★理由は 'training' 固定。EP の増える経路をここから作らない（憲法②）
 *
 * 実行: npx tsx tools/verify-g6.mjs --env staging
 */
import pg from 'pg';
import { MENUS } from '../packages/training/src/index.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const UID = '00000000-0000-0000-0000-0000000000g6'.replace('g6', 'a6');
const START_EP = 1_000_000;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-g6.mjs');

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const n = (v) => (v === null || v === undefined ? null : Number(v));

console.log('# G-6: 調教の EP 消費を ep_ledger に記帳する');
console.log('');

// ── 準備 ────────────────────────────────────────────────
await c.query('update horses set owner_id = null where owner_id = $1', [UID]);
await c.query('delete from ep_ledger where user_id = $1', [UID]);
await c.query('delete from users where id = $1', [UID]);
await c.query('delete from auth.users where id = $1', [UID]);
await c.query(
  `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
   values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
           'g6@star.local','x',now(),now()) on conflict (id) do nothing`,
  [UID],
);
// ★内部口座（0009）。§11.2 の実経済の指標に検証用の動きを混ぜない
await c.query(
  `insert into users (id,display_name,stable_name,entry_points,prize_points,account_type)
   values ($1,'G-6 検証','検証用',$2,0,'internal')`,
  [UID, START_EP],
);

// ★NPC 馬を1頭だけプレイヤー所有にする（専用の馬を作らない・§10.5）
const pickPlayer = await c.query(
  `update horses set owner_id = $1, npc_stable_id = null
     where id = (select id from horses where npc_stable_id is not null order by id limit 1)
   returning id, name`,
  [UID],
);
const horse = pickPlayer.rows[0];
const npcHorse = (await c.query(
  'select id, name from horses where npc_stable_id is not null order by id limit 1',
)).rows[0];
console.log(`  プレイヤー馬: ${horse.name} / NPC 馬: ${npcHorse.name}`);
console.log(`  開始残高: ${START_EP.toLocaleString()} EP`);
console.log('');

const spend = (horseId, week, amount) =>
  c.query('select spend_training_ep($1, $2, $3) as bal', [horseId, week, amount]);
const balance = async () =>
  n((await c.query('select entry_points from users where id = $1', [UID])).rows[0].entry_points);
const ledger = async () =>
  (await c.query(
    'select delta, balance_after, reason, ref_id, dedupe_key from ep_ledger where user_id = $1 order by id',
    [UID],
  )).rows;

// ── ①② 通常の消費 ──────────────────────────────────────
//    ★§7.2 の表を素通しせず、メニューごとの実額で流す
const plan = [
  { week: 100, menu: 'hill' }, { week: 101, menu: 'hard' }, { week: 102, menu: 'rest' },
  { week: 103, menu: 'partner' }, { week: 104, menu: 'pool' }, { week: 105, menu: 'gate' },
  { week: 106, menu: 'wood' }, { week: 107, menu: 'light' },
];
let expected = 0;
for (const p of plan) {
  const amount = MENUS[p.menu].epCost;
  await spend(horse.id, p.week, amount);
  expected += amount;
}
const bal1 = await balance();
const led1 = await ledger();
const sumDelta = led1.reduce((a, r) => a + n(r.delta), 0);

check(bal1 === START_EP - expected, '① 引き落とし額が §7.2 の表と一致',
  `残高 ${bal1.toLocaleString()} = ${START_EP.toLocaleString()} - ${expected.toLocaleString()}`);
check(-sumDelta === expected && bal1 === START_EP + sumDelta,
  '② 残高が台帳の累計と一致（balance_after が嘘をついていない）',
  `台帳合計 ${sumDelta.toLocaleString()} / 行数 ${led1.length}`);

// ── ⑦ 休養（0 EP）は行を作らない ────────────────────────
const restRows = led1.filter((r) => n(r.delta) === 0);
check(restRows.length === 0 && led1.length === plan.length - 1,
  '⑦ 休養（0 EP）は台帳に行を作らない',
  `記帳 ${led1.length} 行 / 調教した週 ${plan.length - 1} 週`);

// ── ③ 同じ週を2回 ──────────────────────────────────────
const before3 = await balance();
await spend(horse.id, 100, MENUS.hill.epCost);
await spend(horse.id, 100, MENUS.hill.epCost);
const after3 = await balance();
const led3 = await ledger();
check(after3 === before3 && led3.length === led1.length,
  '③ 同じ馬の同じ週は二度引かれない（週送りは再実行される）',
  `残高 ${before3.toLocaleString()} → ${after3.toLocaleString()} / 行数 ${led1.length} → ${led3.length}`);

// ── ④ 並列 ────────────────────────────────────────────
//    ★「もう処理したか確認してから書く」はここですり抜けます。
//      制約で止まっているかを、実際に同時に叩いて確かめます。
const before4 = await balance();
const conns = await Promise.all(
  Array.from({ length: 5 }, async () => {
    const cc = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await cc.connect();
    return cc;
  }),
);
const results = await Promise.allSettled(
  conns.map((cc) => cc.query('select spend_training_ep($1, $2, $3) as bal', [horse.id, 200, 800])),
);
for (const cc of conns) await cc.end();
const after4 = await balance();
const led4 = await ledger();
const week200 = led4.filter((r) => r.dedupe_key === `training:${horse.id}:200`);
check(week200.length === 1 && after4 === before4 - 800,
  '④ 並列に5本叩いても記帳は1行だけ',
  `週200の行数 ${week200.length} / 残高 ${before4.toLocaleString()} → ${after4.toLocaleString()} / ` +
  `成功 ${results.filter((r) => r.status === 'fulfilled').length} 失敗 ${results.filter((r) => r.status === 'rejected').length}`);

// ── ⑤ 残高不足 ────────────────────────────────────────
const before5 = await balance();
let raised = null;
try {
  await spend(horse.id, 300, before5 + 1);
} catch (e) {
  raised = e.message;
}
const after5 = await balance();
const led5 = await ledger();
check(raised !== null && after5 === before5 && led5.length === led4.length,
  '⑤ 残高不足なら引かれず、台帳にも残らない（部分適用が無い）',
  raised === null ? '★例外が出なかった' : `例外あり / 残高 ${after5.toLocaleString()} 据置 / 行数 ${led5.length} 据置`);

// ── ⑥ NPC 馬 ──────────────────────────────────────────
const npcRes = await spend(npcHorse.id, 100, 800);
const led6 = await ledger();
check(n(npcRes.rows[0].bal) === null && led6.length === led5.length,
  '⑥ NPC 馬は課金対象でない（null が返り、台帳に載らない）',
  `戻り値 ${npcRes.rows[0].bal === null ? 'null' : npcRes.rows[0].bal} / 行数 ${led6.length} 据置`);

// ── ⑧ 理由は training 固定・EP が増える経路が無い ────────
const reasons = [...new Set(led6.map((r) => r.reason))];
const positive = led6.filter((r) => n(r.delta) > 0);
check(reasons.length === 1 && reasons[0] === 'training' && positive.length === 0,
  '⑧ 理由は training 固定・EP が増える行が無い（憲法②）',
  `理由 ${reasons.join(',')} / 増える行 ${positive.length} 件`);

// ★負の額を渡せないことも確かめる（EP を「返す」経路をここから作らせない）
let negRaised = null;
try {
  await spend(horse.id, 400, -500);
} catch (e) {
  negRaised = e.message;
}
check(negRaised !== null, '⑧b 負の額は拒否される（調教で EP が増える経路を作らない）',
  negRaised === null ? '★通ってしまった' : '例外あり');

// ── 後片付け ──────────────────────────────────────────
console.log('');
console.log('【後片付け】');
await c.query('update horses set owner_id = null, npc_stable_id = 1 where owner_id = $1', [UID]);
await c.query('delete from ep_ledger where user_id = $1', [UID]);
await c.query('delete from users where id = $1', [UID]);
await c.query('delete from auth.users where id = $1', [UID]);
const left = await c.query('select count(*)::int n from ep_ledger where user_id = $1', [UID]);
console.log(`  検証用の口座と台帳を削除しました（残 ${left.rows[0].n} 行）`);

console.log('');
console.log(fails.length === 0
  ? '★G-6: PASS — 8項目すべて成立'
  : `★G-6: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
await c.end();
process.exit(fails.length === 0 ? 0 : 1);
