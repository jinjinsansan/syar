/**
 * 【P0 当時の記録・現行の検証には使わない】定数チューニング用のスイープ。
 *
 *   npx tsx apps/cli/src/sweep.ts
 *
 * QUESTIONS_P0 Q1（平均回帰を採るべきか）の判断材料を作るために書いたもので、
 * D-008 で回帰の採用が決まったため役目を終えている。V-2 列は**廃止された旧基準**
 * （+50%以内）の実測値なので、判定列も現行基準とは一致しない。
 *
 * 現行の検証は `verify.ts`（4シード × 100/300年で V-1/V-2a/V-2b/V-3 と距離分化を見る）を使うこと。
 * 本ファイルは P0 報告書の数値を再現できるように残している。
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN, type BalanceConfig } from '@star/sim-engine';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

interface Config {
  label: string;
  selectionH2: number;
  mutationSd: number;
  regression?: number;
}

const CONFIGS: Config[] = [
  // 指示書 §3.4 の文字通りの既定（真の素質値による完全情報選抜）
  { label: '①指示書どおり', selectionH2: 1.0, mutationSd: 45 },
  // 出荷時の既定（選抜のみ現実的な精度に。正典の遺伝定数は無改変）
  { label: '②出荷既定 h2=.3', selectionH2: 0.3, mutationSd: 45 },
  // 選抜精度だけで V-2 を通そうとした場合の必要水準
  { label: '③h2=.15のみ', selectionH2: 0.15, mutationSd: 45 },
  // 提案: 平均回帰 + 分散補償
  { label: '④提案A 回帰.20', selectionH2: 0.3, mutationSd: 90, regression: 0.2 },
  { label: '⑤提案B 回帰.15', selectionH2: 0.3, mutationSd: 75, regression: 0.15 },
  { label: '⑥提案C h2仮定なし', selectionH2: 1.0, mutationSd: 100, regression: 0.25 },
];

const SEEDS = [42, 7, 2026, 31337];

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

console.log(
  `${pad('config', 20)} | ${pad('V-2 平均', 9)} ${pad('最悪', 8)} | ${pad('V-1 平均', 9)} ${pad('最小', 7)} ${pad('最大', 7)} | ${pad('親子相関', 8)} | 判定`,
);
console.log('-'.repeat(97));

for (const cfg of CONFIGS) {
  const balance: BalanceConfig = {
    ...DEFAULT_BALANCE,
    genetics: { ...DEFAULT_BALANCE.genetics, MUTATION_SD: cfg.mutationSd },
    REGRESSION_RATE: cfg.regression ?? 0,
  };
  const v2s: number[] = [];
  const v1s: number[] = [];
  const corrs: number[] = [];
  for (const seed of SEEDS) {
    const r = runSimulation(
      { seed, generations: 100, selectionH2: cfg.selectionH2 },
      balance,
      FOUNDERS,
      NICKS_GEN,
    );
    v2s.push(r.verification.legacyRatio.ratio);
    v1s.push(r.verification.v1.primaryMeanCv);
    corrs.push(mean(r.cohorts.slice(-20).map((c) => c.parentOffspringCorrelation)));
  }
  const worstV2 = Math.max(...v2s);
  const minV1 = Math.min(...v1s);
  const maxV1 = Math.max(...v1s);
  const pass = worstV2 <= 0.5 && minV1 >= 0.12 && maxV1 <= 0.18;
  console.log(
    `${pad(cfg.label, 20)} | ${pad(`${round(mean(v2s) * 100, 2)}%`, 9)} ${pad(`${round(worstV2 * 100, 2)}%`, 8)} | ` +
      `${pad(`${round(mean(v1s) * 100, 2)}%`, 9)} ${pad(`${round(minV1 * 100, 2)}%`, 7)} ${pad(`${round(maxV1 * 100, 2)}%`, 7)} | ` +
      `${pad(round(mean(corrs), 3), 8)} | ${pass ? 'PASS' : 'FAIL'}`,
  );
}
