/**
 * 距離系形質の変異幅・回帰率の校正（開発用ツール）
 *
 *   npm run verify:distance [-- --population 800 --horizon 300 --seeds 42,7]
 *
 * 距離系は2つの条件を同時に満たす必要がある:
 *   1. 集団**平均**が創始水準から動かない（V-2d: ±10% 以内）
 *      → 大物覚醒（§6.3）が単調上昇ラチェットとして押し上げるので、回帰で押し返す必要がある。
 *        平衡時のずれ ∝ ラチェットの押し上げ量 / 回帰率
 *   2. 集団**SD**が創始水準を保つ（V-2e: 0.8〜1.4倍）
 *      → 平衡SD = sd / sqrt(2r - r²)。回帰率を上げるなら sd も上げないと分化が消える
 *
 * したがって回帰率 r を決めたら sd は `創始アレルSD × sqrt(2r - r²)` で決まる（従属変数）。
 * 本スクリプトは r を振って、平均のずれとSD比を実測する。
 *
 * ※ P0-fix（第2号）時点の表は REPORT_P0FIX §4-2 と git 履歴に保存されている。
 *   当時は集団200頭・V-2d 未実装だったため、判定条件が異なる。
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN, type BalanceConfig } from '@star/sim-engine';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

/** 創始アレルSD（一様分布 [a,b] の SD = (b-a)/sqrt(12)） */
const FOUNDER_ALLELE_SD = {
  center: (FOUNDERS.DISTANCE_CENTER_RANGE[1] - FOUNDERS.DISTANCE_CENTER_RANGE[0]) / Math.sqrt(12),
  range: (FOUNDERS.DISTANCE_RANGE_RANGE[1] - FOUNDERS.DISTANCE_RANGE_RANGE[0]) / Math.sqrt(12),
};

/** 平衡SDを創始水準に保つ sd を回帰率から逆算する */
function sdFor(alleleSd: number, r: number): number {
  return Math.round(alleleSd * Math.sqrt(2 * r - r * r));
}

function parseNumber(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = Number(process.argv[idx + 1]);
  return Number.isFinite(raw) ? raw : fallback;
}

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

const POPULATION = parseNumber('--population', 800);
const HORIZON = parseNumber('--horizon', 300);
const SEEDS = parseList("--seeds", [42, 7, 2026, 31337]);
const RATES = parseList('--rates', [0.05, 0.1, 0.2]);
/** clamp / sd の比。能力5種と同じ 150/90 = 1.67 に揃える */
const CLAMP_RATIO = 150 / 90;

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

console.log(
  `繁殖牝馬=${POPULATION}頭 / ${HORIZON}ゲーム内年 / シード=${SEEDS.join(',')}\n` +
    `合格域: 平均のずれ ±10%以内（V-2d） / distance_center のSD比 0.8〜1.4倍（V-2e）`,
);
console.log('');
console.log('※ ずれ・SD比は**シード間の最悪値**（ゲートはシードごとにかかるため）');
console.log(
  `${pad('回帰率', 7)} ${pad('center sd', 10)} ${pad('range sd', 9)} | ` +
    `${pad('center 最悪ずれ', 15)} ${pad('SD比', 7)} | ${pad('range 最悪ずれ', 14)} ${pad('SD比', 7)} | 判定`,
);
console.log('-'.repeat(96));

for (const r of RATES) {
  const centerSd = sdFor(FOUNDER_ALLELE_SD.center, r);
  const rangeSd = sdFor(FOUNDER_ALLELE_SD.range, r);
  const balance: BalanceConfig = {
    ...DEFAULT_BALANCE,
    traitMutation: {
      ...DEFAULT_BALANCE.traitMutation,
      distance_center: {
        sd: centerSd,
        clamp: Math.round(centerSd * CLAMP_RATIO),
        regressionRate: r,
        center: 2100,
      },
      distance_range: {
        sd: rangeSd,
        clamp: Math.round(rangeSd * CLAMP_RATIO),
        regressionRate: r,
        center: 700,
      },
    },
  };

  const centerDev: number[] = [];
  const centerSdRatio: number[] = [];
  const rangeDev: number[] = [];
  const rangeSdRatio: number[] = [];

  for (const seed of SEEDS) {
    const res = runSimulation(
      {
        seed,
        generations: HORIZON,
        population: POPULATION,
        stallionPool: Math.round(POPULATION * 0.3),
      },
      balance,
      FOUNDERS,
      NICKS_GEN,
    );
    const last = res.cohorts[res.cohorts.length - 1];
    const f = res.founderCohort;
    if (last === undefined) continue;
    centerDev.push(last.traitMeans.distance_center / f.traitMeans.distance_center - 1);
    rangeDev.push(last.traitMeans.distance_range / f.traitMeans.distance_range - 1);
    centerSdRatio.push(last.distanceCenter.sd / f.distanceCenter.sd);
    rangeSdRatio.push(last.distanceRange.sd / f.distanceRange.sd);
  }

  // ★平均ではなく**最悪値**で判定する。ゲートはシードごとにかかるので、
  //   平均で見るとシード間のばらつきを隠してしまう（P0-fix2 で実際にこれを踏んだ）
  const worstAbs = (xs: number[]): number =>
    xs.reduce((acc, v) => (Math.abs(v) > Math.abs(acc) ? v : acc), 0);
  const cDev = worstAbs(centerDev);
  const rDev = worstAbs(rangeDev);
  const cSdWorst = centerSdRatio.reduce(
    (acc, v) => (Math.abs(v - 1) > Math.abs(acc - 1) ? v : acc),
    1,
  );
  const ok =
    Math.abs(cDev) <= 0.1 && Math.abs(rDev) <= 0.1 && cSdWorst >= 0.8 && cSdWorst <= 1.4;

  console.log(
    `${pad(r, 7)} ${pad(centerSd, 10)} ${pad(rangeSd, 9)} | ` +
      `${pad(`${round(cDev * 100, 2)}%`, 15)} ${pad(`${cSdWorst.toFixed(2)}x`, 7)} | ` +
      `${pad(`${round(rDev * 100, 2)}%`, 14)} ${pad(`${mean(rangeSdRatio).toFixed(2)}x`, 7)} | ${ok ? 'PASS' : 'FAIL'}`,
  );
}
