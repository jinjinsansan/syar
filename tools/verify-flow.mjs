/**
 * ★日次集計が実データを数えているか、そして**内部口座が別掲されているか**（§4.6・§11.2・0009）
 *
 *   ⚠️ 空のまま「0 で PASS」としないこと。
 *      0 は「経済が動いていない」であって「集計が正しい」ではありません。
 *      → 既知の値を投入し、**その値が出てくるか**で確かめます。
 *
 *   ★内部口座の検査は**両方向**でなければ意味がありません:
 *      ① 内部の流量が player 側に**混ざらない**   … 除外実装でも別掲実装でも通る
 *      ② 内部の流量が**消えていない**             … 除外実装なら落ちる
 *      片方だけだと「口座に印を付けて流量を隠す」実装を検出できません。
 *
 *   ★player と internal に**違う値**を入れます。同じ値だと入れ違っていても気づけません。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { aggregateDay } from '../apps/worker/src/daily-flow.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-flow.mjs');

const PLAYER = '00000000-0000-4000-8000-00000000f10f';
const INTERNAL = '00000000-0000-4000-8000-00000000f1f1';
const IDS = [PLAYER, INTERNAL];

const clean = async () => {
  await c.query('delete from pp_ledger where user_id = any($1)', [IDS]);
  await c.query('delete from ep_ledger where user_id = any($1)', [IDS]);
  await c.query('delete from bets where user_id = any($1)', [IDS]);
  await c.query('delete from users where id = any($1)', [IDS]);
  await c.query('delete from auth.users where id = any($1)', [IDS]);
};

// ★異常終了しても片付ける（R-18）
let done = false;
const bail = async (why) => {
  if (done) return;
  done = true;
  try {
    await clean();
    console.error(`\n★${why} で中断。一時データは削除しました`);
  } finally {
    process.exit(1);
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => void bail(sig));
process.on('uncaughtException', (e) => void bail(`例外(${e.message})`));

await clean();

const mkUser = async (id, name, type) => {
  await c.query(
    `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now())
     on conflict (id) do nothing`,
    [id, `${type}@test.local`],
  );
  await c.query(
    `insert into users (id,display_name,stable_name,entry_points,prize_points,account_type)
     values ($1,$2,'テスト牧場',50000,20000,$3)`,
    [id, name, type],
  );
};
await mkUser(PLAYER, '集計テスト(実利用者)', 'player');
await mkUser(INTERNAL, '集計テスト(内部口座)', 'internal');

// ★違う値を入れる。同じ値だと入れ違っていても気づけない
await c.query(
  `insert into ep_ledger (user_id,delta,balance_after,reason)
   values ($1,100000,100000,'inflow'), ($1,-2000,98000,'training'),
          ($2, 70000, 70000,'inflow'), ($2,-3000,67000,'training')`,
  [PLAYER, INTERNAL],
);
await c.query(
  `insert into pp_ledger (user_id,delta,balance_after,reason)
   values ($1,30000,30000,'prize'), ($1,-5000,25000,'prize_exchange'),
          ($2,11000,11000,'prize'), ($2,-4000, 7000,'prize_exchange')`,
  [PLAYER, INTERNAL],
);
console.log('投入');
console.log('  実利用者: EP流入 100,000 / 調教費 2,000 ・ PP賞金 30,000 / 交換 5,000');
console.log('  内部口座: EP流入  70,000 / 調教費 3,000 ・ PP賞金 11,000 / 交換 4,000');

const today = (await c.query('select current_date::text d')).rows[0].d;
await aggregateDay(c, today);
const r = (await c.query('select * from point_flow_daily where date=$1', [today])).rows[0];
if (!r) {
  console.log('★行が作られていません');
  await bail('行なし');
}

const n = (v) => Number(v);
console.log(`\n# 日次集計 ${today}`);
console.log(`  ${'項目'.padEnd(12)} ${'実利用者'.padStart(10)} ${'期待'.padStart(9)}  ${'内部口座'.padStart(10)} ${'期待'.padStart(9)}`);
const rows = [
  ['EP 流入', r.ep_inflow, 100000, r.ep_inflow_internal, 70000],
  ['PP 交換', r.pp_exchanged, 5000, r.pp_exchanged_internal, 4000],
];
for (const [label, a, ea, b, eb] of rows) {
  console.log(`  ${label.padEnd(12)} ${String(n(a)).padStart(10)} ${String(ea).padStart(9)}  ${String(n(b)).padStart(10)} ${String(eb).padStart(9)}`);
}
console.log(`  ${'EP 焼却'.padEnd(12)} ${String(n(r.ep_burned)).padStart(10)} ${'≧2,000'.padStart(9)}  ${String(n(r.ep_burned_internal)).padStart(10)} ${'≧3,000'.padStart(9)}`);
console.log(`  ${'PP 発行'.padEnd(12)} ${String(n(r.pp_issued)).padStart(10)} ${'≧30,000'.padStart(9)}  ${String(n(r.pp_issued_internal)).padStart(10)} ${'≧11,000'.padStart(9)}`);

// ★① 混ざらない（内部の値が実利用者側に足されていない）
const notMixed = n(r.ep_inflow) === 100000 && n(r.pp_exchanged) === 5000;
// ★② 消えていない（内部の値がちゃんと別掲されている）
const notHidden = n(r.ep_inflow_internal) === 70000 && n(r.pp_exchanged_internal) === 4000;
// ★③ 入れ違っていない（違う値を入れてあるので検出できる）
const notSwapped = n(r.ep_inflow) !== 70000 && n(r.ep_inflow_internal) !== 100000;

console.log('');
console.log(`  ★① 内部が実利用者側に混ざらない : ${notMixed ? 'PASS' : 'FAIL'}`);
console.log(`  ★② 内部の流量が消えていない     : ${notHidden ? 'PASS' : 'FAIL'}`);
console.log(`  ★③ 入れ違っていない             : ${notSwapped ? 'PASS' : 'FAIL'}`);

const ok =
  notMixed && notHidden && notSwapped &&
  n(r.ep_burned) >= 2000 && n(r.pp_issued) >= 30000 &&
  n(r.ep_burned_internal) >= 3000 && n(r.pp_issued_internal) >= 11000;
console.log(`\n★実データを数えている: ${ok ? 'PASS' : 'FAIL'}`);

console.log('★2回目の集計（冪等）...');
await aggregateDay(c, today);
const r2 = (await c.query('select pp_issued, pp_issued_internal from point_flow_daily where date=$1', [today])).rows[0];
const idem = String(r.pp_issued) === String(r2.pp_issued) && String(r.pp_issued_internal) === String(r2.pp_issued_internal);
console.log(`  PP 発行 ${r.pp_issued}/${r.pp_issued_internal} → ${r2.pp_issued}/${r2.pp_issued_internal}  ${idem ? 'PASS（増えない）' : 'FAIL'}`);

await clean();
done = true;
await c.end();
if (!ok || !idem) process.exit(1);
