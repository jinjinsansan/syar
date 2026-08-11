/**
 * ★開催中止と返還を壊して確かめる（§10.2・§9.1）。
 *   返還が無いと、発売後に成立しなかったレースで**客の EP が返りません**。
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { cancelRace } from '../apps/worker/src/cancel.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, requireRow } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-cancel.mjs');


// ★前提の確認は**状態を作る前**に行う（2026-08-11）。
//   後ろに置くと、落ちたときに検証用の利用者が残ります。実際 staging に3件残っていました。
requireRow(
  // ★`status='scheduled'` だけでは足りません。**発走時刻を過ぎたレースには馬券を買えません**
  //   （place_bet が「発売時間外」で落ちます）。実際にそれで落ち、利用者を作った後だったので
  //   **行が残りました**。前提は「買えること」まで見ます。
  (await c.query(`select id from races where status='scheduled' and scheduled_at > now() limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
);

const uid = '00000000-0000-4000-8000-0000000ca4ce';
const clean = async () => {
  await c.query('delete from ep_ledger where user_id=$1',[uid]);
  await c.query('delete from bets where user_id=$1',[uid]);
  await c.query('delete from users where id=$1',[uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points,account_type) values ($1,'中止テスト','テスト牧場',100000,'internal')`,[uid]);

// 発売中のレースに馬券を買う
const race = requireRow(
  (await c.query(`select id, cycle_index from races where status='scheduled' and scheduled_at > now() order by cycle_index desc limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
);
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
/**
 * ★判定を**戻り値で返す**（2026-08-11）。
 *   これまで PASS / FAIL を**表示するだけ**で、どちらでも `exit 0` でした。
 *   自動化からは FAIL が「成功した実行」に見えます。
 *   ★合否を機械が返さない検証は、合格の証拠になりません。
 */
const fails = [];
const check = (cond, label, detail) => {
  console.log(`  ${cond ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fails.push(label);
};
const epAfter = await ep();
console.log('');
console.log('【判定】');
check(r1.cancelled, '① 開催中止が実行された', `返還 ${r1.refundedBets}枚 / ${r1.refundedEp} EP`);
check(r1.refundedBets === odds.length, '② 買った枚数だけ返還された', `${r1.refundedBets} / ${odds.length} 枚`);
check(epAfter === 100000, '③ EP が全額戻った', `${epAfter.toLocaleString()} / 100,000`);
check(!r2.cancelled, '④ 二重中止で二度目は何もしない');
check(pp === 0, '⑤ 返還で PP が増えていない（EP→PP の変換が無い・憲法②）', `PP=${pp}`);
check(raceStatus === 'cancelled', '⑥ レースが cancelled になっている', raceStatus);

await clean(); await c.end();
console.log('');
console.log(fails.length === 0
  ? `★§10.2 開催中止: PASS — 6項目すべて成立（${odds.length}枚 / ${r1.refundedEp.toLocaleString()} EP 返還）`
  : `★§10.2 開催中止: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
