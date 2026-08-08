/**
 * ★景品交換を壊して確かめる（§11.3・§14.4）。
 *   憲法 S-3/S-4/S-5 と P-1〜P-5 が構造で守られているか。
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const uid = '00000000-0000-4000-8000-000000000e11';
const clean = async () => {
  await c.query(`delete from prize_exchanges where user_id=$1`,[uid]);
  await c.query(`delete from pp_ledger where user_id=$1`,[uid]);
  await c.query(`delete from users where id=$1`,[uid]);
  await c.query(`delete from prize_catalog where name like 'TEST-%'`);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ex@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points,prize_points) values ($1,'交換テスト','テスト牧場',0,10000)`,[uid]);
const pid = (await c.query(`insert into prize_catalog (name,cost_pp,stock,active) values ('TEST-ダミー景品',3000,1,true) returning id`)).rows[0].id;

const pp = async () => Number((await c.query(`select prize_points from users where id=$1`,[uid])).rows[0].prize_points);
const stock = async () => Number((await c.query(`select stock from prize_catalog where id=$1`,[pid])).rows[0].stock);
const call = async (token, prize=pid) => {
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`,[uid]);
    const r = await c.query(`select exchange_prize($1,$2) id`,[prize, token]);
    await c.query('commit'); return { ok:true, id:String(r.rows[0].id) };
  } catch(e){ await c.query('rollback'); return { ok:false, msg:e.message.split('\n')[0] }; }
};

console.log(`初期: PP=${await pp()} 在庫=${await stock()}`);
const tok = randomUUID();
const a = await call(tok);
console.log(`① 交換: ${a.ok?'成功 id='+a.id:'失敗 '+a.msg}  PP=${await pp()} 在庫=${await stock()}`);
const b = await call(tok);
console.log(`② 再送（同じ冪等キー）: ${b.ok?'同じID='+String(b.id===a.id):'失敗'}  PP=${await pp()} 在庫=${await stock()}`);
const cRes = await call(randomUUID());
console.log(`③ 在庫切れ後の交換: ${cRes.ok?'★成功してしまった':'拒否 → '+cRes.msg}  在庫=${await stock()}`);

console.log('');
const led = await c.query(`select reason, delta from pp_ledger where user_id=$1`,[uid]);
console.log(`★PP台帳: ${led.rows.map(r=>r.reason+' '+r.delta).join(', ')}`);
// ★憲法: PP→EP の逆流が無いこと
const ep = Number((await c.query(`select entry_points from users where id=$1`,[uid])).rows[0].entry_points);
console.log(`★EP: ${ep}（交換で EP が増えていないこと＝PP→EP の還流なし・S-5）`);
// ★P-1: 現金を想起させる品目が入らないこと
let cash;
try { await c.query(`insert into prize_catalog (name,cost_pp,stock) values ('TEST-現金1万円',1000,1)`); cash='★入ってしまった'; }
catch(e){ cash='拒否（制約で弾く）'; }
console.log(`★P-1 現金の品目: ${cash}`);

const ok = a.ok && b.ok && b.id===a.id && !cRes.ok && ep===0 && cash.startsWith('拒否');
console.log(`\n★§11.3: ${ok?'PASS':'FAIL'}`);
await clean(); await c.end();
