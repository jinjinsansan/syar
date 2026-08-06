/**
 * A-3 切り分け: オッズ算出系列と本番確定系列が**同じ分布**を生んでいるか。
 *
 * §9.2 は両者の独立を要求するが、**独立は同分布であることを意味しない**。
 * 単勝の払戻率 +22pt は凸性（MC=8000 で約 0.15%）でも被覆漏れ（未発売的中0）でも
 * 説明できないので、分布そのものを疑う。
 *
 * 方式A（MC で使っている引き方）: 1本の派生ストリームから nextUint32() を連続で引く
 * 方式B（確定で使っている引き方）: レース番号ごとに派生させ、その**最初の1個**を引く
 *
 * 同じレースを両方式で多数回解決し、勝者の分布を比べる。
 * ★一致すればハーネスの別の場所が原因、ずれれば引き方そのものが原因。
 */
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

const SEED = 42;
const DRAWS = 20_000;

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5,
    retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const race = generateRace(pool, 0, deriveRng(SEED, 2, 0));
const entrants: RaceEntrant[] = race.entrants.map((e, i) => ({ ...e, horseId: `H${i + 1}` }));

const winner = (raceSeed: number): number => {
  const r = resolveRace({ conditions: race.conditions, entrants, seed: raceSeed, balance: DEFAULT_RACE_BALANCE });
  return Number(r.order[0]!.horseId.replace(/^H/, ''));
};

// 方式A: 1本のストリームから連続で
const a = new Map<number, number>();
const rngA = deriveRng(SEED, 3, 0);
for (let i = 0; i < DRAWS; i += 1) {
  const w = winner(rngA.nextUint32());
  a.set(w, (a.get(w) ?? 0) + 1);
}

// 方式B: レース番号ごとに派生し、最初の1個だけ
const b = new Map<number, number>();
for (let i = 0; i < DRAWS; i += 1) {
  const w = winner(deriveRng(SEED, 4, i).nextUint32());
  b.set(w, (b.get(w) ?? 0) + 1);
}

console.log(`# 系列の分布比較  entrants=${entrants.length} draws=${DRAWS} seed=${SEED}`);
console.log(`  馬番   方式A(連続)   方式B(毎回派生)     差`);
let chi2 = 0;
for (let h = 1; h <= entrants.length; h += 1) {
  const ca = a.get(h) ?? 0;
  const cb = b.get(h) ?? 0;
  const exp = (ca + cb) / 2;
  if (exp > 0) chi2 += ((ca - exp) ** 2 + (cb - exp) ** 2) / exp;
  console.log(
    `  ${String(h).padStart(4)} ${((ca / DRAWS) * 100).toFixed(2).padStart(10)}% ` +
      `${((cb / DRAWS) * 100).toFixed(2).padStart(13)}% ${(((cb - ca) / DRAWS) * 100).toFixed(2).padStart(8)}pt`,
  );
}
// 自由度 = 頭数-1。両方式が同分布なら chi2 はこの程度に収まる
console.log(`\n  χ² = ${chi2.toFixed(1)}  自由度 ${entrants.length - 1}`);
console.log(`  ★χ² が自由度の2〜3倍を大きく超えるなら、引き方そのものが分布を変えている`);
