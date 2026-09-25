/**
 * ★**出走の取消の受付を、実 DB で確かめる**（★2026-09-25・0079・正典 D-123）
 *
 * 【★何を見るか】
 *   ★① ★未認証では通らない
 *   ★② ★他の人の登録は取り消せない
 *   ★③ ★`announced`（★枠だけの段）なら ★**受け付ける**
 *   ★🔴 ④ ★**`scheduled`（発売できる段）になったら拒む**（★D-123 の本体・★レビュー側の条件）
 *   ★⑤ ★同じ依頼 ID の再送は ★**前の行を返す**（★二重に積まない）
 *   ★⑥ ★すでに取消の登録は受けない
 *
 * 【🔴 ★対照が本体です】
 *   ★③ だけ見ると「★**何を渡しても受け付ける**」でも緑になります。
 *   ★③ と ④ は ★**段の 1 列だけ**を動かした前後です。★それ以外は同じ行・同じ利用者です。
 *
 * ⚠️ ★**書きますが、★必ず戻します**（`beginSandbox` / `endSandbox`・SB-3）。
 *    ★staging に取消の予行に使える登録が無いので、★**予行の中で作ります**
 *    （★`scheduled` のレースを `announced` に倒し、★その登録の馬に持ち主を付ける）。
 * ⚠️ ★本番には向けません（`assertNotProduction`）。
 *
 * ★実行: npx tsx tools/verify-entry-scratch-live.mjs --env staging
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox, sandboxTx } from './lib/sandbox-tx.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-entry-scratch-live.mjs');

let pass = 0; let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) { pass += 1; console.log(`  ✅ ${label}${detail === '' ? '' : `  ${detail}`}`); }
  else { fail += 1; console.log(`  🔴 ${label}${detail === '' ? '' : `  ${detail}`}`); }
};
/**
 * ★呼んでみて、★例外の文面を返す（★通ったら null）。
 *
 * 🔴 ★**セーブポイントで囲みます。** ★PostgreSQL は取引の中で例外が出ると ★**取引ごと汚れ**、
 *    ★以降の問い合わせが全部 `current transaction is aborted` で落ちます。
 *    ★実際、囲まずに書いたら ★**④ が通った直後に予行が壊れ**、★`rollback` すら効きませんでした。
 * ⚠️ ★「落ちること」を見る検査は、★**落ちた後も続けられる形**で書くこと。
 */
let spN = 0;
const tryCall = async (sql, params) => {
  const sp = `sp_${spN += 1}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    await c.query(`release savepoint ${sp}`);
    return null;
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return String(e.message);
  }
};

console.log('=== 0079 request_entry_scratch ===');

const user = (await c.query('select id from users order by created_at limit 1')).rows[0]?.id;
if (user === undefined) {
  console.error('🔴 ★利用者が居ません。★staging に登録してください');
  await c.end();
  process.exit(2);
}

/**
 * ★① 未認証（★取引の外で・★セーブポイントは取引の中でしか張れないので、ここは素で呼ぶ）
 */
let unauth = null;
try { await c.query('select * from request_entry_scratch($1,$2)', [randomUUID(), randomUUID()]); }
catch (e) { unauth = String(e.message); }
check(unauth?.includes('未認証') === true, '① 未認証では通らない');

const tx = await beginSandbox(c);
try {
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);

  /** ★予行の材料: ★同じレースに 2 件 以上の登録が在るものを 1 つ */
  const race = (await c.query(
    'select e.race_id, count(*)::int n from race_entries e join races r on r.id = e.race_id'
    + " where e.scratched_at is null and r.status = 'scheduled'"
    + ' group by e.race_id having count(*) >= 2 limit 1',
  )).rows[0];
  if (race === undefined) throw new Error('★予行に使えるレースがありません（★登録が 2 件 以上の scheduled）');
  const entries = (await c.query(
    'select id, horse_id from race_entries where race_id = $1 and scratched_at is null limit 2', [race.race_id],
  )).rows;

  // ★段を `announced` へ倒し、★2 頭の持ち主をこの利用者にする（★予行の中だけ）
  await c.query("update races set status = 'announced' where id = $1", [race.race_id]);
  /**
   * ⚠️ ★`horses_owner_xor_npc` が ★**持ち主と NPC 厩舎の排他**を縛ります。
   *    ★持ち主を付けるときは ★`npc_stable_id` を外すこと（★片方だけ書くと落ちます）。
   */
  for (const e of entries) {
    await c.query('update horses set owner_id = $2, npc_stable_id = null where id = $1', [e.horse_id, user]);
  }

  /** ★③ `announced` なら受け付ける */
  const id1 = randomUUID();
  const r1 = (await c.query('select * from request_entry_scratch($1,$2)', [id1, entries[0].id])).rows[0];
  check(r1?.status === 'pending', '③ announced なら受け付ける', `status=${r1?.status}`);

  /** ★⑤ 再送は前の行を返す（★二重に積まない） */
  const again = (await c.query('select * from request_entry_scratch($1,$2)', [id1, entries[0].id])).rows[0];
  const rows = (await c.query('select count(*)::int n from entry_scratch_requests where entry_id = $1', [entries[0].id])).rows[0].n;
  check(again?.status === 'pending' && rows === 1, '⑤ 同じ依頼 ID の再送は積み増さない', `行 ${rows} 件`);

  /** 🔴 ★④ 対照: ★段を `scheduled` に戻すと拒む（★動かしたのは段の 1 列だけ） */
  await c.query("update races set status = 'scheduled' where id = $1", [race.race_id]);
  const blocked = await tryCall('select * from request_entry_scratch($1,$2)', [randomUUID(), entries[1].id]);
  check(blocked?.includes('もう取り消せません') === true, '🔴 ④ scheduled になったら拒む（★D-123）', blocked ?? '通ってしまった');

  /** ★対照の対照: ★段を戻せば、★同じ登録が受け付けられる（★拒んだのは段だと言える） */
  await c.query("update races set status = 'announced' where id = $1", [race.race_id]);
  const r2 = (await c.query('select * from request_entry_scratch($1,$2)', [randomUUID(), entries[1].id])).rows[0];
  check(r2?.status === 'pending', '④ 対照: 段を announced に戻すと受け付ける', `status=${r2?.status}`);

  /** ★② 他の人の登録（★3 件目を使う。★持ち主が居ないままの馬） */
  const other = (await c.query(
    'select id from race_entries where race_id = $1 and scratched_at is null and id <> all($2::uuid[]) limit 1',
    [race.race_id, entries.map((e) => e.id)],
  )).rows[0];
  if (other !== undefined) {
    const notMine = await tryCall('select * from request_entry_scratch($1,$2)', [randomUUID(), other.id]);
    check(notMine?.includes('自分の馬の登録ではありません') === true, '② 他の人の登録は取り消せない', notMine ?? '通ってしまった');
  } else {
    check(true, '② 他の人の登録（★3 件目が無いので飛ばす）');
  }

  /**
   * 🔴 ★⑦ ★**ワーカーが確定できるか**（★`runEntryScratch` をこの取引の中で呼ぶ）。
   *   ★見るのは ★**取消になること**と ★**返した額が台帳と残高に一致すること**です。
   *   ⚠️ ★返す処理は `scratchEntry`（★既存）。★ここでは呼べることと、★結果が合うことだけを見ます。
   */
  await c.query("update races set status = 'announced' where id = $1", [race.race_id]);
  const target = entries[0].id;
  /**
   * ⚠️ ★**この時点で依頼は 2 件 積まれています**（★③ と ④ の対照で 1 件ずつ）。
   *    ★そのまま流すと ★**2 件とも確定**し、★1 件ぶんの料金と比べた検査が落ちます
   *    （★実際そうなりました。★**製品は正しく、★検査の算数が誤り**でした）。
   * → ★確定を 1 件に絞ります（★予行の中なので消してよい）。
   */
  await c.query('delete from entry_scratch_requests where entry_id <> $1', [target]);
  const fee = Number((await c.query(
    'select r.entry_fee_ep + coalesce((e.jockey_frozen->>\'feeEP\')::int, 0) total'
    + ' from race_entries e join races r on r.id = e.race_id where e.id = $1', [target],
  )).rows[0].total);
  const before = Number((await c.query('select entry_points from users where id = $1', [user])).rows[0].entry_points);

  /**
   * 🔴 ★**`sandboxTx` で包みます**（★`runEntryScratch` は ★**要求ごとに自分で `commit` します**）。
   *   ★素の client を渡すと、★内側の `commit` が ★**この予行の取引ごと確定**させます
   *   （★実際そうなり、★`25P01` で落ちました）。★包むと内側の `begin`/`commit` は飲み込まれ、
   *   ★確定するかどうかは ★**外側だけ**が決めます（★SB-3 がそれを数えます）。
   */
  const { runEntryScratch } = await import('../apps/worker/src/entry-scratch-runner.ts');
  const boxed = sandboxTx(c);
  const res = await runEntryScratch(boxed.client, (m) => console.log(`    （警報）${m}`));
  check(boxed.swallowed.length > 0, '⑦ 取引の文を飲み込んだ（★包みが効いている）', `${boxed.swallowed.length} 文`);
  check(res.done >= 1, '⑦ ワーカーが確定した', `確定 ${res.done} 件 / 返した ${res.refundedEp} EP`);

  const after = Number((await c.query('select entry_points from users where id = $1', [user])).rows[0].entry_points);
  check(after - before === fee, '⑦ 返した額が登録料＋騎手の料金と一致', `残高 ${before} → ${after}（料金 ${fee}）`);
  const led = (await c.query(
    "select delta, balance_after from ep_ledger where dedupe_key = $1", [`scratch:${target}`],
  )).rows[0];
  check(led !== undefined && Number(led.delta) === fee && Number(led.balance_after) === after,
    '⑦ 台帳の delta と balance_after が残高と一致',
    led === undefined ? '台帳に行が無い' : `delta=${led.delta} balance_after=${led.balance_after}`);
  const scratched = (await c.query('select scratched_at, scratch_reason from race_entries where id = $1', [target])).rows[0];
  check(scratched.scratched_at !== null && scratched.scratch_reason === 'owner_request',
    '⑦ 登録が取消になり、理由が残っている', `理由=${scratched.scratch_reason}`);

  /** ★⑦ 対照: ★もう一度 流しても二度払いしない（★`dedupe_key`） */
  await c.query("update entry_scratch_requests set status = 'pending', processed_at = null where entry_id = $1", [target]);
  const twice = await runEntryScratch(sandboxTx(c).client, () => { /* ★黙る */ });
  const after2 = Number((await c.query('select entry_points from users where id = $1', [user])).rows[0].entry_points);
  check(after2 === after, '⑦ 対照: もう一度 流しても二度払いしない', `残高 ${after} → ${after2}（確定 ${twice.done} 件）`);

  /** ★⑥ すでに取消の登録は受けない */
  const done = await tryCall('select * from request_entry_scratch($1,$2)', [randomUUID(), target]);
  check(done?.includes('すでに取消') === true, '⑥ すでに取消の登録は受けない', done ?? '通ってしまった');
} finally {
  const end = await endSandbox(c, tx);
  check(!end.committed, '★予行を戻した（★途中の commit なし・SB-3）');
}

console.log(`\n${fail === 0 ? '✅ ★合格' : '🔴 ★不合格'}（${pass} 件 通過 / ${fail} 件 失敗）`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
