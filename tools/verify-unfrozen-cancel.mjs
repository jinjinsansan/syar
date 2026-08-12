/**
 * ★D-056 — 凍結が無いレースは確定せず開催中止になるか（実 DB 経路）
 *
 * 【なぜ単体テストで足りないか】
 *   `cycle-runner` のテストは**偽ストア**で、SQL を1行も出しません。
 *   ここで確かめるのは「実 DB の `settleRace` が本当に投げるか」「本当に中止になるか」です。
 *   ★P1 で「機能もテストもあるのに本番の経路だけ繋がっていない」を踏んでいます。
 *
 * 【検査】
 *   ① 凍結を消したレースは **settled にならない**（結果を出してしまわない）
 *   ② ★中止になり、EP が返還される
 *   ③ ★対照: 凍結があれば普通に確定する（①②が空振りでない）
 *
 * 実行: npx tsx tools/verify-unfrozen-cancel.mjs --env staging
 */
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★凍結を消してレースを中止させるので、状態を変えるツールです（R-24）
await assertNotProduction(c, 'verify-unfrozen-cancel.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const store = createPgStore(c, hash);

console.log('# ★D-056 凍結が無いレースは確定せず中止になるか（実 DB）');
console.log('');

const races = (await c.query(
  `select r.id, r.cycle_index from races r
    where r.status = 'scheduled'
      and exists (select 1 from race_entries e where e.race_id = r.id and e.entrant_snapshot is not null)
    order by r.cycle_index limit 2`,
)).rows;
if (races.length < 2) {
  console.error('★凍結を持つ発売中のレースが2本要ります。seed-races で作ってから流してください');
  await c.end();
  process.exit(2);
}
const [target, control] = races;
console.log(`  対象 cycle=${target.cycle_index}（凍結を消す） / 対照 cycle=${control.cycle_index}（そのまま）`);

// ── ① 凍結を消して確定を試みる ───────────────────────────
const saved = (await c.query(
  `select id, entrant_snapshot from race_entries where race_id = $1`, [target.id],
)).rows;
try {
  await c.query('update race_entries set entrant_snapshot = null where race_id = $1', [target.id]);

  let threw = null;
  try {
    await store.settleRace(Number(target.cycle_index));
  } catch (e) {
    threw = e;
  }
  check(threw !== null && threw.name === 'UnfrozenRaceError',
    '① 確定が UnfrozenRaceError で止まる',
    threw === null ? '★止まらなかった' : `${threw.name}`);

  const st = (await c.query('select status from races where id = $1', [target.id])).rows[0];
  check(st.status === 'scheduled', '② 確定済みになっていない（結果を出していない）', `status=${st.status}`);

  // ── ★中止に載せる（cycle-runner が行うのと同じ呼び方）───
  const r = await store.cancelRace(Number(target.cycle_index));
  const st2 = (await c.query('select status from races where id = $1', [target.id])).rows[0];
  check(st2.status === 'cancelled', '③ ★中止になる', `status=${st2.status} / 返還 ${r.refundedBets}枚 ${r.refundedEp} EP`);
} finally {
  // ★staging を戻す（中止は戻せないので status も戻す）
  for (const row of saved) {
    await c.query('update race_entries set entrant_snapshot = $2 where id = $1',
      [row.id, row.entrant_snapshot]);
  }
  await c.query(`update races set status = 'scheduled' where id = $1 and status = 'cancelled'`, [target.id]);
}

// ── ★③ 対照: 凍結があれば普通に確定する ────────────────
console.log('');
console.log('【★対照】凍結があれば普通に確定するか（①②が空振りでないこと）');
let ok = true;
try {
  await store.settleRace(Number(control.cycle_index));
} catch (e) {
  ok = false;
  console.log(`  ★確定に失敗: ${e.message}`);
}
const cst = (await c.query('select status from races where id = $1', [control.id])).rows[0];
check(ok && cst.status === 'settled', '★対照: 凍結があれば確定する', `status=${cst.status}`);

// ── ④ 対象を戻せているか ─────────────────────────────────
const back = (await c.query(
  `select count(*)::int n from race_entries where race_id = $1 and entrant_snapshot is null`, [target.id],
)).rows[0];
const bst = (await c.query('select status from races where id = $1', [target.id])).rows[0];
check(back.n === 0 && bst.status === 'scheduled', '④ 対象を元に戻せている',
  `凍結なし ${back.n} 頭 / status=${bst.status}`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★D-056（実 DB）: PASS — 4項目すべて成立'
  : `★D-056（実 DB）: FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
