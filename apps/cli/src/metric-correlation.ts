/**
 * O-5: 選抜指標が「強さ」を測っているか「長く走ったこと」を測っているかの実測
 *
 *   npx tsx apps/cli/src/metric-correlation.ts
 *
 * ★監査が指摘したのは「`prize`（累計）は在籍年数を測ってしまう」という点。
 *   種牡馬プールには馬が**成熟年に入り、供用年数で抜ける**ので在籍年数がばらつく。
 *   累計賞金はその年数に比例して増えるため、**長く残った馬が強く見える**。
 *   ここでは在籍年数のばらつきを再現したうえで、各指標と
 *     (a) 真の能力合計   (b) 在籍年数
 *   の相関を測る。**(a) が高く (b) が低い指標が良い。**
 */

import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { resolveRuntimeConfig } from './config.js';
import { runSeason, selectionScore, type CareerRecord } from './racing-season.js';
import { sortPoolByClass } from './race-field.js';
import { runSimulation } from './simulator.js';
import { correlation, round } from './stats.js';

function parseNumber(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const SEEDS = [42, 7, 2026];
const YEARS = parseNumber('--years', 8);

const METRICS = ['prize', 'prizePerStart', 'winRate', 'composite'] as const;

function abilityTotal(h: HorseRecord): number {
  return h.potential.sp + h.potential.st + h.potential.pw + h.potential.gt + h.potential.iq;
}

const rows: { seed: number; metric: string; rAbility: number; rTenure: number }[] = [];

for (const seed of SEEDS) {
  const { balance, founders } = resolveRuntimeConfig();
  const sim = runSimulation(
    {
      seed,
      generations: 12,
      population: 300,
      stallionPool: 90,
      v1Pairs: 1,
      v1Repeats: 5,
      retainFinalPopulation: true,
    },
    balance,
    founders,
    NICKS_GEN,
  );
  const pool = sortPoolByClass(sim.finalPopulation ?? []);
  if (pool.length < 40) throw new Error('母集団が小さすぎる');

  // ★在籍年数を散らす: 各馬に「参加開始年」を割り当て、それ以降の年だけ走らせる。
  //   実際の種牡馬プールと同じで、成熟年に入り供用年数で抜ける＝在籍年数がばらつく。
  const rng = deriveRng(seed, 77);
  const startYear = new Map<string, number>();
  for (const h of pool) startYear.set(h.id, rng.int(0, YEARS - 1));

  const careers = new Map<string, CareerRecord>();
  for (let year = 0; year < YEARS; year++) {
    const active = pool.filter((h) => (startYear.get(h.id) ?? 0) <= year);
    if (active.length < 8) continue;
    runSeason(active, careers, deriveRng(seed, 78, year), 4);
  }

  const ids = pool.filter((h) => (careers.get(h.id)?.starts ?? 0) > 0);
  const ability = ids.map(abilityTotal);
  const tenure = ids.map((h) => YEARS - (startYear.get(h.id) ?? 0));

  for (const metric of METRICS) {
    const scores = ids.map((h) => selectionScore(careers.get(h.id), metric));
    rows.push({
      seed,
      metric,
      rAbility: correlation(scores, ability),
      rTenure: correlation(scores, tenure),
    });
  }
}

console.log(`${YEARS}シーズン / シード=${SEEDS.join(',')} / 在籍年数をランダムに散らして測定`);
console.log('');
console.log('★良い指標 = 能力との相関が高く、在籍年数との相関が低い');
console.log('');
console.log(`${'指標'.padEnd(16)} ${'r(指標, 能力合計)'.padStart(20)} ${'r(指標, 在籍年数)'.padStart(20)}`);
console.log('-'.repeat(60));
for (const metric of METRICS) {
  const mine = rows.filter((r) => r.metric === metric);
  const a = mine.reduce((s, r) => s + r.rAbility, 0) / mine.length;
  const t = mine.reduce((s, r) => s + r.rTenure, 0) / mine.length;
  const flag = Math.abs(t) > 0.2 ? '  ← 在籍年数を測っている' : '';
  console.log(
    `${metric.padEnd(16)} ${String(round(a, 3)).padStart(20)} ${String(round(t, 3)).padStart(20)}${flag}`,
  );
}
console.log('');
console.log('（シードごとの内訳）');
for (const r of rows) {
  console.log(
    `  seed=${String(r.seed).padStart(5)} ${r.metric.padEnd(14)} 能力 ${String(round(r.rAbility, 3)).padStart(7)} / 在籍 ${String(round(r.rTenure, 3)).padStart(7)}`,
  );
}
