/**
 * ★賞金が実際に PP として発行されるかを本番 DB で確かめる。
 *   §9.3「PP の主な稼ぎ口は育成した馬の賞金」が成立しているか。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { tierFromDb } from '../apps/worker/src/prize-award.ts';
import { prizeFor } from '../packages/scheduler/src/index.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv, requireRow } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-prize.mjs');


// ★前提の確認は**状態を作る前**に行う（2026-08-11）。
//   後ろに置くと、落ちたときに検証用の利用者が残ります。実際 staging に3件残っていました。
requireRow(
  (await c.query(`select id from races where status='scheduled' limit 1`)).rows[0],
  '発売中のレース', 'ワーカーを回すか、レースを生成してから流してください',
);

const hash = { sha256:(m)=>createHash('sha256').update(m,'utf8').digest('hex'), hmacSha256:(k,m)=>createHmac('sha256',k).update(m,'utf8').digest('hex') };

const uid = '00000000-0000-4000-8000-00000000e711';
const clean = async () => {
  await c.query(`delete from pp_ledger where user_id=$1`,[uid]);
  await c.query(`update horses set owner_id=null, npc_stable_id=1 where owner_id=$1`,[uid]);
  await c.query(`delete from users where id=$1`,[uid]);
};
await clean();
await c.query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','prize@test.local','x',now(),now()) on conflict (id) do nothing`,[uid]);
await c.query(`insert into users (id,display_name,stable_name,entry_points,prize_points,account_type) values ($1,'賞金テスト','テスト牧場',0,0,'internal')`,[uid]);

// 発売中レースの出走馬を1頭「プレイヤーの馬」にする
const race = requireRow(
  (await c.query(`select id, cycle_index, class_rank, grade, purse from races where status='scheduled' order by cycle_index limit 1`)).rows[0],
  '発売中のレース', 'ワーカーを回すか、レースを生成してから流してください',
);
const ent = (await c.query(`select horse_id, gate from race_entries where race_id=$1 order by gate limit 1`,[race.id])).rows[0];
await c.query(`update horses set owner_id=$1, npc_stable_id=null where id=$2`,[uid, ent.horse_id]);
console.log(`レース cycle=${race.cycle_index} class=${race.class_rank}${race.grade?'/'+race.grade:''} purse=${race.purse}`);
console.log(`プレイヤーの馬: ${ent.gate}番枠`);

const pp = async () => Number((await c.query(`select prize_points from users where id=$1`,[uid])).rows[0].prize_points);
console.log(`確定前 PP=${await pp()}`);

const store = createPgStore(c, hash);
await store.settleRace(race.cycle_index);

const fin = (await c.query(`select finish_pos from race_entries where race_id=$1 and gate=$2`,[race.id, ent.gate])).rows[0];
const finishPos = Number(fin.finish_pos);
console.log('');
console.log(`着順: ${finishPos}着`);

/**
 * ★ここから「表示」ではなく「判定」にします（G-7）。
 *
 *   これまでこのツールは**数字を並べるだけ**で、§11.1 の表と突き合わせていませんでした。
 *   賞金額が表と1桁違っても「確定後 PP=…」と出るだけで、読む人が気づくしかありません。
 *   ★合否を機械が出さない検証は、合格の証拠になりません。
 */
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

const tier = tierFromDb(Number(race.class_rank), race.grade);
const expected = prizeFor(tier, finishPos);
const after = await pp();
const led = await c.query(`select reason, delta, ref_id from pp_ledger where user_id=$1 order by id`, [uid]);

console.log('');
console.log('【判定】');
check(after === expected, '① 賞金が §11.1 の表と一致',
  `${tier} の ${finishPos}着 = ${expected.toLocaleString()} PP / 実際 ${after.toLocaleString()} PP`);

if (expected > 0) {
  check(led.rowCount === 1 && led.rows[0].reason === 'prize',
    '② 台帳に reason=prize が1行だけ',
    `${led.rowCount} 行 / ${led.rows.map(r=>r.reason).join(',') || 'なし'}`);
  check(led.rowCount > 0 && Number(led.rows[0].delta) === expected,
    '③ 台帳の delta が賞金額と一致',
    `${led.rowCount ? Number(led.rows[0].delta).toLocaleString() : '—'} PP`);
  check(led.rowCount > 0 && led.rows[0].ref_id === race.id,
    '④ 台帳がそのレースを指している');
} else {
  check(led.rowCount === 0, '②〜④ 6着以下なので台帳に行が無い', `${led.rowCount} 行`);
}

// ★二重確定で賞金が二重に出ないこと
const before = await pp();
await store.settleRace(race.cycle_index);
const dbl = await pp();
const ledAfter = await c.query(`select count(*)::int n from pp_ledger where user_id=$1`, [uid]);
check(dbl === before && ledAfter.rows[0].n === led.rowCount,
  '⑤ 二重確定で賞金が二重に出ない',
  `PP ${before.toLocaleString()} → ${dbl.toLocaleString()} / 台帳 ${led.rowCount} → ${ledAfter.rows[0].n} 行`);

/**
 * ★NPC 馬に払っていないこと。
 *   最初 `user_id is null` を数えていましたが、`pp_ledger.user_id` は **NOT NULL**
 *   （`users` への外部キー）なので、**常に 0 件で必ず通る空振りの検査**でした。
 *   → そのレースで発行された賞金の**総額**が、プレイヤー所有馬のぶんだけかを見ます。
 *     出走 18頭のうちプレイヤー馬は1頭なので、総額は expected と一致するはずです。
 */
const raceTotal = await c.query(
  `select coalesce(sum(delta), 0)::text as total, count(*)::int as rows
     from pp_ledger where reason = 'prize' and ref_id = $1`, [race.id]);
const entries = await c.query(
  `select count(*)::int n from race_entries where race_id = $1`, [race.id]);
check(Number(raceTotal.rows[0].total) === expected && raceTotal.rows[0].rows === (expected > 0 ? 1 : 0),
  '⑥ そのレースの賞金発行はプレイヤー馬のぶんだけ（NPC には払わない）',
  `出走 ${entries.rows[0].n} 頭中プレイヤー馬 1 頭 / 発行 ${Number(raceTotal.rows[0].total).toLocaleString()} PP・${raceTotal.rows[0].rows} 行`);

await clean();
await c.end();
console.log('');
console.log(fails.length === 0
  ? `★G-7: PASS — 6項目すべて成立（${tier} / ${finishPos}着 / ${expected.toLocaleString()} PP）`
  : `★G-7: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
