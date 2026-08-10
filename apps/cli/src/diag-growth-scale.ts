/**
 * ★成長式を実装する前に、桁が合うかを解析で確かめる（P3 指示書 §5-1）。
 *   「掃引する前に、解析で決まるものを先に決める」— K×床の掃引で
 *   「探索空間に次元が足りない」と分かったのと同じ轍を避けます。
 */
import { NICKS_GEN, ABILITY_KEYS } from '@star/sim-engine';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: 42, generations: 12, population: 400, stallionPool: 120,
    v1Pairs: 1, v1Repeats: 1, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sim.finalPopulation ?? [];
if (pool.length === 0) throw new Error('母集団が空です');

const pots: number[] = [];
const stats: number[] = [];
const rates: number[] = [];
for (const h of pool) {
  for (const k of ABILITY_KEYS) { pots.push(h.potential[k]); stats.push(h.stats[k]); }
  rates.push(h.unlockRate);
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]!;

console.log(`# 成長式の桁合わせ（${pool.length}頭 × ${ABILITY_KEYS.length}形質）`);
console.log(`  potential  平均 ${mean(pots).toFixed(1)}  5% ${q(pots,0.05).toFixed(1)}  95% ${q(pots,0.95).toFixed(1)}`);
console.log(`  stats(初期) 平均 ${mean(stats).toFixed(1)}  5% ${q(stats,0.05).toFixed(1)}  95% ${q(stats,0.95).toFixed(1)}`);
console.log(`  素質開放率  平均 ${mean(rates).toFixed(3)}`);

// ★正典 §7.3 の式で、係数がすべて 1 のときに何週で上限に達するか
const BASE_GAIN = 12;
const HEADROOM_EXP = 0.7;
const pot = mean(pots);
let cur = mean(stats);
console.log(`\n  ★正典の式（BASE_GAIN=${BASE_GAIN} / headroom 指数 ${HEADROOM_EXP}）で、`);
console.log(`    他の係数がすべて 1 のときの推移（平均的な馬）`);
console.log(`    ${'週'.padStart(5)} ${'current'.padStart(9)} ${'到達率'.padStart(8)} ${'その週の伸び'.padStart(12)}`);
for (let w = 0; w <= 182; w += 1) {
  const headroom = Math.pow(Math.max(0, (pot - cur) / pot), HEADROOM_EXP);
  const gain = BASE_GAIN * headroom;
  if (w <= 12 || w % 26 === 0) {
    console.log(`    ${String(w).padStart(5)} ${cur.toFixed(1).padStart(9)} ${((cur / pot) * 100).toFixed(1).padStart(7)}% ${gain.toFixed(2).padStart(12)}`);
  }
  cur = Math.min(pot, cur + gain);
}
console.log(`\n  ★調教できる週数は 78→260週 の 182週です`);
