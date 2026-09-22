/**
 * ★**案 B の模擬: 調教を 0 週から始めたら何が動くか**（★PLAN Q-1・`QUESTIONS_FOAL_LIFECYCLE_20260922.md` §2）。
 *
 * 【★何を比べるか】
 *   ★同じ母集団・同じ週送り（`runCareer`・V-14 と同じ経路）で、★**調教を始める週齢だけ**を変えます。
 *   ★既定は 78（★今の規則 ＝ 案 A）と 0（★案 B）。★`--starts 78,52,26,0` で間も見られます。
 *   ★出すもの:
 *     ① ★V-14 の 3 つ（★適切な育成の開放率・★放置との差・★同一 EP での追い切りの比）
 *     ② ★**キャリア後半の伸び**（★D-044: 引退前の 78 週で伸びた分。★週齢で同じ窓を比べる）
 *     ③ ★1 頭あたりの EP（★§3.4 の収支・★調教費は EP の最大の消費先）
 *
 * 【⚠️ ★この模擬が置く仮定（★結果を読む前に）】
 *   B-1 ★**104 週未満の成長の係数は 104 週の値**のまま（`growthCoef` が外挿しない・`growth.ts:95`）。
 *       ★0〜78 週に何を掛けるかは ★**決まっていません**（照会 §2 の「78 週の間の成長曲線」）。
 *       → ★ここで出る数は ★**「今の曲線を前へ平らに延ばした」ときの値**です。★曲線を決めたら測り直します。
 *   B-2 ★出走・引退の週齢は変えません（★104・260）。★育成方針（`chooseMenu`）も同じです。
 *   B-3 ★乱数は `deriveRng(seed, stream, 馬 × 1000 + 週)`（★V-14 と同じ）。★78 週以降の鍵は A と B で同じです。
 *
 * ★規則は変えません。★読むだけの模擬です（★DB に繋ぎません）。
 *
 * 実行: npx tsx apps/cli/src/lifecycle-b-sim.ts --horses 400 --seed 42 [--starts 78,0]
 */
import { ABILITY_KEYS, NICKS_GEN, type AbilityKey } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { runCareer, type CareerResult, type Policy } from './training-career.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const HORSES = num('horses', 400);
const STARTS: number[] = (() => {
  const i = argv.indexOf('--starts');
  const raw = i >= 0 ? String(argv[i + 1]) : `${LIFECYCLE_WEEKS.trainableFrom},0`;
  return raw.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < LIFECYCLE_WEEKS.retireAt);
})();
const JSON_OUT = argv.includes('--json');

/**
 * ★**キャリア後半の窓**（★D-044: 「調教 104 週で上限に張り付くと、★キャリア後半 78 週の伸びが 0.00」）。
 *   ★今の規則で調教を始める週齢 ＋ 104 週 ＝ ★182 週齢から ★引退（260）まで。
 *   ★案 B でも ★**同じ週齢の窓**を見ます（★窓を開始週に合わせて動かすと、比べるものが変わる）。
 */
const LATE_FROM = LIFECYCLE_WEEKS.trainableFrom + 104;

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true,
  },
  balance, founders, NICKS_GEN,
);
const pool = (sim.finalPopulation ?? []).slice(0, HORSES);
if (pool.length === 0) throw new Error('母集団が空です');

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const se = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length);
};

interface Row { readonly result: CareerResult; readonly late: number }

/** ★1 頭を通し、★後半の窓で伸びた分（★素質に対する % の平均）を添える */
function run(horseIndex: number, policy: Policy, start: number): Row {
  const horse = pool[horseIndex]!;
  let atLate: Record<AbilityKey, number> | null = null;
  const result = runCareer(horse, policy, horseIndex, SEED, (week, stats) => {
    // ★`onWeek` は ★その週が済んだ後の値。★LATE_FROM 週の始めの値 ＝ LATE_FROM − 1 週が済んだ値
    if (week === LATE_FROM - 1) atLate = { ...stats } as Record<AbilityKey, number>;
  }, start);
  let late = 0;
  const base = atLate as Record<AbilityKey, number> | null;
  if (base !== null && result.retireWeek >= LIFECYCLE_WEEKS.retireAt) {
    for (const k of ABILITY_KEYS) {
      late += result.potential[k] > 0 ? (result.stats[k] - base[k]) / result.potential[k] : 0;
    }
    late = (late / ABILITY_KEYS.length) * 100;
  } else {
    late = Number.NaN;
  }
  return { result, late };
}

const POLICIES: readonly Policy[] = ['neglect', 'balanced', 'hard_only'];
const out: Record<string, unknown>[] = [];

console.log(`# 案 B の模擬 — 調教を始める週齢だけを変える  seed=${SEED} horses=${pool.length}`);
console.log(`  ⚠️ 仮定 B-1: 104 週未満の成長の係数は 104 週の値のまま（★曲線は未決定）`);
console.log(`  ★キャリア後半の窓: ${LATE_FROM}〜${LIFECYCLE_WEEKS.retireAt} 週齢（★D-044・A と B で同じ窓）`);
console.log('');

for (const start of STARTS) {
  const byPolicy = Object.fromEntries(POLICIES.map((p) => [p, pool.map((_, i) => run(i, p, start))])) as
    Record<Policy, Row[]>;
  const unlock = (p: Policy): number[] => byPolicy[p].map((r) => r.result.unlock * 100);
  const ep = (p: Policy): number[] => byPolicy[p].map((r) => r.result.epSpent);
  const lateOf = (p: Policy): number[] => byPolicy[p].map((r) => r.late).filter((v) => Number.isFinite(v));
  const bal = mean(unlock('balanced'));
  const neg = mean(unlock('neglect'));
  const gap = bal - neg;
  const gapSe = Math.sqrt(se(unlock('balanced')) ** 2 + se(unlock('neglect')) ** 2);
  const perEp = (p: Policy): number => mean(unlock(p)) / mean(ep(p));
  const ratio = perEp('hard_only') / perEp('balanced');
  const row = {
    start,
    balanced: bal, balancedSe: se(unlock('balanced')),
    neglect: neg, gap, gapSe,
    hardOnly: mean(unlock('hard_only')), epRatio: ratio,
    epBalanced: mean(ep('balanced')), epNeglect: mean(ep('neglect')), epHard: mean(ep('hard_only')),
    lateBalanced: mean(lateOf('balanced')), lateBalancedSe: se(lateOf('balanced')),
    lateNeglect: mean(lateOf('neglect')),
    lateCountedBalanced: lateOf('balanced').length,
    injuriesBalanced: mean(byPolicy.balanced.map((r) => r.result.injuries)),
    careerEndedBalanced: byPolicy.balanced.filter((r) => r.result.careerEnded).length / pool.length,
  };
  out.push(row);
  console.log(`## 調教の開始 ${start} 週齢${start === LIFECYCLE_WEEKS.trainableFrom ? '（★今の規則・案 A）' : ''}`);
  console.log(`  ① V-14 ① 適切な育成 ${bal.toFixed(1)}% ±${row.balancedSe.toFixed(2)}（線 88%）`
    + `  ② 差 ${gap.toFixed(1)}pt ±${gapSe.toFixed(2)}（線 12pt・放置 ${neg.toFixed(1)}%）`
    + `  ③ 追い切りの EP あたりの比 ${ratio.toFixed(3)}（★線は verify-v14 の DOMINANCE_MARGIN_RATIO）`);
  console.log(`  ② キャリア後半の伸び（適切な育成）${row.lateBalanced.toFixed(2)}pt ±${row.lateBalancedSe.toFixed(2)}`
    + `（放置 ${row.lateNeglect.toFixed(2)}pt・寿命まで走った ${row.lateCountedBalanced} 頭）`);
  console.log(`  ③ EP/頭 適切な育成 ${Math.round(row.epBalanced).toLocaleString()}`
    + ` / 放置 ${Math.round(row.epNeglect).toLocaleString()} / 追い切り ${Math.round(row.epHard).toLocaleString()}`);
  console.log(`  参考: 故障/頭 ${row.injuriesBalanced.toFixed(2)} / 故障で引退 ${(row.careerEndedBalanced * 100).toFixed(1)}%`);
  console.log('');
}

if (JSON_OUT) console.log(JSON.stringify({ seed: SEED, horses: pool.length, lateFrom: LATE_FROM, rows: out }));
