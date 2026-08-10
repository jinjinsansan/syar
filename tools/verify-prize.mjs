/**
 * ★賞金が実際に PP として発行されるかを本番 DB で確かめる。
 *   §9.3「PP の主な稼ぎ口は育成した馬の賞金」が成立しているか。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-prize.mjs');

const hash = { sha256:(m)=>createHash('sha256').update(m,'utf8').digest('hex'), hmacSha256:(k,m)=>createHmac('sha256',k).update(m,'utf8').digest('hex') };

const uid = '00000000-0000-4000-8000-00000000e711';
const clean = async () => {
  await c.query(`delete from pp_ledger where user_id=$1`,[uid]);
  await c.query(`update horses set owner_id=null, npc_stable_id=1 where owner_id=$1`,[uid]);
  await c.query(`delete from users where id=$1`,[uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','prize@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points,prize_points) values ($1,'賞金テスト','テスト牧場',0,0)`,[uid]);

// 発売中レースの出走馬を1頭「プレイヤーの馬」にする
const race = (await c.query(`select id, cycle_index, class_rank, grade, purse from races where status='scheduled' order by cycle_index limit 1`)).rows[0];
const ent = (await c.query(`select horse_id, gate from race_entries where race_id=$1 order by gate limit 1`,[race.id])).rows[0];
await c.query(`update horses set owner_id=$1, npc_stable_id=null where id=$2`,[uid, ent.horse_id]);
console.log(`レース cycle=${race.cycle_index} class=${race.class_rank}${race.grade?'/'+race.grade:''} purse=${race.purse}`);
console.log(`プレイヤーの馬: ${ent.gate}番枠`);

const pp = async () => Number((await c.query(`select prize_points from users where id=$1`,[uid])).rows[0].prize_points);
console.log(`確定前 PP=${await pp()}`);

const store = createPgStore(c, hash);
await store.settleRace(race.cycle_index);

const fin = (await c.query(`select finish_pos from race_entries where race_id=$1 and gate=$2`,[race.id, ent.gate])).rows[0];
console.log('');
console.log(`着順: ${fin.finish_pos}着`);
console.log(`確定後 PP=${await pp()}`);
const led = await c.query(`select reason, delta from pp_ledger where user_id=$1`,[uid]);
console.log(`★PP台帳: ${led.rows.map(r=>r.reason+' '+r.delta).join(', ')||'（なし＝6着以下）'}`);

// ★二重確定で賞金が二重に出ないこと
const before = await pp();
await store.settleRace(race.cycle_index);
console.log(`★二重確定: PP ${before} → ${await pp()}  ${before===await pp()?'PASS（増えない）':'FAIL'}`);
await clean();
await c.end();
