/**
 * ★経済の一周を実測する: 馬券を買う → レース確定 → 払戻 → PP 発行
 *   「動いた」ではなく **EP と PP が正しく動いたこと**を数字で確認する。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, requireRow } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-economy.mjs');


// ★前提の確認は**状態を作る前**に行う（2026-08-11）。
//   後ろに置くと、落ちたときに検証用の利用者が残ります。実際 staging に3件残っていました。
requireRow(
  (await c.query(`select id from races where status='scheduled' limit 1`)).rows[0],
  '発売中のレース', 'ワーカーを回すか、レースを生成してから流してください',
);

const hash = {
  sha256:(m)=>createHash('sha256').update(m,'utf8').digest('hex'),
  hmacSha256:(k,m)=>createHmac('sha256',k).update(m,'utf8').digest('hex'),
};

const uid = '00000000-0000-4000-8000-0000000ec0c0';
const clean = async () => {
  await c.query(`delete from pp_ledger where user_id=$1`,[uid]);
  await c.query(`delete from ep_ledger where user_id=$1`,[uid]);
  await c.query(`delete from bets where user_id=$1`,[uid]);
  await c.query(`delete from users where id=$1`,[uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','eco@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points,account_type) values ($1,'経済テスト','テスト牧場',100000,'internal')`,[uid]);

// 発売中のレースを1つ選び、人気1位の単勝を買う
const race = requireRow(
  (await c.query(`select r.id, r.cycle_index from races r where r.status='scheduled' order by r.cycle_index limit 1`)).rows[0],
  '発売中のレース', 'ワーカーを回すか、レースを生成してから流してください',
);
// ★全馬の単勝を買う。**必ず1点は当たる**ので、払戻の経路を確実に通す。
//   1点だけ買って外れると「払戻が壊れていても PASS に見える」。
const all = (await c.query(`select selection, odds from race_odds where race_id=$1 and bet_type='win' order by odds`,[race.id])).rows;
console.log(`レース cycle=${race.cycle_index}  単勝 ${all.length}点を各100EP で購入（必ず1点当たる）`);

const bal = async (col) => Number((await c.query(`select ${col} from users where id=$1`,[uid])).rows[0][col]);
console.log(`購入前  EP=${await bal('entry_points')} PP=${await bal('prize_points')}`);

// ★set_config の第3引数 true は**トランザクション内でのみ有効**。
//   外で呼ぶと次の文には効かず、place_bet が「未認証」で落ちる。
await c.query('begin');
await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`,[uid]);
for (const o of all) {
  await c.query(`select place_bet($1,'win',$2::jsonb,100,$3)`,[race.id, JSON.stringify(o.selection), randomUUID()]);
}
await c.query('commit');
console.log(`購入後  EP=${await bal('entry_points')} PP=${await bal('prize_points')}  （${all.length * 100} EP で購入）`);

// ★確定させる
const store = createPgStore(c, hash);
await store.settleRace(race.cycle_index);
const bs = (await c.query(`select status, count(*)::int n, coalesce(sum(payout),0)::bigint paid from bets where user_id=$1 group by 1`,[uid])).rows;
const fin = (await c.query(`select gate, finish_pos from race_entries where race_id=$1 order by finish_pos limit 3`,[race.id])).rows;
console.log('');
console.log(`着順（上位3）: ${fin.map(f=>f.finish_pos+'着 '+f.gate+'番').join(' / ')}`);
console.log(`馬券: ${bs.map(x=>x.status+' '+x.n+'枚(払戻'+x.paid+'PP)').join(' / ')}`);
console.log(`確定後  EP=${await bal('entry_points')} PP=${await bal('prize_points')}`);

const rev = (await c.query(`select seed_reveal, seed_commit, status from races where id=$1`,[race.id])).rows[0];
console.log('');
console.log(`★§8.6 検証: sha256(seed_reveal)==seed_commit → ${hash.sha256(rev.seed_reveal)===rev.seed_commit?'PASS':'FAIL'}  status=${rev.status}`);

// ★二重確定してみる（PP が増えないこと）
const before = await bal('prize_points');
await store.settleRace(race.cycle_index);
const after = await bal('prize_points');
console.log(`★二重確定: PP ${before} → ${after}  ${before===after?'PASS（増えない）':'FAIL（増えた）'}`);

const led = await c.query(`select reason, delta from pp_ledger where user_id=$1`,[uid]);
console.log(`★PP台帳: ${led.rows.map(r=>r.reason+' '+r.delta).join(', ')||'（なし）'}`);
await clean();
await c.end();
