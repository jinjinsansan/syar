/**
 * ★staging に「発売中のレース」を作る（検証ツールの前提を揃えるため）
 *
 * 【なぜ要るか】
 *   `verify-prize` / `verify-cancel` / `verify-economy` と G-7 の実証は、
 *   **発売中のレースが1本も無いと動きません**。staging には0本でした。
 *   `runCycle` は「2レース先まで」しか作らない（§10.2）ので、
 *   検証に必要な本数を一度に揃えられません。
 *
 * 【★ワーカーと同じ物を使う】
 *   `classOf` / `gradeOf` / `conditionsOf` / `purseOf` / `cycleStartMs` /
 *   `PHASE_OFFSET_MS` / `store.createRace` / `buildRace` —— **すべて本番と同じ関数**です。
 *   ★ここで番組や賞金額を組み直すと、「検証用のレース」と「本番のレース」が
 *     別物になります。**再実装しているのは `runCycle` の手順3の繰り返し方だけ**です。
 *
 * 【★オッズの試行数を下げないこと】
 *   `--trials` で下げられますが、**下げると売られる買い目の数が変わります**
 *   （実測: 1万試行 1,143点 / 10万試行 1,478点。低確率の組み合わせは
 *   試行が足りないと一度も当たらず、D-035 の `p_min` で売られません）。
 *   ★既定は本番と同じ 3,896,104 試行。1本あたり約80〜96秒かかります。
 *
 * 【★このレースには既知の乖離があります（Q-P3-29）】
 *   オッズは `potential × PLACEHOLDER_UNLOCK` で計算され、着順は `horses.stats` で
 *   決まります（実測 2.28倍の差）。**オッズの妥当性を主張する検証には使えません。**
 *   賞金の発行（G-7）・返還（A-6）・台帳の整合は、着順とクラスだけで決まるので影響を受けません。
 *
 * 実行: npx tsx tools/seed-races.mjs --env staging --races 4
 */
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import {
  PHASE_OFFSET_MS, classOf, conditionsOf, cycleIndexAt, cycleStartMs,
  gradeOf, prizeTierOf, purseOf,
} from '../packages/scheduler/src/index.ts';
import { buildRace } from '../apps/worker/src/build-race.ts';
import { ODDS_MC_TRIALS } from '../apps/worker/src/odds.ts';
import { loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { seedCommitFor, serverSeedFor } from '../apps/worker/src/seeding.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const RACES = Number(arg('races', '4'));
const TRIALS = Number(arg('trials', String(ODDS_MC_TRIALS)));
/**
 * ★何サイクル先から作るか。
 *
 * 【なぜ要るか】
 *   既定の 2 で作ったら、**検証している間にレースが発走時刻を過ぎました**。
 *   1本の生成に 236〜976秒（頭数で4倍以上ばらつく）かかるのに、
 *   サイクルは10分間隔です。**生成のほうがサイクルより遅い**ので、
 *   2つ先に作ると出来上がった時にはもう買えません。
 *   → 先のサイクルに作れば、その分だけ発売期間が伸びます。
 */
const AHEAD = Number(arg('ahead', '2'));
if (!Number.isFinite(RACES) || RACES < 1) throw new Error('--races は1以上の数です');

const env = loadEnv();
if (!env.STAR_EPOCH_ISO) throw new Error('STAR_EPOCH_ISO が未設定です');
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
if (!Number.isFinite(EPOCH)) throw new Error(`STAR_EPOCH_ISO を時刻として読めません`);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'seed-races.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const store = createPgStore(c, hash);

/**
 * ★シードの秘密。ワーカーは `STAR_SEED_SECRET`（無ければ起動ごとの乱数）を使います。
 *   ここでは **staging の env にある値を使い、無ければ固定値**にします。
 *   ★乱数にしません。流し直したときに同じレースにならないと、
 *     「同じ入力で同じ結果」の確認ができなくなります（憲法④）。
 */
const SEED_SECRET = env.STAR_SEED_SECRET ?? 'seed-races-staging-fixed';

// ★ゲーム内時刻の真実は Postgres の now()（§14）。ローカル時計を使わない
const nowMs = Number((await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms);
const current = cycleIndexAt(nowMs, EPOCH);

const pool = await loadRaceablePool(c);
const states = await loadTrainingStates(c);

console.log(`# staging に発売中のレースを作る`);
console.log(`  母集団 ${pool.length} 頭 / 育成状態のある馬 ${states.size} 頭`);
console.log(`  いまのサイクル ${current} / ${AHEAD} 先から / 試行数 ${TRIALS.toLocaleString()}${TRIALS === ODDS_MC_TRIALS ? '（本番と同じ）' : '  ★本番と違います。売られる買い目の数が変わります'}`);
console.log('');

let made = 0;
for (let k = 0; k < RACES; k += 1) {
  // ★AHEAD 先から順に作る（いま発走中のものを上書きしない）
  const idx = current + AHEAD + k;
  if (await store.raceExists(idx)) {
    console.log(`  cycle ${idx} ... 既にあります`);
    continue;
  }
  const t0 = process.hrtime.bigint();
  const raceClass = classOf(idx);
  const grade = gradeOf(idx);
  /**
   * ★ワーカーと同じ呼び方にする（Q-P3-32）。
   *   番組表を渡さないと `generateRace` が自分で距離・馬場を引くので、
   *   **本番と違うレースが staging に積まれます**。
   *   条件は `buildRace` の返り値ひとつから取ります（出所を1つに）。
   */
  const programme = conditionsOf(idx, raceClass, grade);
  const built = buildRace(pool, idx, EPOCH, TRIALS, states, programme);
  await store.createRace({
    cycleIndex: idx,
    raceClass,
    grade,
    scheduledAtMs: cycleStartMs(idx, EPOCH) + PHASE_OFFSET_MS.start,
    conditions: built.conditions,
    entrants: built.entrants,
    odds: built.odds,
    purse: purseOf(prizeTierOf(raceClass, grade)),
    seedCommit: seedCommitFor(SEED_SECRET, idx, hash),
    serverSeed: serverSeedFor(SEED_SECRET, idx, hash),
  });
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  const at = new Date(cycleStartMs(idx, EPOCH) + PHASE_OFFSET_MS.start).toISOString();
  console.log(`  cycle ${idx} ... 作成（${raceClass}${grade ? '/' + grade : ''} 発走 ${at.slice(11, 19)}Z / ${sec.toFixed(0)}秒）`);
  made += 1;
}

const chk = await c.query(
  `select status, count(*)::int n from races group by 1 order by 1`,
);
console.log('');
console.log(`  作成 ${made} 本 / DB: ${chk.rows.map((r) => `${r.status}=${r.n}`).join(' ')}`);
const sale = await c.query(
  `select count(*)::int n from races where status = 'scheduled' and scheduled_at > now()`,
);
console.log(`  ★これから発走する発売中のレース: ${sale.rows[0].n} 本`);
if (sale.rows[0].n === 0) {
  console.log('  ★0本です。検証ツールは前提が揃わず exit 2 になります');
}
await c.end();
