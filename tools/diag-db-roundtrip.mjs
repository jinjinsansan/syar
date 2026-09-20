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

/**
 * ★**並べたら速くなるか**（★`--parallel`・2026-09-20）
 *
 * 【★なぜ `advanceTrainingWeeks` そのもので測らないか】
 *   🔴 ★あれは ★**DB に書きます**。★本番にも staging にも書かないと決めているので、★流せません。
 *   → ★**書かずに測れる部分だけ**を測ります: ★**往復が並列で縮むか**。
 *
 * 【⚠️ ★これが答えていること／いないこと】
 *   ✅ ★答える: ★**往復（＝ 所要の 99%）は、★接続を並べると縮むか**
 *   🔴 ★答えない: ★`update` の競合・索引の更新・WAL・接続数の上限・DB 側の CPU。
 *     ★**実物はこれより悪くなります。** ★上限の見積もりとしてだけ使ってください。
 */
if (process.argv.includes('--parallel')) {
  const M = argNum('per-conn', 30);
  console.log('');
  console.log('【★並べたら縮むか】★`select 1` だけ・★書きません');
  console.log(`  ★1 接続あたり ${M} 回。★接続数を変えて、★同じ総数にかかる時間を比べます`);
  const run = async (conns) => {
    const clients = [];
    for (let i = 0; i < conns; i += 1) {
      const cc = new pg.Client({
        connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false },
      });
      await cc.connect();
      await cc.query('select 1'); // ★温め
      clients.push(cc);
    }
    const t = process.hrtime.bigint();
    await Promise.all(clients.map(async (cc) => {
      for (let i = 0; i < M; i += 1) await cc.query('select 1');
    }));
    const sec = Number(process.hrtime.bigint() - t) / 1e9;
    await Promise.all(clients.map((cc) => cc.end()));
    return sec;
  };
  const base = await run(1);
  console.log(`  ★接続 1 本 … ${(base * 1000 / M).toFixed(1)} ms/文（${base.toFixed(2)} 秒で ${M} 文）`);
  for (const k of [4, 8]) {
    const sec = await run(k);
    const perStmt = (sec * 1000) / (M * k);
    console.log(`  ★接続 ${k} 本 … ${perStmt.toFixed(1)} ms/文`
      + `（${sec.toFixed(2)} 秒で ${M * k} 文）→ ★**${(base * 1000 / M / perStmt).toFixed(1)} 倍**`);
  }
  console.log('');
  console.log('  ⚠️ 🔴 ★**`update` ではありません。** ★競合も WAL も入っていません。');
  console.log('     ★実物はこれより悪くなります。★**上限の見積もり**としてだけ使うこと。');
}

await c.end();
