/**
 * A-3: MC と本番確定が**裾で**同分布かを直接測る。
 * 前回の χ²（自由度9）は主要部に支配され裾を見ていなかった（R-22）。
 */
import { NICKS_GEN, deriveRng, VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const DRAWS = num('draws', 200_000);

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const race = generateRace(pool, 0, deriveRng(SEED, S.FIELD, 0));
const entrants: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));
const conditions = race.conditions;

const winner = (raceSeed: number): number =>
  Number(
    resolveRace({ conditions, entrants, seed: raceSeed, balance: DEFAULT_RACE_BALANCE })
      .order[0]!.horseId.replace(/^H/, ''),
  );

const countA = new Map<number, number>();
const rngA = deriveRng(SEED, S.ODDS, 0);
for (let i = 0; i < DRAWS; i += 1) {
  const w = winner(rngA.nextUint32());
  countA.set(w, (countA.get(w) ?? 0) + 1);
}
const countB = new Map<number, number>();
for (let i = 0; i < DRAWS; i += 1) {
  const w = winner(deriveRng(SEED, S.FINAL, i).nextUint32());
  countB.set(w, (countB.get(w) ?? 0) + 1);
}

// ★下位（勝率の低い順）だけを見る。上位に埋もれさせない
const rows = entrants.map((_, i) => {
  const h = i + 1;
  const a = countA.get(h) ?? 0;
  const b = countB.get(h) ?? 0;
  return { h, a, b, pa: a / DRAWS, pb: b / DRAWS };
}).sort((x, y) => x.pa - y.pa);

console.log(`# 裾の分布比較  draws=${DRAWS}（各方式） 頭数=${entrants.length} seed=${SEED}`);
console.log(`  ${'馬番'.padStart(5)} ${'A(MC式)'.padStart(10)} ${'B(確定式)'.padStart(11)} ${'B/A'.padStart(7)} ${'z'.padStart(7)}`);
let tailA = 0, tailB = 0;
for (const r of rows) {
  // 二項の SE で z を出す（両方式とも DRAWS 回）
  const p = (r.a + r.b) / (2 * DRAWS);
  const se = Math.sqrt(2 * p * (1 - p) / DRAWS);
  const z = se > 0 ? (r.pb - r.pa) / se : 0;
  const flag = r.pa < 0.02 ? ' ← 裾' : '';
  if (r.pa < 0.02) { tailA += r.a; tailB += r.b; }
  console.log(
    `  ${String(r.h).padStart(5)} ${(r.pa * 100).toFixed(3).padStart(9)}% ${(r.pb * 100).toFixed(3).padStart(10)}% ` +
      `${(r.a > 0 ? r.b / r.a : 0).toFixed(3).padStart(7)} ${z.toFixed(2).padStart(7)}${flag}`,
  );
}
const p = (tailA + tailB) / (2 * DRAWS);
const se = Math.sqrt(2 * p * (1 - p) / DRAWS);
console.log(
  `\n  ★裾（A<2%）合計: A ${((tailA / DRAWS) * 100).toFixed(3)}%  B ${((tailB / DRAWS) * 100).toFixed(3)}%  ` +
    `B/A ${(tailA > 0 ? tailB / tailA : 0).toFixed(3)}  z=${se > 0 ? ((tailB - tailA) / DRAWS / se).toFixed(2) : '-'}`,
);
