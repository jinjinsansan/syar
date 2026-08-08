/**
 * ★日次集計が実データを数えているかを確かめる（§4.6・§11.2）。
 *
 *   ⚠️ 空のまま「0 で PASS」としないこと。
 *      0 は「経済が動いていない」であって「集計が正しい」ではありません。
 *      → 既知の値を投入し、**その値が出てくるか**で確かめます。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { aggregateDay } from '../apps/worker/src/daily-flow.ts';

const env = Object.fromEntries(
  readFileSync('secrets.local.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const uid = '00000000-0000-4000-8000-00000000f10f';
const clean = async () => {
  await c.query('delete from pp_ledger where user_id=$1', [uid]);
  await c.query('delete from ep_ledger where user_id=$1', [uid]);
  await c.query('delete from users where id=$1', [uid]);
};
await clean();
await c.query(
  `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
   values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','flow@test.local','x',now(),now())
   on conflict (id) do nothing`,
  [uid],
);
await c.query(
  `insert into users (id,display_name,stable_name,entry_points,prize_points)
   values ($1,'集計テスト','テスト牧場',50000,20000)`,
  [uid],
);
// 既知の値を投入する
await c.query(
  `insert into ep_ledger (user_id,delta,balance_after,reason)
   values ($1,100000,100000,'inflow'), ($1,-2000,98000,'training')`,
  [uid],
);
await c.query(
  `insert into pp_ledger (user_id,delta,balance_after,reason)
   values ($1,30000,30000,'prize'), ($1,-5000,25000,'prize_exchange')`,
  [uid],
);
console.log('投入: EP流入 100,000 / 調教費 2,000 ・ PP賞金 30,000 / 交換 5,000\n');

const today = (await c.query('select current_date::text d')).rows[0].d;
await aggregateDay(c, today);
const r = (await c.query('select * from point_flow_daily where date=$1', [today])).rows[0];
if (!r) {
  console.log('★行が作られていません');
  process.exit(1);
}
console.log(`# 日次集計 ${today}`);
console.log(`  EP 流入   ${r.ep_inflow}   （期待 100,000）`);
console.log(`  EP 焼却   ${r.ep_burned}   （期待 2,000 + 馬券の控除ぶん）`);
console.log(`  PP 発行   ${r.pp_issued}   （期待 30,000 + 馬券の払戻ぶん）`);
console.log(`  PP 交換   ${r.pp_exchanged}   （期待 5,000）`);

const ok =
  Number(r.ep_inflow) === 100000 &&
  Number(r.ep_burned) >= 2000 &&
  Number(r.pp_issued) >= 30000 &&
  Number(r.pp_exchanged) === 5000;
console.log(`\n★実データを数えている: ${ok ? 'PASS' : 'FAIL'}`);

console.log('★2回目の集計（冪等）...');
await aggregateDay(c, today);
const r2 = (await c.query('select pp_issued from point_flow_daily where date=$1', [today])).rows[0];
console.log(
  `  PP 発行 ${r.pp_issued} → ${r2.pp_issued}  ${String(r.pp_issued) === String(r2.pp_issued) ? 'PASS（増えない）' : 'FAIL'}`,
);

await clean();
await c.end();
