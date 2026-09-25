// @ts-check
/**
 * 🔴 ★**EP の日次付与**（★`0080_daily_ep.sql`・裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §1 条件 7）
 *
 * 【★裁定が求めた 4 本】
 *   ★① 同じ日に 2 回 呼んで ★**台帳が 1 行**
 *   ★② 日が変わると ★**1 行 増える**（★サーバーの日を動かして）
 *   ★③ ★**上限に当たると拒む**
 *   ★④ ★**`balance_after` と残高が一致**
 *
 * 【★足した 3 本（★「✅ が別の理由で出ていないか」）】
 *   ★⑤ ★**対照**: ★1 回めは ★確かに **+200** されている（★①「1 行」は ★**0 行でも通る**）
 *   ★⑥ ★**上限は「発行」だけを数える**: ★`refund` を 10,000 積んでも ★**拒まない**
 *      （★`delta > 0` を全部数える実装だと、★ここで落ちます）
 *   ★⑦ ★`horse_sale` は ★**発行として数える**（★上限に効く。★`inflow` だけの実装だと落ちます）
 *
 * 【⚠️ ★「1 日」をこの道具で決めない】
 *   ★製品は `world_state.day_started_at` を読みます（★**BT-6 ②⑤**）。
 *   ★② はその ★**行を動かして**日替わりを作ります（★`now()` をいじらない・★製品と同じ口を使う）。
 *
 * ⚠️ ★**必ず `--env staging`**（★`loadEnv` の既定は本番）。★最後に rollback します。
 *
 *   node tools/verify-ep-daily.mjs --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { EP_GRANTS } from '@star/betting';
import { aggregateDay } from '../apps/worker/src/daily-flow.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-ep-daily.mjs');
const __tx = await beginSandbox(c);

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
/**
 * ★`// @ts-check` を効かせるための註記（★裁定 §7 ②）。
 * ⚠️ ★`pg` の戻りは `any` なので、★ここで形を宣言しても ★**保証は増えません**。
 *    ★効いてほしいのは ★**製品の関数（`aggregateDay`）の呼び方**の検査です。
 * @param {string} s @param {unknown[]=} p @returns {Promise<any[]>}
 */
const q = async (s, p) => (await c.query(s, p)).rows;
/** @param {string} s @param {unknown[]=} p @returns {Promise<any>} */
const one = async (s, p) => (await q(s, p))[0];

/** ★`auth.uid()` を偽装する（★service_role 接続では null になる） */
const asUser = async (uid) => {
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
};
/** ★期待どおり落ちるか（★例外は取引を汚すので SAVEPOINT で包む） */
const expectFail = async (fn, label) => {
  await c.query('savepoint sp');
  try { await fn(); await c.query('rollback to savepoint sp'); return { ok: false, label }; }
  catch (e) {
    await c.query('rollback to savepoint sp');
    return { ok: true, label, message: e instanceof Error ? e.message : String(e) };
  }
};

try {
  const uid = randomUUID();
  // ★`users.id` は `auth.users(id)` を参照する（★D-078）ので、★先に auth 側の行を作る
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now())`,
    [uid, `ep-daily-${uid.slice(0, 8)}@test.local`],
  );
  await c.query(
    `insert into users (id, display_name, stable_name, entry_points) values ($1, $2, $3, 0)`,
    [uid, `検査 ${uid.slice(0, 8)}`, '検査厩舎'],
  );
  await asUser(uid);

  /**
   * ★**世界の日を、実時刻の今日に合わせる**（★サンドボックスの中なので最後に戻ります）。
   *
   * 🔴 ★なぜ要るか: ★staging の `world_state.day_started_at` は ★**ワーカーが止まった時点で凍ります**
   *   ★（★2026-09-25 の実測: ★世界の日 = **09-24T00:00Z**・実時刻 = **09-25**）。
   *   ★`DAY_MS` は 24 時間（実時間）なので、★本番でワーカーが動いていれば ★今日の 0 時が入ります。
   *   ★凍ったままだと ★**受け取った行（`created_at = now()`）が その日の窓の外**に落ち、
   *   ★⑧（`point_flow_daily` に載る）が ★測れません。
   *
   * ⚠️ 🔴 ★**これは製品の性質でもあります**（★報告に書くこと）:
   *    ★ワーカーが止まると `day_started_at` が進まず、★**誰もデイリーを受け取れなくなります**
   *    （★鍵が `daily:<利用者>:<世界の日>` なので、同じ日のままになる）。
   *    ★向きとしては ★**安全側**（★発行しすぎない）で、★ワーカーが止まればレースも調教も止まります。
   *    ★ただし画面には「受け取り済み」と出続けます。★設計を変えるかは ★オーナー判断に回します。
   */
  const frozen = (await one('select day_started_at from world_state where id')).day_started_at;
  await c.query(`update world_state set day_started_at = date_trunc('day', now()) where id`);
  const day0 = (await one('select day_started_at from world_state where id')).day_started_at;
  console.log(`  世界の日（staging の現状）= ${frozen === null ? '空' : frozen.toISOString()}`);
  console.log(`  1 日の始まり（検査中に合わせた値）= ${day0.toISOString()}`
    + `  ／ 額 = ${EP_GRANTS.daily} EP ／ 上限 = ${EP_GRANTS.daily_cap} EP`);

  const rowCount = async () => Number((await one(
    `select count(*)::int n from ep_ledger where user_id = $1 and dedupe_key like 'daily:%'`, [uid],
  )).n);
  const balance = async () => Number((await one('select entry_points from users where id = $1', [uid])).entry_points);

  // --- ① / ⑤ 1 回め ---
  const r1 = await one('select * from claim_daily_ep()');
  must(Number(r1.granted) === EP_GRANTS.daily, `⑤ 対照: 1 回めに ${EP_GRANTS.daily} EP 渡っている（実測 ${r1.granted}）`);
  must(r1.already_claimed === false, '⑤ 対照: 1 回めは「受け取り済み」ではない');
  must(await balance() === EP_GRANTS.daily, `⑤ 対照: 残高が ${EP_GRANTS.daily}（実測 ${await balance()}）`);

  // --- ① 同じ日に 2 回め ---
  const r2 = await one('select * from claim_daily_ep()');
  must(Number(r2.granted) === 0, `① 2 回めは 0 EP（実測 ${r2.granted}）`);
  must(r2.already_claimed === true, '① 2 回めは「受け取り済み」と返る');
  must(await rowCount() === 1, `① 台帳は 1 行のまま（実測 ${await rowCount()} 行）`);
  must(await balance() === EP_GRANTS.daily, `① 残高は増えていない（実測 ${await balance()}）`);

  // --- ④ balance_after と残高が一致 ---
  const led = await one(
    `select delta, balance_after from ep_ledger where user_id = $1 and dedupe_key like 'daily:%' order by id desc limit 1`, [uid],
  );
  must(Number(led.balance_after) === await balance(),
    `④ 台帳の balance_after (${led.balance_after}) ＝ 残高 (${await balance()})`);
  must(Number(led.delta) === EP_GRANTS.daily, `④ 台帳の delta ＝ ${EP_GRANTS.daily}（実測 ${led.delta}）`);

  /**
   * --- ⑧ ★**`point_flow_daily.ep_inflow` に載る**（★裁定 §1 条件 5・V-11 の監視に入る）---
   *
   * ⚠️ ★`tools/verify-flow.mjs` では確かめられませんでした。★あの道具は ★**HEAD の版でも**
   *    ★全項目 0 を出します（★2026-09-25 に確認。★私の変更のせいではない。★別件として報告）。
   *    ★原因は staging の ★世界の日（`day_started_at` = 09-24）と ★実時刻（09-25）のずれで、
   *    ★投入した行が集計の窓の外に落ちるためと見ています。
   * → ★ここでは ★**製品の `aggregateDay` をそのまま呼び**、★窓を世界の日に合わせて渡します。
   */
  const DAY_MS = 24 * 60 * 60 * 1000;
  const to8 = new Date(day0.getTime() + DAY_MS).toISOString();
  await aggregateDay(c, day0.toISOString().slice(0, 10), day0.toISOString(), to8);
  const flow = await one(
    'select ep_inflow from point_flow_daily where date = $1::date',
    [day0.toISOString().slice(0, 10)],
  );
  must(flow !== undefined && Number(flow.ep_inflow) >= EP_GRANTS.daily,
    `⑧ point_flow_daily.ep_inflow に載っている（実測 ${flow === undefined ? '行なし' : flow.ep_inflow}`
    + ` ／ 少なくとも ${EP_GRANTS.daily} 以上）`);

  // --- ② 日が変わると 1 行 増える（★製品が読む行を動かす） ---
  await c.query(`update world_state set day_started_at = day_started_at + interval '1 day' where id`);
  const r3 = await one('select * from claim_daily_ep()');
  must(Number(r3.granted) === EP_GRANTS.daily, `② 翌日は また ${EP_GRANTS.daily} EP（実測 ${r3.granted}）`);
  must(await rowCount() === 2, `② 台帳が 2 行になった（実測 ${await rowCount()} 行）`);
  must(await balance() === EP_GRANTS.daily * 2, `② 残高が ${EP_GRANTS.daily * 2}（実測 ${await balance()}）`);

  /**
   * ★次の日へ進め、★**その日の窓の中**に台帳の行を積む。
   *
   * 🔴 ★最初これを間違えました（★2026-09-25）。★`created_at` を既定（`now()`）のまま積んだので、
   *    ★進めた `day_started_at` が ★**未来**になり（★世界の日 = 09-24・実時刻 = 09-25）、
   *    ★`created_at >= v_day_from` に ★**1 行も当たりませんでした**。
   *    → ★③ は「上限が効かない」と落ち、★⑥ は ★**別の理由で通って**いました
   *      （★refund を発行と数える実装でも緑になる ＝ 対照になっていない）。
   *    → ★行の時刻を ★**世界の日に合わせて**積みます。
   */
  const nextDayWith = async (reason, delta) => {
    await c.query(`update world_state set day_started_at = day_started_at + interval '1 day' where id`);
    const from = (await one('select day_started_at from world_state where id')).day_started_at;
    const bal = await balance();
    await c.query(
      `insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key, created_at)
       values ($1, $2, $3, $4, $5, $6::timestamptz + interval '1 second')`,
      [uid, delta, bal + delta, reason, `test-${reason}:${randomUUID()}`, from.toISOString()],
    );
    await c.query('update users set entry_points = entry_points + $2 where id = $1', [uid, delta]);
  };

  // --- ⑥ 上限は「発行」だけを数える: refund は数えない ---
  await nextDayWith('refund', EP_GRANTS.daily_cap);
  const seen6 = Number((await one(
    `select coalesce(sum(l.delta), 0) s from ep_ledger l, world_state w
      where l.user_id = $1 and l.created_at >= w.day_started_at`, [uid],
  )).s);
  must(seen6 >= EP_GRANTS.daily_cap,
    `⑥ 対照: 積んだ refund が ★その日の窓に入っている（実測 ${seen6}。★0 なら ⑥ は別の理由で通る）`);
  const r4 = await one('select * from claim_daily_ep()');
  must(Number(r4.granted) === EP_GRANTS.daily,
    `⑥ refund を ${EP_GRANTS.daily_cap} 積んでも拒まない（★delta>0 を全部数える実装なら落ちる。実測 ${r4.granted}）`);

  // --- ③ / ⑦ 上限に当たると拒む（★horse_sale ＝ 発行 で埋める） ---
  await nextDayWith('horse_sale', EP_GRANTS.daily_cap);
  const before = await balance();
  const f = await expectFail(() => c.query('select * from claim_daily_ep()'), '上限');
  must(f.ok, `③⑦ 上限に当たると拒む（★horse_sale を発行と数えない実装なら通ってしまう）`
    + `${f.message === undefined ? '' : ` — ${f.message.split('\n')[0]}`}`);
  must(await balance() === before, `③ 拒んだとき 残高が動いていない（実測 ${await balance()} / 期待 ${before}）`);

  // --- ★分類表に無い語は止まる（★黙って「発行でない」にしない） ---
  const f2 = await expectFail(() => c.query(`select ep_reason_class('prize_exchange')`), '未知の語');
  must(f2.ok, '★分類表に無い語で止まる（★黙って通さない）');
} finally {
  await endSandbox(c, __tx);
  await c.end();
}

console.log(failed === 0 ? '\n✅ すべて通りました' : `\n🔴 ${failed} 件 落ちました`);
process.exit(failed === 0 ? 0 : 1);
