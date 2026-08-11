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
  // ★`status='scheduled'` だけでは足りません。**発走時刻を過ぎたレースには馬券を買えません**
  //   （place_bet が「発売時間外」で落ちます）。実際にそれで落ち、利用者を作った後だったので
  //   **行が残りました**。前提は「買えること」まで見ます。
  (await c.query(`select id from races where status='scheduled' and scheduled_at > now() limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
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
  (await c.query(`select id, cycle_index, class_rank, grade, purse from races where status='scheduled' and scheduled_at > now() order by cycle_index limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
);
/**
 * ★出走馬の**最終枠を除く全頭**をプレイヤーの馬にします。
 *
 * 【なぜ1頭ではいけないか】
 *   最初は1頭だけ所有させていました。その馬が**13着**になり、賞金は 0 PP。
 *   検査は「表と一致（0 PP = 0 PP）」で**全項目 PASS** と出ましたが、
 *   ★**発行の経路を一度も通っていません**（B-1 の⑤⑥と同じ空振り）。
 *
 *   → 最終枠以外を全部持てば、**1〜5着のどれかは必ず自分の馬**になり、
 *     §11.1 の表を実際に通せます。最終枠を残すのは
 *     「所有していない馬には払わない」を同時に確かめるためです。
 */
const ents = (await c.query(`select horse_id, gate from race_entries where race_id=$1 order by gate`,[race.id])).rows;
const notMine = ents[ents.length - 1];
const mine = ents.slice(0, -1);
for (const e of mine) {
  await c.query(`update horses set owner_id=$1, npc_stable_id=null where id=$2`,[uid, e.horse_id]);
}
console.log(`レース cycle=${race.cycle_index} class=${race.class_rank}${race.grade?'/'+race.grade:''} purse=${race.purse}`);
console.log(`出走 ${ents.length} 頭 / プレイヤーの馬 ${mine.length} 頭（${notMine.gate}番枠だけ NPC のまま）`);

const pp = async () => Number((await c.query(`select prize_points from users where id=$1`,[uid])).rows[0].prize_points);
console.log(`確定前 PP=${await pp()}`);

const store = createPgStore(c, hash);
await store.settleRace(race.cycle_index);

const finRows = (await c.query(
  `select gate, finish_pos, horse_id from race_entries where race_id=$1 order by finish_pos`,[race.id])).rows;
const mineGates = new Set(mine.map((e) => e.gate));
console.log('');
console.log(`着順（上位6）: ${finRows.slice(0,6).map(r=>`${r.finish_pos}着=${r.gate}番${mineGates.has(r.gate)?'★自分':'(NPC)'}`).join(' ')}`);

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
/** ★自分の馬が入った着順ごとに、§11.1 の表から期待額を積む */
let expected = 0;
const paying = [];
for (const r of finRows) {
  const amount = prizeFor(tier, Number(r.finish_pos));
  if (amount <= 0) continue;
  if (mineGates.has(r.gate)) { expected += amount; paying.push(`${r.finish_pos}着 ${amount.toLocaleString()}`); }
}
const after = await pp();
const led = await c.query(`select reason, delta, ref_id from pp_ledger where user_id=$1 order by id`, [uid]);

console.log('');
console.log('【判定】');
// ★空振りをここで止める。発行が 0 なら「表と一致」は何も確かめていない
check(expected > 0, '⓪ 賞金の発行経路を実際に通した（空振りでない）',
  `自分の馬の入賞: ${paying.join(' / ') || '★なし'}`);
check(after === expected, '① 合計が §11.1 の表と一致',
  `${tier} / 期待 ${expected.toLocaleString()} PP / 実際 ${after.toLocaleString()} PP`);
check(led.rowCount === paying.length && led.rows.every((r) => r.reason === 'prize'),
  '② 台帳の行数が入賞頭数と一致し、すべて reason=prize',
  `${led.rowCount} 行 / 入賞 ${paying.length} 頭`);
check(led.rows.reduce((a, r) => a + Number(r.delta), 0) === expected,
  '③ 台帳の delta の合計が賞金額と一致');
check(led.rows.every((r) => r.ref_id === race.id),
  '④ すべての行がそのレースを指している');

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
const npcFinish = Number(finRows.find((r) => r.gate === notMine.gate).finish_pos);
const npcWouldGet = prizeFor(tier, npcFinish);
check(Number(raceTotal.rows[0].total) === expected && raceTotal.rows[0].rows === paying.length,
  '⑥ そのレースの発行は自分の馬のぶんだけ（NPC には払わない）',
  `${notMine.gate}番枠(NPC) は ${npcFinish}着＝表なら ${npcWouldGet.toLocaleString()} PP だが発行 0 / ` +
  `レース合計 ${Number(raceTotal.rows[0].total).toLocaleString()} PP・${raceTotal.rows[0].rows} 行`);

await clean();
await c.end();
console.log('');
console.log(fails.length === 0
  ? `★G-7: PASS — 7項目すべて成立（${tier} / 入賞 ${paying.length} 頭 / 合計 ${expected.toLocaleString()} PP）`
  : `★G-7: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
