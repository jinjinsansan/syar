/**
 * ★VPS での周時間の実測（最悪 18頭立て）— レビュー側指定
 *
 * 【なぜ専用ツールが要るか】
 *   ワーカーは周ごとの所要時間をログに出すようにしました（`周=…s(…%)`）。
 *   それが「実際に使われている経路の証拠」として最良です。
 *   ★ただし **18頭立ての出現率は約9%** で、生成は1周に1本しかありません。
 *   狙って観測すると数時間かかるので、**同じ `buildRace` を 18頭に固定して**測ります。
 *
 * 【★measure するものを取り違えないこと】
 *   ここで測るのは **`buildRace`（出走表＋オッズのモンテカルロ）** です。
 *   周の所要時間の大半はこれですが、**周そのものではありません**。
 *   確定・DB 書き込み・日次集計・週送りは含みません。
 *   → だから**ワーカー自身の `周=` ログのほうが上位の証拠**で、本ツールはその内訳です。
 *
 * 【★18頭であることを推測で決めない】
 *   頭数を「探す」ために軽い試行をしますが、**報告するのは
 *   `buildRace` が実際に返した `entrants.length`** です。
 *   探索側と本番側がずれていても、ずれたまま「18頭でした」とは書きません。
 *
 * 【★状態を変えません（R-24）】
 *   発行するのは `loadRaceablePool` / `loadTrainingStates` の **select だけ**です。
 *   書き込みが無いので本番に向けても安全で、`assertNotProduction` を入れていません。
 *   ⚠️ 本ツールに書き込みを足すなら、**同時に `assertNotProduction` を入れること。**
 *
 * 実行: npx tsx tools/measure-cycle-time.mjs [--env production] [--samples 5]
 */
import pg from 'pg';
import { deriveRng } from '@star/sim-engine';
import { classOf, conditionsOf, gradeOf } from '@star/scheduler';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.ts';
import { buildRace } from '../apps/worker/src/build-race.ts';
import { loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { ODDS_MC_TRIALS } from '../apps/worker/src/odds.ts';
import { loadEnv } from './lib/env.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const SAMPLES = arg('--samples', 5);
/** ★正典 §10.4 の上限。ここを変えるなら FIELD_SIZE も見ること */
const WORST_FIELD = 18;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('# VPS 周時間の実測（★最悪 18頭立て）');
console.log('');

const pool = await loadRaceablePool(c);
const trainingStates = await loadTrainingStates(c);
/**
 * ★ワーカーと同じ epochMs を使う（`apps/worker/src/env.ts` と同じ読み方）。
 *   seed が変われば**頭数の出方も変わる**ので、ここがずれたら別物を測ることになります。
 */
const epochMs = Date.parse(process.env['STAR_EPOCH_ISO'] ?? '');
if (!Number.isFinite(epochMs)) {
  console.error('★STAR_EPOCH_ISO が要ります（ワーカーと同じ値でないと頭数が変わります）');
  console.error('  VPS: set -a; . /etc/star/worker.env; set +a');
  await c.end();
  process.exit(2);
}
console.log(`  出走可能 ${pool.length} 頭 / 調教状態 ${trainingStates.size} 頭 / epoch ${epochMs}`);
console.log(`  オッズ試行 ${ODDS_MC_TRIALS.toLocaleString()} 回（★本番と同じ）`);
console.log('');

// ── 18頭立てになる cycle を探す（★軽い試行。判定には使わない）──────────
const sorted = sortPoolByClass(pool);
const probe = (i) =>
  generateRace(sorted, i, deriveRng(epochMs, 61, i), undefined, undefined, undefined, {
    abilityOf: (h) => h.stats,
    trainingStateOf: (h) => trainingStates.get(h.id),
    programme: conditionsOf(i, classOf(i), gradeOf(i)),
  }).entrants.length;

const candidates = [];
for (let i = 1; candidates.length < SAMPLES && i < 200000; i += 1) {
  if (probe(i) === WORST_FIELD) candidates.push(i);
}
if (candidates.length === 0) {
  console.error(`★${WORST_FIELD}頭立てになる cycle が見つかりません。頭数分布を疑ってください`);
  await c.end();
  process.exit(2);
}
console.log(`  ${WORST_FIELD}頭立ての cycle: ${candidates.join(', ')}`);
console.log('');

// ── 本番と同じ呼び方で `buildRace` を測る ────────────────────────
console.log('【実測】★報告するのは buildRace が実際に返した頭数です');
const times = [];
for (const i of candidates) {
  const t0 = process.hrtime.bigint();
  const built = buildRace(pool, i, epochMs, undefined, trainingStates,
    conditionsOf(i, classOf(i), gradeOf(i)));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const n = built.entrants.length;
  times.push({ i, ms, n });
  console.log(`  cycle=${i}  ${n}頭  ${(ms / 1000).toFixed(2)}s  オッズ ${built.odds.length} 行`);
}

// ★探索と実物がずれていたら、ずれたまま「18頭」と書かない
const wrong = times.filter((t) => t.n !== WORST_FIELD);
console.log('');
if (wrong.length > 0) {
  console.error(`★探索は${WORST_FIELD}頭と判定したのに buildRace は違う頭数を返しました: ` +
    `${wrong.map((t) => `cycle=${t.i} ${t.n}頭`).join(' / ')}`);
  console.error('  → 経路がずれています。この測定を根拠にしないでください');
  await c.end();
  process.exit(1);
}

const ms = times.map((t) => t.ms);
const max = Math.max(...ms);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
/** ★A-1: 発売は10分周（正典 §10.1）。生成が周を食い潰したら発売時間が削れます */
const CYCLE_MS = 10 * 60 * 1000;
console.log('【判定】');
console.log(`  ${WORST_FIELD}頭立ての buildRace: 平均 ${(mean / 1000).toFixed(2)}s / 最大 ${(max / 1000).toFixed(2)}s`);
console.log(`  10分周に占める割合: 最大 ${((max / CYCLE_MS) * 100).toFixed(1)}%`);
console.log('');
console.log('  ★これは buildRace 単体です。周全体は確定・DB 書き込み・週送りを含みます。');
console.log('    周全体はワーカーの `周=…s(…%)` ログを見てください。');

await c.end();
