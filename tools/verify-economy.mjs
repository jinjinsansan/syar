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
  // ★`status='scheduled'` だけでは足りません。**発走時刻を過ぎたレースには馬券を買えません**
  //   （place_bet が「発売時間外」で落ちます）。実際にそれで落ち、利用者を作った後だったので
  //   **行が残りました**。前提は「買えること」まで見ます。
  (await c.query(`select id from races where status='scheduled' and scheduled_at > now() limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
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
  (await c.query(`select r.id, r.cycle_index from races r where r.status='scheduled' and r.scheduled_at > now() order by r.cycle_index limit 1`)).rows[0],
  'これから発走する発売中のレース', 'レースを生成してから流してください（発走済みには買えません）',
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

/**
 * ★判定を**戻り値で返す**（2026-08-11）。これまでは PASS / FAIL を表示するだけで
 *   どちらでも `exit 0` でした。自動化からは FAIL が成功に見えます。
 *
 * ★併せて、**経済の恒等式**を検査に足します。これまでは残高を表示するだけで、
 *   「EP を焼いた額」と「PP が出た額」が突き合わされていませんでした。
 */
const fails = [];
const check = (cond, label, detail) => {
  console.log(`  ${cond ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fails.push(label);
};

const staked = all.length * 100;
const epNow = await bal('entry_points');
const ppNow = await bal('prize_points');
const won = bs.find((x) => x.status === 'won');
const paidPp = Number(won?.paid ?? 0);
const epLed = (await c.query(
  `select reason, coalesce(sum(delta),0)::bigint t from ep_ledger where user_id=$1 group by 1`,[uid])).rows;
const ppLed = (await c.query(
  `select reason, coalesce(sum(delta),0)::bigint t, count(*)::int n from pp_ledger where user_id=$1 group by 1`,[uid])).rows;

console.log('');
console.log('【判定】');
check(epNow === 100000 - staked, '① EP は購入額だけ減る（払戻で EP は戻らない）',
  `${epNow.toLocaleString()} = 100,000 − ${staked.toLocaleString()}`);
check(Number(epLed.find((r) => r.reason === 'bet')?.t ?? 0) === -staked,
  '② EP 台帳の bet が購入額と一致', `${epLed.map(r=>r.reason+' '+r.t).join(', ')}`);
check(won !== undefined && Number(won.n) === 1, '③ 全通り買ったので的中は必ず1枚',
  `${bs.map(x=>x.status+' '+x.n+'枚').join(' / ')}`);
check(ppNow === paidPp && paidPp > 0, '④ PP は払戻額と一致（★EP を焼いて PP が出る一方通行）',
  `PP=${ppNow.toLocaleString()} / 払戻=${paidPp.toLocaleString()}`);
const ppPayout = ppLed.find((r) => r.reason === 'payout');
check(ppPayout !== undefined && Number(ppPayout.t) === paidPp && Number(ppPayout.n) === 1,
  '⑤ PP 台帳に payout が1行だけ', `${ppLed.map(r=>r.reason+' '+r.t+'('+r.n+'行)').join(', ') || 'なし'}`);
check(Number(epLed.find((r) => r.reason === 'payout')?.t ?? 0) === 0,
  '⑥ EP 台帳に払戻の行が無い（PP→EP の還流が無い・憲法②）');
check(hash.sha256(rev.seed_reveal) === rev.seed_commit && rev.status === 'settled',
  '⑦ §8.6 sha256(seed_reveal) == seed_commit', `status=${rev.status}`);

// ★二重確定してみる（PP が増えないこと）
const before = await bal('prize_points');
await store.settleRace(race.cycle_index);
const after = await bal('prize_points');
const ppRows = (await c.query(`select count(*)::int n from pp_ledger where user_id=$1`,[uid])).rows[0].n;
check(before === after && ppRows === Number(ppPayout?.n ?? 0),
  '⑧ 二重確定で PP が増えない', `PP ${before.toLocaleString()} → ${after.toLocaleString()} / 台帳 ${ppRows} 行`);

await clean();
await c.end();
console.log('');
console.log(fails.length === 0
  ? `★経済の一巡: PASS — 8項目すべて成立（${staked.toLocaleString()} EP を焼き ${paidPp.toLocaleString()} PP が出た）`
  : `★経済の一巡: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
