import { readFileSync } from 'node:fs';
import pg from 'pg';
import { assertNotProduction } from './lib/guard.mjs';
const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-db.mjs');

const q = async (label, sql) => { const r = await c.query(sql); console.log(label, JSON.stringify(r.rows)); };

await q('テーブル数:', `select count(*)::int as n from information_schema.tables where table_schema='public'`);
await q('ビュー:', `select table_name from information_schema.views where table_schema='public'`);
await q('RLS有効:', `select relname from pg_class where relrowsecurity and relnamespace='public'::regnamespace order by 1`);
await q('place_bet 引数:', `select pg_get_function_identity_arguments(oid) as args from pg_proc where proname='place_bet'`);
await q('★pp_ledger の reason 制約:', `select pg_get_constraintdef(oid) as def from pg_constraint where conname='pp_ledger_reason_allowed'`);
await q('★races_public に security_invoker が付いていない:', `select coalesce(reloptions::text,'なし') as opt from pg_class where relname='races_public'`);

// ★A-4 の実証: 確定前の行に seed_reveal を入れようとすると制約で落ちるか
try {
  await c.query(`insert into races (name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,seed_reveal,purse) values ('T',1,'turf',2000,'good','C1',now(),'x','LEAK',0)`);
  console.log('★A-4: FAIL — 確定前に seed_reveal を書き込めてしまった');
} catch (e) {
  console.log('★A-4: PASS — 確定前の seed_reveal は制約で拒否 /', e.message.split('\n')[0].slice(0,60));
}
await c.end();
