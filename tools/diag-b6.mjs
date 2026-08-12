/**
 * ★B-6 の診断: **オッズを作った馬と、実際に走る馬が同じか**（判定を出さない）
 *
 * 【なぜ要るか】
 *   `docs/B6_WIRING_PLAN.md` にこう書きました:
 *
 *     > ★MC と本番確定は同じ `entrants` を使うので、乖離は構造上起きません。
 *
 *   **これは誤りでした。** 出走馬は**2か所で別々に組み立てられています**:
 *
 *     ① 生成時（出走表・オッズ）: `apps/cli/src/race-field.ts` の `toEntrant`
 *          能力    = potential × rng.range(0.55, 0.85)   ← ★レースごとに再抽選
 *          condition = rng.int(2, 4)
 *          fatigue   = 0
 *     ② 確定時（着順）: `apps/worker/src/pg-store.ts` の settleRace
 *          能力    = horses.stats（DB の列 = potential × その馬の unlock_rate）
 *          condition = 3
 *          fatigue   = 0
 *
 *   ★①は**馬ごとの `unlock_rate` を見ていません**。同じ馬でも、
 *     オッズを計算した能力と、実際に走る能力が違います。
 *
 * 【★この道具は数字を並べるだけです】
 *   直す前に、**どれだけ違うのか**を実データで出します。
 *   「違うはずだ」ではなく「これだけ違う」を先に置きます。
 *
 * 実行: npx tsx tools/diag-b6.mjs --env staging
 */
import pg from 'pg';
import { deriveRng } from '../packages/sim-engine/src/index.ts';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.ts';
import { loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const pool = sortPoolByClass(await loadRaceablePool(c));
const states = await loadTrainingStates(c);
console.log(`# B-6 診断: オッズを作った馬と、実際に走る馬が同じか`);
console.log(`  母集団 ${pool.length} 頭（ワーカーと同じ取り方）`);
console.log('');

const RACES = 20;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

const ratios = [];
const absDiff = [];
let entrants = 0;
for (let i = 0; i < RACES; i += 1) {
  // ★本番と同じ呼び方にする（Q-P3-35 で投入した abilityOf を通す）
  const race = generateRace(pool, i, deriveRng(4242, 61, i), undefined, undefined, undefined,
    { abilityOf: (h) => h.stats });
  for (const e of race.entrants) {
    const horse = pool.find((h) => h.id === e.horseId);
    if (horse === undefined) continue;
    entrants += 1;
    // ★SP を代表にして比べる（全能力に同じ率が掛かる作り）
    const generated = e.stats.sp;
    const actual = horse.stats.sp;
    if (actual > 0) {
      ratios.push(generated / actual);
      absDiff.push(Math.abs(generated - actual) / actual);
    }
  }
}

console.log('【① 能力（SP）】オッズ計算時 ÷ 確定時');
console.log(`  出走馬 ${entrants} 頭ぶん（${RACES} レース）`);
console.log(`  比の平均 ${mean(ratios).toFixed(4)}  SD ${sd(ratios).toFixed(4)}`);
console.log(`  比の範囲 ${Math.min(...ratios).toFixed(3)} 〜 ${Math.max(...ratios).toFixed(3)}`);
console.log(`  ★ずれの平均（絶対値）: ${(mean(absDiff) * 100).toFixed(1)}%`);
const within1 = ratios.filter((r) => Math.abs(r - 1) < 0.01).length;
console.log(`  ★比が 1.00 ±1% に入る馬: ${within1} / ${ratios.length} 頭`);
console.log('');
console.log('  ★1.00 でなければ、**オッズを計算した馬と実際に走る馬の能力が違います**');
console.log('    （§9.2 のオッズはサーバー権威で、プレイヤーはこれを見て買います）');
console.log('');

console.log('【② 調子・疲労】★馬ごとに突き合わせる');
/**
 * ★**同じ馬どうし**で比べます。
 *
 * 【なぜ直したか】
 *   最初、「生成時の平均」と「DB 全馬の平均」を並べて出していました。
 *   生成時は**出走した254頭**、DB は**全7,370頭**で、**母集団が違います**。
 *   実測: 全馬 65.88 / 出走可能な母集団(3,000頭) 65.39 / 出走した254頭 66.38。
 *   ★能力比は per-horse なので 1.0000 と出るのに、調子・疲労だけ差が出て見えました。
 *   **量が違うものを並べていただけ**で、実装の差ではありません。
 */
const condDiff = [];
const fatDiff = [];
let noState = 0;
for (let i = 0; i < RACES; i += 1) {
  const race = generateRace(pool, i, deriveRng(4243, 61, i), undefined, undefined, undefined,
    { abilityOf: (h) => h.stats, trainingStateOf: (h) => states.get(h.id) });
  for (const e of race.entrants) {
    const st = states.get(e.horseId);
    if (st === undefined) { noState += 1; continue; }
    condDiff.push(e.condition - st.condition);
    fatDiff.push(e.fatigue - st.fatigue);
  }
}
const within = (a) => a.filter((x) => Math.abs(x) < 1e-9).length;
console.log(`  突き合わせ ${condDiff.length} 頭（育成状態が無い馬 ${noState} 頭は除外）`);
console.log(`  調子: 生成時 − DB の差が 0 の馬 ${within(condDiff)}/${condDiff.length}  最大差 ${Math.max(0, ...condDiff.map(Math.abs)).toFixed(4)}`);
console.log(`  疲労: 生成時 − DB の差が 0 の馬 ${within(fatDiff)}/${fatDiff.length}  最大差 ${Math.max(0, ...fatDiff.map(Math.abs)).toFixed(4)}`);
console.log('  ★1頭でも差があれば、生成側が DB を見ていないということです。');
console.log('  確定時: 同じ列を読んでいる（pg-store.settleRace が horses.condition / fatigue を読む）');
console.log('');
console.log('  ★生成側も確定側も 0010 の列を見ています（Q-P3-35 で投入）');

const dbState = await c.query(
  `select count(*)::int n,
          avg(condition)::float ac, stddev_samp(condition)::float sc,
          avg(fatigue)::float af, stddev_samp(fatigue)::float sf
     from horses where last_processed_week is not null`,
);
const d = dbState.rows[0];
console.log(`  DB の実データ: ${d.n} 頭  調子 平均 ${d.ac === null ? '—' : d.ac.toFixed(2)} / 疲労 平均 ${d.af === null ? '—' : d.af.toFixed(2)}`);
if (d.n === 0) {
  console.log('  ★まだ週送りを通した馬がいません（B-1 の1頭のみ）。実データで測るには週送りが要ります');
}

await c.end();
