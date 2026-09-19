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
import { takeSnapshot, readSnapshot, dropSnapshot } from './lib/snapshot-file.mjs';
import { RESTORE_PRIZE } from './lib/tool-restores.mjs';
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

/**
 * 🔴 ★**ここが `STABLE-1-SKEW` の正体でした**（★2026-09-19・**SB-6**）。
 *
 * ★旧: `update horses set owner_id=null, npc_stable_id=1 where owner_id=$1`
 *   → ★**厩舎 1 の決め打ち**。★この道具は ★**最終枠を除く全頭**（★1 回 17 頭 前後）を
 *     ★プレイヤー所有にするので、★**流すたびに 17 頭が 厩舎 1 へ 一方向に移っていました。**
 *
 * ✔ ★staging の跡（★`diag-stable1-skew.mjs`・★読むだけ）:
 *   ★**6 本のレースで「厩舎 1 の頭数 ＝ 出走頭数 − 1」ちょうど**（17/18・12/13・10/11・9/10・9/10・7/8）。
 *   ★**他の 39 厩舎では 0 本。** ★厩舎 1 の余り 92 頭 のうち ★**66 頭（72%）**を説明します。
 *
 * ⚠️ 🔴 ★**`verify-g6` より悪い形でした** — ★あちらは元の値をメモリに持っていて「殺されると失う」。
 *   ★こちらは ★**元の値を読んでさえいなかった**ので、★**毎回 正常終了しても失っていました。**
 *
 * ★新: ★**付け替える前に、★馬ごとの元の厩舎を控え**（`tmp/snapshots/verify-prize.json`）、
 *   ★そこから戻します。★殺されても次の実行が戻します。
 */
const clean = async () => {
  await c.query(`delete from pp_ledger where user_id=$1`,[uid]);
  /**
   * ⚠️ ★控えが在るときは ★**控えのとおりに**戻します。
   * ⚠️ ★控えが無いのに所有馬が残っている場合は ★**戻せません** — ★決め打ちで 1 に入れず、
   *   ★**数えて出します**（★`R-21`: ★「戻せない」を「片付いた」に落とさない）。
   */
  const snap = readSnapshot(RESTORE_PRIZE.snapshot);
  if (snap !== null) {
    const { rows } = await RESTORE_PRIZE.restore(c, snap.data);
    console.log(`  ★控えから ${rows} 頭を元の厩舎に戻しました（控え ${snap.takenAt}）`);
    dropSnapshot(RESTORE_PRIZE.snapshot);
  }
  const orphan = Number((await c.query(`select count(*)::int n from horses where owner_id=$1`,[uid])).rows[0].n);
  if (orphan > 0) {
    // 🔴 ★ここに来たら、★元の厩舎はもう分かりません。★**黙って 1 に入れないこと。**
    console.log(`  🔴 ★控えの無い所有馬が ${orphan} 頭 残っています — ★元の厩舎が分かりません。`);
    console.log('     ★決め打ちで戻すと STABLE-1-SKEW を作り直します。★手で決めてください。');
    orphanLeft = orphan;
  }
  await c.query(`delete from users where id=$1`,[uid]);
};
let orphanLeft = 0;
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

/**
 * 🔴 ★**付け替える前に、★馬ごとの元の厩舎を控える**（★**SB-6**・2026-09-19）。
 *
 * ⚠️ ★`horses_owner_xor_npc` があるので、★`owner_id` を入れた瞬間に
 *   ★`npc_stable_id` は行から消えます。★**先に読まないと、もうどこにもありません。**
 * ⚠️ ★旧い形はこれを読まず、★後片付けで `npc_stable_id = 1` と決め打ちしていました。
 */
const originals = (await c.query(
  `select id::text as id, npc_stable_id from horses where id = any($1::uuid[])`,
  [mine.map((e) => e.horse_id)],
)).rows;
const missing = originals.filter((r) => r.npc_stable_id === null);
if (missing.length > 0) {
  // 🔴 ★前の実行の残り物かもしれません。★黙って進むと控えに null が入ります。
  throw new Error(`★所属厩舎の無い NPC 馬が ${missing.length} 頭います。★先に前の実行の残り物を片付けてください`);
}
takeSnapshot(RESTORE_PRIZE.snapshot, {
  horses: originals.map((r) => [r.id, r.npc_stable_id]),
  uid,
});

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

/**
 * 🔴 ★**戻ったことを数える**（★**TL-1** の `restores`・2026-09-19）。
 *   ⚠️ ★以前はここが ★**「片付けを呼んだ」だけ**で、★片付いたかを見ていませんでした（`pending`）。
 *   🔴 ★そして片付け自体が ★**厩舎 1 の決め打ち**で、★`STABLE-1-SKEW` を作っていました。
 */
const leftOwned = Number((await c.query(`select count(*)::int n from horses where owner_id=$1`,[uid])).rows[0].n);
const leftUser = Number((await c.query(`select count(*)::int n from users where id=$1`,[uid])).rows[0].n);
const leftLedger = Number((await c.query(`select count(*)::int n from pp_ledger where user_id=$1`,[uid])).rows[0].n);
/** ★控えのとおりに戻ったか（★馬ごとに元の厩舎へ・★1 に寄せていないか） */
const backHome = (await c.query(
  `select count(*)::int as n from unnest($1::uuid[], $2::int[]) as t(id, stable)
     join horses h on h.id = t.id
    where h.npc_stable_id is distinct from t.stable`,
  [originals.map((r) => r.id), originals.map((r) => Number(r.npc_stable_id))],
)).rows[0].n;
check(leftOwned === 0 && leftUser === 0 && leftLedger === 0,
  '⑦ 検証用の口座・台帳・所有馬が残っていない',
  `所有馬 ${leftOwned} / 口座 ${leftUser} / 台帳 ${leftLedger} 行`);
check(Number(backHome) === 0 && orphanLeft === 0,
  '⑧ 🔴 全頭が**元の**厩舎に戻った（★1 に寄せていない・★STABLE-1-SKEW の再発防止）',
  `違う厩舎に居る馬 ${backHome} 頭 / 控えの無い残り ${orphanLeft} 頭 / 対象 ${originals.length} 頭`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? `★G-7: PASS — 9項目すべて成立（${tier} / 入賞 ${paying.length} 頭 / 合計 ${expected.toLocaleString()} PP）`
  : `★G-7: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
