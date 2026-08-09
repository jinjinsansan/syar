/**
 * A-5「EP 減算と馬券発行が原子的」を**壊して確かめる**（正典 §14.4）。
 *
 * ★正常系が動くことは A-1 で分かります。ここは異常系だけを起こします:
 *   ① place_bet の途中で失敗させ、**EP も馬券も動いていない**ことを確認
 *   ② 再送（同じ client_token）で**二重に引かれない**ことを確認（S-3）
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-a5.mjs');

const uid = '00000000-0000-4000-8000-00000000a5a5';
const cleanup = async () => {
  await c.query(`delete from ep_ledger where user_id=$1`, [uid]);
  await c.query(`delete from bets where user_id=$1`, [uid]);
  await c.query(`delete from race_odds where race_id in (select id from races where name='A5-TEST')`);
  await c.query(`delete from races where name='A5-TEST'`);
  await c.query(`delete from users where id=$1`, [uid]);
};
await cleanup();

// ★auth.users に依存するので、テスト用ユーザーを直接入れる
await c.query(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
               values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','a5@test.local','x',now(),now())
               on conflict (id) do nothing`, [uid]);
await c.query(`insert into users (id, display_name, stable_name, entry_points) values ($1,'A5','A5牧場',100000)`, [uid]);

const race = (await c.query(`insert into races (name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,purse)
  values ('A5-TEST',1,'turf',2000,'good','C1',now()+interval '1 hour','C',0) returning id`)).rows[0].id;
await c.query(`insert into race_odds (race_id,bet_type,selection,probability,odds) values ($1,'win','[1]'::jsonb,0.2,4.1)`, [race]);

const bal = async () => Number((await c.query(`select entry_points from users where id=$1`,[uid])).rows[0].entry_points);
const bets = async () => Number((await c.query(`select count(*)::int n from bets where user_id=$1`,[uid])).rows[0].n);
const ledger = async () => Number((await c.query(`select count(*)::int n from ep_ledger where user_id=$1`,[uid])).rows[0].n);

// ★auth.uid() を偽装する（service_role 接続では null になるため）
const asUser = async (sql, params) => {
  await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [uid]);
  return c.query(sql, params);
};

console.log(`初期: EP=${await bal()} 馬券=${await bets()} 台帳=${await ledger()}`);

// --- ① 途中で失敗させる: 存在しない買い目 → 例外 ---
await c.query('begin');
let failed = false;
try {
  await asUser(`select place_bet($1,'win','[99]'::jsonb,1000,$2)`, [race, '11111111-1111-4111-8111-111111111111']);
} catch (e) { failed = true; }
await c.query('rollback');
console.log(`\n① 失敗する購入: 例外=${failed}  EP=${await bal()} 馬券=${await bets()} 台帳=${await ledger()}`);
const atomicOk = failed && (await bal()) === 100000 && (await bets()) === 0 && (await ledger()) === 0;
console.log(`   ★原子性: ${atomicOk ? 'PASS — EP も馬券も動いていない' : 'FAIL'}`);

// --- ② 再送: 同じ client_token で2回 ---
const tok = '22222222-2222-4222-8222-222222222222';
await c.query('begin');
const r1 = await asUser(`select place_bet($1,'win','[1]'::jsonb,1000,$2) as id`, [race, tok]);
const r2 = await asUser(`select place_bet($1,'win','[1]'::jsonb,1000,$2) as id`, [race, tok]);
await c.query('commit');
const same = String(r1.rows[0].id) === String(r2.rows[0].id);
console.log(`\n② 再送: 同じ馬券ID=${same}  EP=${await bal()} 馬券=${await bets()} 台帳=${await ledger()}`);
const idemOk = same && (await bal()) === 99000 && (await bets()) === 1 && (await ledger()) === 1;
console.log(`   ★冪等性: ${idemOk ? 'PASS — 1回しか引かれていない' : 'FAIL'}`);

console.log(`\n★A-5: ${atomicOk && idemOk ? 'PASS' : 'FAIL'}`);
await cleanup();
await c.end();
