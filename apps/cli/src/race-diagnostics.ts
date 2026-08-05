/**
 * レース内スコア分散の要因分解（較正のための診断ツール）
 *
 *   npx tsx apps/cli/src/race-diagnostics.ts [--races 400]
 *
 * ★なぜ要るか:
 *   V-4（1番人気の勝率）は「出走馬間の実力差」と「乱数 K」の比で決まる。
 *   目標を外したときに **K を動かすのは最後の手段**で、先に「実力差がどこから来ているか」を
 *   知らないと、正典の定数（K=0.12）を自分のプレースホルダの粗さの尻拭いに使ってしまう。
 *   ここでは各係数を1つずつ中立化して、レース内スコアの変動係数(CV)がどれだけ縮むかを測る。
 *   縮み幅が大きい係数ほど、実力差への寄与が大きい。
 */

import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { resolveRuntimeConfig } from './config.js';
import { DEFAULT_CLASS_BAND, generateRace, sortPoolByClass } from './race-field.js';
import { runSimulation } from './simulator.js';
import { coefficientOfVariation, mean, round } from './stats.js';

function parseNumber(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = Number(process.argv[idx + 1]);
  return Number.isFinite(raw) ? raw : fallback;
}

const RACES = parseNumber('--races', 400);
const SEED = parseNumber('--seed', 42);
const CLASS_BAND = parseNumber('--class-band', DEFAULT_CLASS_BAND);
const balance = DEFAULT_RACE_BALANCE;

/** 出走馬の特定の属性を「全馬同一」にする中立化 */
type Neutralizer = { label: string; apply: (entrants: RaceEntrant[]) => RaceEntrant[] };

const NEUTRALIZERS: Neutralizer[] = [
  { label: '（中立化なし・基準）', apply: (e) => e },
  {
    label: '素質開放率（stats を potential 比で揃える）',
    apply: (entrants) => {
      // 各馬の stats を「その馬の stats 合計 → 全馬平均合計」にスケールし、開放率の差だけを消す
      const totals = entrants.map((e) =>
        Object.values(e.stats).reduce((a, b) => a + b, 0),
      );
      const avg = mean(totals);
      return entrants.map((e, i) => {
        const t = totals[i] ?? avg;
        const k = t === 0 ? 1 : avg / t;
        const stats = { ...e.stats };
        for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] *= k;
        return { ...e, stats };
      });
    },
  },
  {
    label: '距離適性（全馬をレース距離ぴったりに）',
    apply: (entrants) => entrants.map((e) => ({ ...e, distanceCenter: 2000, distanceRange: 5000 })),
  },
  {
    label: '馬場適性（全馬 50）',
    apply: (entrants) => entrants.map((e) => ({ ...e, surfaceAptitude: { turf: 50, dirt: 50 } })),
  },
  {
    label: '脚質適性（全馬 50）',
    apply: (entrants) =>
      entrants.map((e) => ({
        ...e,
        strategyAptitude: { nige: 50, senko: 50, sashi: 50, oikomi: 50 },
      })),
  },
  {
    label: '調子・年齢・斤量（全馬 3 / 4歳 / 55kg）',
    apply: (entrants) => entrants.map((e) => ({ ...e, condition: 3, age: 4, weightKg: 55 })),
  },
  {
    label: '素質そのもの（全馬の stats を平均で揃える）',
    apply: (entrants) => {
      const keys = ['sp', 'st', 'pw', 'gt', 'iq'] as const;
      const avg = {} as Record<(typeof keys)[number], number>;
      for (const k of keys) avg[k] = mean(entrants.map((e) => e.stats[k]));
      return entrants.map((e) => ({ ...e, stats: { ...avg } }));
    },
  },
];

const { balance: geneticsBalance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: SEED,
    generations: 12,
    population: 300,
    stallionPool: 90,
    v1Pairs: 1,
    v1Repeats: 5,
    retainFinalPopulation: true,
  },
  geneticsBalance,
  founders,
  NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);
const fieldRng = deriveRng(SEED, 11);

// 出走表を先に作っておく（中立化ごとに同じ出走表を使う）
const fields = Array.from({ length: RACES }, (_, i) =>
  generateRace(pool, i, fieldRng, CLASS_BAND),
);

console.log(`出走表 ${RACES} レース / クラス幅=${CLASS_BAND} / seed=${SEED}`);
console.log('');
console.log('レース内スコアCV = 出走馬同士の実力差の大きさ。K=0.12 と比べて大きいほど堅く決まる');
console.log(`比較対象: RACE_RANDOM_K = ${balance.RACE_RANDOM_K}`);
console.log('');
console.log(`${'中立化した要素'.padEnd(46)} レース内スコアCV   基準比`);
console.log('-'.repeat(78));

let baseCv = 0;
for (const n of NEUTRALIZERS) {
  const cvs: number[] = [];
  for (const field of fields) {
    const entrants = n.apply(field.entrants.map((e) => ({ ...e })));
    const r = resolveRace({
      conditions: field.conditions,
      entrants,
      seed: 1,
      balance,
    });
    cvs.push(coefficientOfVariation(r.order.map((o) => o.breakdown.score)));
  }
  const cv = mean(cvs);
  if (n.label.includes('基準')) baseCv = cv;
  const ratio = baseCv === 0 ? 1 : cv / baseCv;
  console.log(
    `${n.label.padEnd(46)} ${String(round(cv * 100, 2) + '%').padStart(12)} ${String(
      round(ratio * 100, 1) + '%',
    ).padStart(9)}`,
  );
}
