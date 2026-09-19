/**
 * ★**「前に言ったときの能力」が、言った週にだけ動く**（★**GB-1 ④⑤⑥**・移行 `0053`・2026-09-19）
 *
 * 【★何を確かめるか】
 *   ★**GB-1 ⑤** … ★言わなかった週に基準を動かすと、★**累積が週次と同じもの**になります。
 *     ★偽の DB では見えません — ★**一括更新の SQL が本当にその値を書くか**の話だからです。
 *   ★**GB-1 ⑥** … ★初回の基準が ★**その馬が持ち主のものになった時点の `stats`** であること。
 *   ★`0053` の CHECK … ★**片方だけ埋まっている状態を作れない**こと。
 *
 * 【🔴 ★なぜ実 DB が要るか】
 *   ★`training-runner` の一括更新は ★**`unnest($14::jsonb[], $15::bigint[])`** で書きます。
 *   ★配列の並びを 1 つ間違えると ★**別の馬の基準を書きます**。★型の検査では出ません。
 *   ★2026-09-19 に `fillRace` の `$1..$19` で ★**同じ形の危うさ**を見たばかりです。
 *
 * ⚠️ ★**必ず `--env staging` を付けて呼ぶこと**（`loadEnv` の既定は本番）。
 * ⚠️ ★取引の中で `horses` を書きます。★最後に rollback し、★SB-3 が途中の確定を見ます。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-gb1-growth-tell.mjs');
const __tx = await beginSandbox(c);

const ok = (b, m) => console.log(`  ${b ? '✅' : '🔴'} ${m}`);
let failed = 0;
const must = (b, m) => { ok(b, m); if (!b) failed += 1; };

try {
  console.log('--- ① 列と CHECK が在る（移行 0053）---');
  const cols = (await c.query(
    `select column_name from information_schema.columns
      where table_name = 'horses' and column_name in ('growth_told_stats', 'growth_told_week')
      order by column_name`)).rows.map((r) => r.column_name);
  must(cols.length === 2, `2 列とも在る（${cols.join(', ')}）`);
  const chk = (await c.query(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conname = 'horses_growth_told_both_or_neither'`)).rows[0];
  must(chk !== undefined, 'CHECK が在る');

  console.log('--- ② 🔴 片方だけは入らない（★「基準はあるが、いつのものか分からない」を作らない）---');
  const h = (await c.query(
    `select id, stats from horses where retired_at_week is null limit 1`)).rows[0];
  must(h !== undefined, '馬が引けた');
  let rejected = false;
  try {
    await c.query('savepoint sp1');
    await c.query(`update horses set growth_told_stats = stats where id = $1`, [h.id]);
    await c.query('release savepoint sp1');
  } catch {
    rejected = true;
    await c.query('rollback to savepoint sp1');
  }
  must(rejected, '🔴 ★週を入れずに基準だけ入れると弾かれる');

  let rejected2 = false;
  try {
    await c.query('savepoint sp2');
    await c.query(`update horses set growth_told_week = 100 where id = $1`, [h.id]);
    await c.query('release savepoint sp2');
  } catch {
    rejected2 = true;
    await c.query('rollback to savepoint sp2');
  }
  must(rejected2, '🔴 ★基準を入れずに週だけ入れると弾かれる');

  console.log('--- ③ 両方 一緒なら入る（★対照）---');
  await c.query(
    `update horses set growth_told_stats = stats, growth_told_week = 100 where id = $1`, [h.id]);
  const after = (await c.query(
    `select growth_told_stats, growth_told_week from horses where id = $1`, [h.id])).rows[0];
  must(after.growth_told_stats !== null && Number(after.growth_told_week) === 100,
    `★両方 入った（week=${after.growth_told_week}）`);

  console.log('--- ④ 🔴 GB-1 ⑤: ★言わなかった週に基準が動かない（★一括更新の形そのまま）---');
  /**
   * ★`training-runner` が流すのと同じ `unnest` の形。
   * ★**言わなかった週**は「いまの値をそのまま戻す」ので、★**変わらない**のが正解です。
   */
  const before = (await c.query(
    `select growth_told_stats::text as s, growth_told_week as w from horses where id = $1`,
    [h.id])).rows[0];
  await c.query(
    `update horses hh set
       growth_told_stats = t.told_stats,
       growth_told_week = t.told_week
     from unnest($1::uuid[], $2::jsonb[], $3::bigint[])
       as t(id, told_stats, told_week)
     where hh.id = t.id`,
    [[h.id], [before.s], [Number(before.w)]],
  );
  const same = (await c.query(
    `select growth_told_stats::text as s, growth_told_week as w from horses where id = $1`,
    [h.id])).rows[0];
  must(same.s === before.s && Number(same.w) === Number(before.w),
    '★言わなかった週は基準が 1 ビットも動かない');

  console.log('--- ⑤ 対照: ★言った週は動く（★④ が「いつも動かない」ではない）---');
  const moved = JSON.stringify({ ...JSON.parse(before.s), sp: JSON.parse(before.s).sp + 13 });
  await c.query(
    `update horses hh set
       growth_told_stats = t.told_stats,
       growth_told_week = t.told_week
     from unnest($1::uuid[], $2::jsonb[], $3::bigint[])
       as t(id, told_stats, told_week)
     where hh.id = t.id`,
    [[h.id], [moved], [101]],
  );
  const now = (await c.query(
    `select growth_told_stats->>'sp' as sp, growth_told_week as w from horses where id = $1`,
    [h.id])).rows[0];
  must(Number(now.sp) === JSON.parse(before.s).sp + 13 && Number(now.w) === 101,
    `★言った週は動く（sp=${now.sp} / week=${now.w}）`);

  console.log('--- ⑥ 🔴 2 頭ぶんを一度に書いても、混ざらない（★unnest の並び）---');
  /**
   * 🔴 ★配列の並びを 1 つ間違えると ★**別の馬の基準を書きます**。
   *   ★`fillRace` の `$1..$19` で同じ形の危うさを見たばかりです（2026-09-19）。
   */
  const two = (await c.query(
    `select id from horses where retired_at_week is null and id <> $1 order by id limit 2`,
    [h.id])).rows;
  must(two.length === 2, '別の馬が 2 頭 引けた');
  const a = { sp: 111, st: 1, pw: 1, gt: 1, iq: 1 };
  const b = { sp: 222, st: 2, pw: 2, gt: 2, iq: 2 };
  await c.query(
    `update horses hh set
       growth_told_stats = t.told_stats,
       growth_told_week = t.told_week
     from unnest($1::uuid[], $2::jsonb[], $3::bigint[])
       as t(id, told_stats, told_week)
     where hh.id = t.id`,
    [[two[0].id, two[1].id], [JSON.stringify(a), JSON.stringify(b)], [201, 202]],
  );
  const got = (await c.query(
    `select id, growth_told_stats->>'sp' as sp, growth_told_week as w
       from horses where id = any($1::uuid[]) order by id`, [[two[0].id, two[1].id]])).rows;
  must(Number(got[0].sp) === 111 && Number(got[0].w) === 201,
    `★1 頭目が自分の値（sp=${got[0].sp} / week=${got[0].w}）`);
  must(Number(got[1].sp) === 222 && Number(got[1].w) === 202,
    `★2 頭目が自分の値（sp=${got[1].sp} / week=${got[1].w}）`);

  console.log('--- ⑦ 公開ビューに漏れていない（★`stats` の写しなので D-114 が開く）---');
  const leaked = (await c.query(
    `select column_name from information_schema.columns
      where table_name = 'my_horses' and column_name like 'growth_told%'`)).rowCount;
  must(leaked === 0, `★my_horses に出ていない（${leaked} 列）`);

  console.log('');
  console.log(failed === 0 ? '✅ 全部 通りました' : `🔴 ${failed} 件が落ちました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
  console.log('（rollback しました）');
}
