/**
 * P0-fix 検証ハーネス — 合格基準7「複数シード（4以上）で安定して成立すること」
 *
 *   npx tsx apps/cli/src/verify.ts [--seeds 42,7,2026,31337] [--horizons 100,300]
 *
 * 既定の balance（正典 §13.1・D-008 反映後）で、指定シード × 指定horizon を回し、
 * V-1 / V-2a / V-2b / V-3 と距離適性の分化を一覧にする。
 * V-2c は「300ゲーム内年での V-1」なので、horizon 300 の行の V-1 がそのまま V-2c にあたる。
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN } from '@star/sim-engine';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

function parseList(flag: string, fallback: number[]): number[] {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = process.argv[idx + 1];
  if (raw === undefined) return fallback;
  const out = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return out.length > 0 ? out : fallback;
}

const SEEDS = parseList('--seeds', [42, 7, 2026, 31337]);
const HORIZONS = parseList('--horizons', [100, 300]);

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

function mark(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

let allPass = true;

for (const horizon of HORIZONS) {
  console.log('');
  console.log(`=== ${horizon} ゲーム内年（実時間 約${((horizon * 52 * 4) / 24 / 365).toFixed(1)}年相当）===`);
  console.log(
    `${pad('seed', 7)} | ${pad('V-1', 8)} ${pad('判定', 5)} | ${pad('V-2a %/世代', 12)} ${pad('判定', 5)} | ` +
      `${pad('V-2b 天井', 9)} ${pad('判定', 5)} | ${pad('V-3', 5)} | ${pad('距離平均', 9)} ${pad('距離SD', 7)} ${pad('創始比', 7)} | ${pad('親子相関', 8)}`,
  );
  console.log('-'.repeat(118));

  const v1s: number[] = [];
  const distSdRatios: number[] = [];

  for (const seed of SEEDS) {
    const r = runSimulation({ seed, generations: horizon }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v = r.verification;
    const last = r.cohorts[r.cohorts.length - 1];
    const sdRatio =
      r.founderCohort.distanceCenter.sd === 0
        ? 0
        : (last?.distanceCenter.sd ?? 0) / r.founderCohort.distanceCenter.sd;
    const corr = mean(r.cohorts.slice(-20).map((c) => c.parentOffspringCorrelation));

    v1s.push(v.v1.primaryMeanCv);
    distSdRatios.push(sdRatio);
    if (!(v.v1.pass && v.v2a.pass && v.v2b.pass && v.v3.pass)) allPass = false;

    console.log(
      `${pad(seed, 7)} | ${pad(`${round(v.v1.primaryMeanCv * 100, 2)}%`, 8)} ${pad(mark(v.v1.pass), 5)} | ` +
        `${pad(v.v2a.slopePctPerGeneration.toFixed(4), 12)} ${pad(mark(v.v2a.pass), 5)} | ` +
        `${pad(`${round(v.v2b.ceilingRatio * 100, 2)}%`, 9)} ${pad(mark(v.v2b.pass), 5)} | ` +
        `${pad(mark(v.v3.pass), 5)} | ` +
        `${pad(`${(last?.distanceCenter.mean ?? 0).toFixed(0)}m`, 9)} ${pad((last?.distanceCenter.sd ?? 0).toFixed(0), 7)} ` +
        `${pad(`${sdRatio.toFixed(2)}x`, 7)} | ${pad(corr.toFixed(3), 8)}`,
    );
  }

  console.log(
    `${pad('平均', 7)} | ${pad(`${round(mean(v1s) * 100, 2)}%`, 8)} ${pad('', 5)} | ` +
      `${pad('', 12)} ${pad('', 5)} | ${pad('', 9)} ${pad('', 5)} | ${pad('', 5)} | ` +
      `${pad('', 9)} ${pad('', 7)} ${pad(`${mean(distSdRatios).toFixed(2)}x`, 7)} |`,
  );

  if (horizon === 300) {
    const worst = Math.min(...v1s);
    const best = Math.max(...v1s);
    console.log(
      `V-2c（300年での V-1 が 12〜18%）: ${mark(worst >= 0.12 && best <= 0.18)}  ` +
        `[最小 ${round(worst * 100, 2)}% / 最大 ${round(best * 100, 2)}%]`,
    );
  }
}

console.log('');
console.log(`総合: ${mark(allPass)}`);
process.exitCode = allPass ? 0 : 1;
