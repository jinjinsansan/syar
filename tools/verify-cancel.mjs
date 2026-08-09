/**
 * ★開催中止と返還を壊して確かめる（§10.2・§9.1）。
 *   返還が無いと、発売後に成立しなかったレースで**客の EP が返りません**。
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { cancelRace } from '../apps/worker/src/cancel.ts';

import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-cancel.mjs');

const uid = '00000000-0000-4000-8000-0000000ca4ce';
const clean = async () => {
  await c.query('delete from ep_ledger where user_id=$1',[uid]);
  await c.query('delete from bets where user_id=$1',[uid]);
  await c.query('delete from users where id=$1',[uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points) values ($1,'中止テスト','テスト牧場',100000)`,[uid]);

// 発売中のレースに馬券を買う
const race = (await c.query(`select id, cycle_index from races where status='scheduled' order by cycle_index desc limit 1`)).rows[0];
const odds = (await c.query(`select selection from race_odds where race_id=$1 and bet_type='win' limit 3`,[race.id])).rows;
const ep = async () => Number((await c.query('select entry_points from users where id=$1',[uid])).rows[0].entry_points);

await c.query('begin');
await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`,[uid]);
for (const o of odds) await c.query(`select place_bet($1,'win',$2::jsonb,1000,$3)`,[race.id, JSON.stringify(o.selection), randomUUID()]);
await c.query('commit');
console.log(`cycle=${race.cycle_index} に ${odds.length}点 × 1,000EP を購入`);
console.log(`購入後 EP=${await ep()}（100,000 − ${odds.length*1000}）`);

// ★開催中止
const r1 = await cancelRace(c, race.cycle_index);
console.log(`\n① 開催中止: ${r1.cancelled?'実行':'★されず'}  返還 ${r1.refundedBets}枚 / ${r1.refundedEp} EP`);
console.log(`   確定後 EP=${await ep()}  ${await ep()===100000?'PASS（全額戻った）':'★FAIL'}`);

// ★二重中止
const before = await ep();
const r2 = await cancelRace(c, race.cycle_index);
console.log(`② 二重中止: ${r2.cancelled?'★実行されてしまった':'何もしない'}  EP ${before} → ${await ep()}  ${before===await ep()?'PASS（増えない）':'★FAIL'}`);

const st = (await c.query(`select status, count(*)::int n from bets where user_id=$1 group by 1`,[uid])).rows;
const led = (await c.query(`select reason, sum(delta)::text t from ep_ledger where user_id=$1 group by reason`,[uid])).rows;
console.log(`\n★馬券: ${st.map(x=>x.status+' '+x.n+'枚').join(', ')}`);
console.log(`★EP台帳: ${led.map(x=>x.reason+' '+x.t).join(', ')}`);
const pp = Number((await c.query('select prize_points from users where id=$1',[uid])).rows[0].prize_points);
console.log(`★PP: ${pp}（返還で PP が増えていないこと＝EP→PP の変換なし・憲法 §0.2）`);

const raceStatus = (await c.query('select status from races where id=$1',[race.id])).rows[0].status;
console.log(`★レース状態: ${raceStatus}`);
const ok = r1.cancelled && !r2.cancelled && (await ep())===100000 && pp===0 && raceStatus==='cancelled';
console.log(`\n★§10.2 開催中止: ${ok?'PASS':'FAIL'}`);
await clean(); await c.end();
