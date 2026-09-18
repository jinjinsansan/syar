/**
 * ★**帯（段）の分布を見る**（★READONLY・DB に触りません）
 *
 * 【★何のための道具か】
 *   ★測定に使うプールに ★**どの段の馬が何頭いるか**を出します。
 *   ★**低い段・高い段にそもそも馬が居なければ、帯ごとの割合は測れません**
 *   （R-21: 0 件を「該当なし」と読まない）。★線を引く前に、必ずこれを見ます。
 *
 * 【★なぜ `tmp/` から移したか】★2026-09-19・裁定 `REVIEW_T10_STARS_24_VERDICT_20260918.md`
 *   ★`tmp/` は gitignore なので ★**次に使う人に残りません**。★そして残っていた写しは
 *   ★旧名 `starsOfPotential`（T-10 で改名）を import したままで、★**次の人が壊れたものを踏む**形でした
 *   （★AL-6 で測定器 2 本を `tools/` へ移したのと同じ理由）。
 *
 * ⚠️ ★**AL-11（較正の取り直し）で使います** — ★帯が 9 段から 24 段になったので、
 *    ★**線を引くときに「束ね方」も決めることになります**（裁定: 定常を作ってから一緒に決める）。
 *
 * 実行: `npx tsx tools/probe-band-histogram.ts`
 */

import { NICKS_GEN, bandOfPotential, type HorseRecord } from '@star/sim-engine';
import { resolveRuntimeConfig } from '../apps/cli/src/config.js';
import { runSimulation } from '../apps/cli/src/simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from '../apps/cli/src/measurement.js';

const SEED = 42;
const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: SEED,
    generations: POOL_GENERATIONS,
    population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3),
    v1Pairs: 1,
    v1Repeats: 5,
    retainFinalPopulation: true,
  },
  balance,
  founders,
  NICKS_GEN,
);
const pool: readonly HorseRecord[] = sim.finalPopulation ?? [];

const bySex = new Map<string, number>();
const byBand = new Map<number, number>();
for (const h of pool) {
  bySex.set(h.sex, (bySex.get(h.sex) ?? 0) + 1);
  const b = bandOfPotential(h.potential);
  byBand.set(b, (byBand.get(b) ?? 0) + 1);
}

console.log(`プール: ${pool.length} 頭（seed=${SEED}・${POOL_GENERATIONS} 世代 × ${POOL_MARES} 頭）`);
console.log(`性別: ${[...bySex].map(([k, v]) => `${k}=${v}`).join(' / ')}`);
console.log('');
console.log('段（帯）の分布（★24 段・D-114）:');
for (const b of [...byBand.keys()].sort((x, y) => x - y)) {
  const n = byBand.get(b) ?? 0;
  console.log(`  段${String(b).padStart(3)}  ${String(n).padStart(4)} 頭  ${'#'.repeat(Math.round((n / pool.length) * 60))}`);
}

// ★素質の平均そのものの分布（帯の境目 STAR_THRESHOLDS との位置関係を見るため）
const means = pool
  .map((h) => {
    const keys = Object.keys(h.potential) as (keyof typeof h.potential)[];
    let sum = 0;
    for (const k of keys) sum += h.potential[k];
    return sum / keys.length;
  })
  .sort((a, b) => a - b);
const q = (p: number): number => means[Math.min(means.length - 1, Math.floor(p * means.length))] ?? 0;
console.log('');
console.log(
  `素質の平均: 最小 ${means[0]?.toFixed(0)} / 25% ${q(0.25).toFixed(0)} / 中央 ${q(0.5).toFixed(0)} / 75% ${q(0.75).toFixed(0)} / 最大 ${means[means.length - 1]?.toFixed(0)}`,
);
