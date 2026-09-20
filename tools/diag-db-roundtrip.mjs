/**
 * ★**DB の 1 往復にかかる時間を測る**（★2026-09-20・決め C の外挿を実測に変えるため）
 *
 * 【★なぜ要るか】
 *   ★世界の作り直し（`seed-world.mjs` の追いつき）は ★**`update` を 248,328 回**出します。
 *   ✔ ★CPU は測りました（`tools/measure-catchup-cost.mjs`）: ★**約 2 秒**。★問題ではありません。
 *   → ★★**所要を決めるのは往復の回数と、★1 往復の時間**です。
 *   ⚠️ ★そこを ★**仮定で置いたまま**にしていました（★0.5〜5 ms で 2.1〜20.7 分と幅がある）。
 *   🔴 ★**配備の日に「20 分 かかる」と知るのでは遅い**（★レビュー側の指摘・2026-09-20）。
 *
 * 【🔴 ★読むだけ】
 *   ★`select 1` しか投げません。★**行を 1 つも作らず、変えず、消しません。**
 *   ★本番に向けても安全です（★`--env production` で接続先が出ます）。
 *
 * 【⚠️ ★測っているものの正体】
 *   ★`select 1` の往復は ★**いちばん軽い往復**です。★実際の `update` は
 *   ★索引の更新と WAL の書き込みを伴うので ★**これより遅くなります**。
 *   → ★★**ここで出る数は「下限」です。** ★「これで終わる」と読まないでください（★**R-28**）。
 *
 * 実行: npx tsx tools/diag-db-roundtrip.mjs --env staging [--n 200]
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const argNum = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const N = argNum('n', 200);
/** ★世界の作り直しで出る `update` の回数（`measure-catchup-cost.mjs` の算術） */
const CATCHUP_UPDATES = 248328;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('# DB の 1 往復（★`select 1` だけ・★読むだけ）');
console.log('');

// ★最初の数回は接続の温まりが乗るので捨てる
for (let i = 0; i < 10; i += 1) await c.query('select 1');

const samples = [];
for (let i = 0; i < N; i += 1) {
  const t = process.hrtime.bigint();
  await c.query('select 1');
  samples.push(Number(process.hrtime.bigint() - t) / 1e6);
}
samples.sort((a, b) => a - b);
const pick = (q) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

console.log(`  標本 ${N} 回（★温まりの 10 回は捨てた）`);
console.log(`  中央 ${pick(0.5).toFixed(2)} ms  平均 ${mean.toFixed(2)} ms`);
console.log(`  p90 ${pick(0.9).toFixed(2)} ms  p99 ${pick(0.99).toFixed(2)} ms`);
console.log(`  最小 ${samples[0].toFixed(2)} ms  最大 ${samples[samples.length - 1].toFixed(2)} ms`);
console.log('');
console.log('【★世界の作り直しへの当てはめ】');
console.log(`  ★\`update\` ${CATCHUP_UPDATES.toLocaleString()} 回 × 中央 ${pick(0.5).toFixed(2)} ms`);
console.log(`    = ★**${((CATCHUP_UPDATES * pick(0.5)) / 1000 / 60).toFixed(1)} 分**`);
console.log(`  ★p90 で見ると … ${((CATCHUP_UPDATES * pick(0.9)) / 1000 / 60).toFixed(1)} 分`);
console.log('');
console.log('  🔴 ★**これは下限です**（★**R-28**）:');
console.log('    ★① `select 1` は ★**いちばん軽い往復**。★`update` は索引と WAL のぶん遅い');
console.log('    ★② ここは開発機からの測定。★ワーカーは VPS から繋ぐので経路が違う');
console.log('    ★③ 実際の追いつきは `select`（★バッチごと）も挟む');

await c.end();
