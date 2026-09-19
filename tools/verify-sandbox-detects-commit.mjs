/**
 * ★**SB-3 の見張りが、本当に「途中の確定」を見つけるか**（★2026-09-19・対照つき）
 *
 * 🔴 ★`endSandbox` が ✅ を返しても、★**それが「確定していない」証拠とは限りません**
 *   （★いつでも ✅ を返す実装でも同じ見た目になります）。
 *   → ★★**わざと途中で `commit` して、🔴 を返させます。**
 *
 * ⚠️ ★**実データには触りません。** ★一時表を 1 つ作るだけです（★`on commit drop` も使いません —
 *    ★それ自体が取引に依存するので、★確かめたいものを確かめられなくなります）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox, sandboxTx } from './lib/sandbox-tx.mjs';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'verify-sandbox-detects-commit.mjs');

let failed = 0;
const must = (b, m) => { console.log(`  ${b ? '✅' : '🔴'} ${m}`); if (!b) failed += 1; };

console.log('\n--- ① 途中で commit しなければ ✅（★正常系）---');
{
  const tx = await beginSandbox(c);
  await c.query('create temporary table sb_probe_a (n int)');
  await c.query('insert into sb_probe_a values (1)');
  const r = await endSandbox(c, tx);
  must(r.committed === false, `確定していないと言った（committed=${r.committed}）`);
}

console.log('\n--- ② 🔴 途中で commit したら 🔴 と言うか（★対照・これが本体）---');
{
  const tx = await beginSandbox(c);
  await c.query('create temporary table sb_probe_b (n int)');
  // ★製品の関数が内側で commit したのと同じこと
  await c.query('commit');
  const r = await endSandbox(c, tx);
  must(r.committed === true, `🔴 途中の確定を見つけた（committed=${r.committed}・${r.before} → ${r.after}）`);
}

console.log('\n--- ③ 包みを通せば、内側の commit は届かない ---');
{
  const tx = await beginSandbox(c);
  const { client: sandboxed, swallowed } = sandboxTx(c);
  await sandboxed.query('create temporary table sb_probe_c (n int)');
  await sandboxed.query('commit');   // ★横取りされる
  await sandboxed.query('begin');    // ★横取りされる
  must(swallowed.length === 2, `横取りした文が 2 つ（${swallowed.join(',')}）`);
  const r = await endSandbox(c, tx);
  must(r.committed === false, `包みが効いている（committed=${r.committed}）`);
}

console.log('\n--- ④ 横取りが 0 件なら「包む意味が無かった」と分かる（★R-21）---');
{
  const { swallowed } = sandboxTx(c);
  must(swallowed.length === 0, '呼ばなければ 0 件（★0 件は「効いた」ではない）');
}

await c.query('drop table if exists sb_probe_a, sb_probe_b, sb_probe_c');
await c.end();
console.log(failed === 0 ? '\n✅ 全部通りました' : `\n🔴 ${failed} 件が落ちました`);
process.exitCode = failed === 0 ? 0 : 1;
