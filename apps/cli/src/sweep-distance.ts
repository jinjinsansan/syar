/**
 * 距離系形質の変異幅の実測比較（P0-fix F-3 の根拠・開発用ツール）
 *
 *   npx tsx apps/cli/src/sweep-distance.ts
 *
 * 正典 §5.2 が意図する「マイラー／ステイヤー／万能型の分化」を守るには、
 * 世代を経ても distance_center の
 *   - 集団**平均**が漂移しないこと（漂移すると品種全体が長距離型などに偏る）
 *   - 集団**SD**が創始水準（約370）から大きく変わらないこと
 *     （広がりすぎても、縮んで全馬が同じ距離型になっても §5.2 の意図に反する）
 * が必要。回帰率0だと平均が繋ぎ止められず漂移するため、弱い回帰と変異SDの組で平衡させる。
 *
 * 理論値: 平衡時のアレルSD = σ / sqrt(2r - r²)
 *   創始アレルSD 520（一様1200〜3000）を保つには r=0.01 で σ≒73 / r=0.005 で σ≒52
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN, type BalanceConfig } from '@star/sim-engine';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

interface Candidate {
  label: string;
  centerSd: number;
  centerRegression: number;
  rangeSd: number;
  rangeRegression: number;
}

const CANDIDATES: Candidate[] = [
  { label: '旧(値域比 SD117 r0.20)', centerSd: 117, centerRegression: 0.2, rangeSd: 90, rangeRegression: 0.2 },
  { label: 'A: SD35 r0', centerSd: 35, centerRegression: 0, rangeSd: 15, rangeRegression: 0 },
  { label: 'B: SD73 r0.01', centerSd: 73, centerRegression: 0.01, rangeSd: 24, rangeRegression: 0.01 },
  { label: 'C: SD52 r0.005', centerSd: 52, centerRegression: 0.005, rangeSd: 17, rangeRegression: 0.005 },
  { label: 'D: SD73 r0.02', centerSd: 73, centerRegression: 0.02, rangeSd: 24, rangeRegression: 0.02 },
];

const SEEDS = [42, 7, 2026, 31337];
const HORIZONS = [100, 300, 600];

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

console.log('distance_center の平均とSD（創始: 平均約2090m / SD約359）');
console.log(
  `${pad('候補', 24)} | ${HORIZONS.map((h) => `${pad(`${h}年 平均`, 10)} ${pad('SD', 6)}`).join(' |')}`,
);
console.log('-'.repeat(24 + HORIZONS.length * 20));

for (const c of CANDIDATES) {
  const balance: BalanceConfig = {
    ...DEFAULT_BALANCE,
    traitMutation: {
      distance_center: {
        sd: c.centerSd,
        clamp: c.centerSd * 3.33,
        regressionRate: c.centerRegression,
      },
      distance_range: {
        sd: c.rangeSd,
        clamp: c.rangeSd * 3.33,
        regressionRate: c.rangeRegression,
      },
    },
  };

  const cells: string[] = [];
  for (const horizon of HORIZONS) {
    const means: number[] = [];
    const sds: number[] = [];
    for (const seed of SEEDS) {
      const r = runSimulation({ seed, generations: horizon }, balance, FOUNDERS, NICKS_GEN);
      const last = r.cohorts[r.cohorts.length - 1];
      if (last === undefined) continue;
      means.push(last.distanceCenter.mean);
      sds.push(last.distanceCenter.sd);
    }
    cells.push(`${pad(round(mean(means), 0), 10)} ${pad(round(mean(sds), 0), 6)}`);
  }
  console.log(`${pad(c.label, 24)} | ${cells.join(' |')}`);
}
