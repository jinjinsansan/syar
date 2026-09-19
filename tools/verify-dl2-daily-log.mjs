/**
 * ★**DL-2: 日次の枝の結果が、本当に行に残るか**（★2026-09-19・rollback ＋ txid の見張り付き）
 *
 * 🔴 ★見たいのは「通った」ではありません。★**次に同じことが起きたとき、DB から答えられるか**です:
 *   ★① 通ったことが残る ／ ★② **落ちた理由**が残る ／ ★③ ★**0 行の成功が見分けられる**
 *   ★③ が本体です — ★`point_flow_daily` が 0 行のまま 1 か月 気づかなかったのが、まさにそれ。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { runDailyStep } from '../apps/worker/src/daily-run-log.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-dl2-daily-log.mjs');
const __tx = await beginSandbox(c);
let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };
const row = async (step) => (await c.query(
  `select ok, detail, rows_written from daily_run_log where day_index = 999 and step = $1`, [step])).rows[0];

try {
  console.log('\n--- ① 通ったら残る ---');
  await runDailyStep(c, 999, 't-ok', async () => ({ rows: 7 }), (r) => r.rows);
  const a = await row('t-ok');
  must(a !== undefined, '行が在る');
  must(a?.ok === true, `ok = true（${a?.ok}）`);
  must(a?.rows_written === 7, `書いた行数が残る（${a?.rows_written}）`);
  must(a?.detail === null, '通ったら理由は null');

  console.log('\n--- ② 🔴 落ちたら、理由が残る。★そして投げ直す ---');
  let threw = false;
  try {
    await runDailyStep(c, 999, 't-fail', async () => { throw new Error('★わざと落とす'); });
  } catch (e) { threw = true; must(e.message.includes('わざと落とす'), '呼ぶ側に投げ直した'); }
  must(threw, '★投げ直している（★握り潰していない）');
  const b = await row('t-fail');
  must(b?.ok === false, `ok = false（${b?.ok}）`);
  must(typeof b?.detail === 'string' && b.detail.includes('わざと落とす'), `理由が残る: ${b?.detail}`);

  console.log('\n--- ③ 🔴 ★0 行の成功が見分けられる（★これが本体）---');
  await runDailyStep(c, 999, 't-zero', async () => ({ rows: 0 }), (r) => r.rows);
  const z = await row('t-zero');
  must(z?.ok === true, '落ちてはいない');
  must(z?.rows_written === 0, `★**0 行と分かる**（${z?.rows_written}）`);
  must(z?.rows_written !== null, '🔴 ★null（＝数えていない）ではない');

  console.log('\n--- ④ 同じ日・同じ枝を二度やると上書きされる（★冪等）---');
  await runDailyStep(c, 999, 't-ok', async () => ({ rows: 9 }), (r) => r.rows);
  const again = await row('t-ok');
  must(again?.rows_written === 9, `上書きされた（${again?.rows_written}）`);
  const cnt = Number((await c.query(
    `select count(*)::int as n from daily_run_log where day_index = 999 and step = 't-ok'`)).rows[0].n);
  must(cnt === 1, `行は 1 つのまま（${cnt}）`);

  console.log('\n--- ⑤ 🔴 理由の無い失敗は作れない（★CHECK・★対照）---');
  await c.query('savepoint s');
  try {
    await c.query(`insert into daily_run_log (day_index, step, ok, detail) values (999, 't-bad', false, null)`);
    must(false, '🔴 理由の無い失敗が入ってしまった');
  } catch (e) { must(true, `弾かれる: ${e.message.split('\n')[0].slice(0, 60)}`); }
  await c.query('rollback to savepoint s');

  console.log('\n--- ⑥ 記録が落ちても、日次は止まらない（★対照）---');
  const broken = { query: async (sql, p) => {
    if (String(sql).includes('daily_run_log')) throw new Error('★表が無い想定');
    return c.query(sql, p);
  } };
  let ran = false;
  const out = await runDailyStep(broken, 999, 't-nolog', async () => { ran = true; return { rows: 3 }; }, (r) => r.rows);
  must(ran && out.rows === 3, '★記録が落ちても本体は走り、返り値も返る');

  console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
} finally {
  await endSandbox(c, __tx);
  await c.end();
}
process.exitCode = failed === 0 ? 0 : 1;
