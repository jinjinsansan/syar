/**
 * 受け入れ検証ハーネス — 合格基準「複数シード（4以上）× 100/300年で安定して成立すること」
 *
 *   npm run verify [-- --seeds 42,7,2026,31337] [--horizons 100,300] [--population 800]
 *
 * 既定の balance（正典 §13.1・D-009 反映後）で指定シード × 指定horizon を回し、
 * V-1 / V-2a / V-2b / V-2d / V-2e / V-3 を一覧にする。
 * V-2c（長期健全性）は「300ゲーム内年での V-1」なので、horizon に 300 を含めたときだけ判定できる。
 *
 * 集団規模の既定は正典 §10.5 の NPC 繁殖牝馬プール **800頭**（実運用の予測が目的のため）。
 * 高速反復には `--population 200` が使えるが、小集団では遺伝的浮動由来のばらつきが大きく、
 * V-2e のような閾値ゲートが誤作動しうる（REPORT_P0FIX2 §3 の注記を参照）。
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN } from '@star/sim-engine';
import { runSimulation } from './simulator.js';
import { mean, round } from './stats.js';

/** 正典 §10.5 の NPC 繁殖牝馬プール */
const DEFAULT_POPULATION = 800;
/** 種牡馬プールは P0 からの比率（60/200 = 0.3）を維持する */
const STALLION_RATIO = 0.3;
/** V-2c を判定できる horizon（正典 §13.2） */
const LONG_HORIZON = 300;

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

function parseNumber(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = Number(process.argv[idx + 1]);
  return Number.isFinite(raw) ? raw : fallback;
}

const SEEDS = parseList('--seeds', [42, 7, 2026, 31337]);
const HORIZONS = parseList('--horizons', [100, LONG_HORIZON]);
const POPULATION = parseNumber('--population', DEFAULT_POPULATION);
const STALLION_POOL = Math.max(1, Math.round(POPULATION * STALLION_RATIO));

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

function mark(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

const startedAt = process.hrtime.bigint();

console.log(
  `繁殖牝馬=${POPULATION}頭 / 種牡馬プール=${STALLION_POOL}頭 / シード=${SEEDS.join(',')} / horizon=${HORIZONS.join(',')}`,
);
if (POPULATION < DEFAULT_POPULATION) {
  console.log(
    `[注意] 既定（${DEFAULT_POPULATION}頭・正典 §10.5）より小さい集団です。遺伝的浮動が大きく出るため、` +
      'V-2e の閾値ゲートが誤作動しうります。受け入れ判定には既定規模を使ってください。',
  );
}

let allPass = true;
let v2cEvaluated = false;
let v2cPass = false;

for (const horizon of HORIZONS) {
  console.log('');
  console.log(
    `=== ${horizon} ゲーム内年（実時間 約${((horizon * 52 * 4) / 24 / 365).toFixed(1)}年相当）===`,
  );
  console.log(
    `${pad('seed', 7)} | ${pad('V-1', 8)} ${pad('判定', 5)} | ${pad('V-2a %/世代', 12)} ${pad('判定', 5)} | ` +
      `${pad('V-2b 天井', 9)} ${pad('判定', 5)} | ${pad('V-2d 最大乖離', 18)} ${pad('判定', 5)} | ` +
      `${pad('V-2e 最悪SD比', 22)} ${pad('判定', 5)} | ${pad('V-3', 5)} | ${pad('丈夫さ', 8)} | ${pad('親子相関', 8)}`,
  );
  console.log('-'.repeat(152));

  const v1s: number[] = [];
  const distRatios: number[] = [];
  const durabilities: number[] = [];

  for (const seed of SEEDS) {
    const r = runSimulation(
      { seed, generations: horizon, population: POPULATION, stallionPool: STALLION_POOL },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    const v = r.verification;
    const last = r.cohorts[r.cohorts.length - 1];
    const corr = mean(r.cohorts.slice(-20).map((c) => c.parentOffspringCorrelation));
    const durability = last?.traitMeans.durability ?? 0;

    v1s.push(v.v1.primaryMeanCv);
    distRatios.push(v.v2e.worstRatio);
    durabilities.push(durability);

    const seedPass = v.v1.pass && v.v2a.pass && v.v2b.pass && v.v2d.pass && v.v2e.pass && v.v3.pass;
    if (!seedPass) allPass = false;

    console.log(
      `${pad(seed, 7)} | ${pad(`${round(v.v1.primaryMeanCv * 100, 2)}%`, 8)} ${pad(mark(v.v1.pass), 5)} | ` +
        `${pad(v.v2a.slopePctPerGeneration.toFixed(4), 12)} ${pad(mark(v.v2a.pass), 5)} | ` +
        `${pad(`${round(v.v2b.ceilingRatio * 100, 2)}%`, 9)} ${pad(mark(v.v2b.pass), 5)} | ` +
        `${pad(`${v.v2d.worstKey ?? '-'} ${(v.v2d.worstDeviation * 100).toFixed(2)}%`, 18)} ${pad(mark(v.v2d.pass), 5)} | ` +
        `${pad(`${v.v2e.worstKey ?? '-'} ${v.v2e.worstRatio.toFixed(2)}x`, 22)} ${pad(mark(v.v2e.pass), 5)} | ` +
        `${pad(mark(v.v3.pass), 5)} | ${pad(durability.toFixed(1), 8)} | ${pad(corr.toFixed(3), 8)}`,
    );
  }

  console.log(
    `${pad('平均', 7)} | ${pad(`${round(mean(v1s) * 100, 2)}%`, 8)} ${pad('', 5)} | ${pad('', 12)} ${pad('', 5)} | ` +
      `${pad('', 9)} ${pad('', 5)} | ${pad('', 18)} ${pad('', 5)} | ` +
      `${pad(`${mean(distRatios).toFixed(2)}x`, 22)} ${pad('', 5)} | ${pad('', 5)} | ${pad(mean(durabilities).toFixed(1), 8)} |`,
  );

  if (horizon === LONG_HORIZON) {
    v2cEvaluated = true;
    const worst = Math.min(...v1s);
    const best = Math.max(...v1s);
    v2cPass = worst >= 0.12 && best <= 0.18;
    console.log(
      `V-2c（${LONG_HORIZON}年での V-1 が 12〜18%）: ${mark(v2cPass)}  ` +
        `[最小 ${round(worst * 100, 2)}% / 最大 ${round(best * 100, 2)}%]`,
    );
  }
}

const elapsedSec = Number(process.hrtime.bigint() - startedAt) / 1e9;

console.log('');
if (!v2cEvaluated) {
  // simulate 側と非対称にならないよう、V-2c 未評価は総合判定にも出力にも必ず反映する
  console.log(
    `[注意] horizon に ${LONG_HORIZON} が含まれていないため **V-2c は未評価** です。` +
      `受け入れ判定には --horizons 100,${LONG_HORIZON} を使ってください。`,
  );
  allPass = false;
} else if (!v2cPass) {
  allPass = false;
}

console.log(`所要時間: ${elapsedSec.toFixed(1)} 秒`);
console.log(`総合: ${mark(allPass)}${v2cEvaluated ? '' : '（V-2c 未評価のため不成立）'}`);
process.exitCode = allPass ? 0 : 1;
