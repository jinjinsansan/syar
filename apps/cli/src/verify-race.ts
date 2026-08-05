/**
 * K-5 レースのモンテカルロ検証ハーネス（正典 §13.2 の V-4/V-5/V-6/V-8/V-9/V-12）
 *
 *   npm run verify:race [-- --races 100000 --seeds 42,7,2026,31337]
 *
 * 【人気の定義】指示書 §5 に従い、**同一レースをモンテカルロした勝率順位**で定義する。
 *   ★推定に使う乱数系列と本番確定の系列を分ける（正典 §9.2「オッズ算出のシードは
 *     本番確定用とは別系列」）。同じ試行で人気を決めて同じ試行で勝率を測ると、
 *     **勝った馬が1番人気になりやすい**という自己選択バイアスが入り、V-4 が過大に出る。
 *
 * 【V-9 の母集団】正典 §8b.8 は「`interventionMult` の実測分布を日次で記録」と定める。
 *   介入できるのは**自馬のオーナーのみ**（§8b.1）なので、実運用の分布は
 *   「介入のない馬（=1.00）」が大半を占める。本ハーネスも同じ母集団で測り、
 *   参考値として「介入対象馬だけの分布」も併記する（どちらで測ったかを隠さない）。
 */

import {
  CALIBRATED_RACE_RANDOM_K,
  DEFAULT_INTERVENTION_BALANCE,
  DEFAULT_RACE_BALANCE,
  aiProxyPlan,
  averageSpeedMps,
  optimalPlan,
  resolveIntervention,
  resolveRace,
  type RaceBalance,
} from '@star/race-engine';
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { resolveRuntimeConfig } from './config.js';
import {
  DEFAULT_CLASS_BAND,
  DISTANCE_SUIT_MIN,
  FIELD_STRENGTH_FLOOR,
  OFF_DISTANCE_ENTRY_RATE,
  OFF_SURFACE_ENTRY_RATE,
  OVERSAMPLE_RATIO,
  PLACEHOLDER_UNLOCK,
  generateRace,
  sortPoolByClass,
} from './race-field.js';
import { runSimulation } from './simulator.js';
import { toSafeJson } from './json-safe.js';
import { DEFAULT_POPULARITY_TRIALS, PopularityEstimator } from './popularity.js';
import { mean, round, sd } from './stats.js';

// ---------------------------------------------------------------------------
// 引数
// ---------------------------------------------------------------------------

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

const TOTAL_RACES = parseNumber('--races', 100_000);
const SEEDS = parseList('--seeds', [42, 7, 2026, 31337]);
/**
 * 人気推定の試行数（本番確定とは別系列）。
 *
 * ★R-12: **測定の自由変数は判定に効かないことを確認する**。
 *   タイブレークを枠順から平均着順に変えた結果、V-6 は 30〜1200試行で 0.23〜0.33% と
 *   傾向なく安定する（変更前は 60試行 1.00% → 1200試行 0.30% と単調に動き、
 *   **PASS が推定ノイズの産物**だった）。既定 200 は安定域の中央付近。
 */
const POPULARITY_TRIALS = parseNumber('--popularity-trials', DEFAULT_POPULARITY_TRIALS);
/** 母集団を作る世代数 */
const POOL_GENERATIONS = parseNumber('--pool-generations', 40);
const POOL_MARES = parseNumber('--pool-mares', 400);
/** クラス幅（母集団に対する割合）。1.0 でクラス分けなし */
const CLASS_BAND = parseNumber('--class-band', DEFAULT_CLASS_BAND);
/** 素質開放率のプレースホルダ範囲（P3 の育成モデルで置き換わる・R-7） */
const UNLOCK = {
  MIN: parseNumber('--unlock-min', PLACEHOLDER_UNLOCK.MIN),
  MAX: parseNumber('--unlock-max', PLACEHOLDER_UNLOCK.MAX),
};

/** 乱数系列の用途（K-2 の系列独立性。ここでも混ぜない） */
const STREAM = {
  /** 出走表の生成 */
  FIELD: 11,
  /** 人気推定（= オッズ算出相当・§9.2 で本番と別系列と定められている） */
  POPULARITY: 12,
  /** 本番確定 */
  DECIDE: 13,
  /** 介入 */
  INTERVENTION: 14,
} as const;

/**
 * ★K は正典 §13.1 の値（0.12）。§8.7 が「実装後に必ずモンテカルロ10万レースで
 *   人気別勝率を較正する」と定めているため、--k で振れるようにしてある。
 *   既定から外れた値で回した場合は冒頭で自己申告する（R-8）。
 */
const RACE_K = parseNumber("--k", CALIBRATED_RACE_RANDOM_K);
const balance: RaceBalance = { ...DEFAULT_RACE_BALANCE, RACE_RANDOM_K: RACE_K };
const ib = DEFAULT_INTERVENTION_BALANCE;

// ---------------------------------------------------------------------------
// 1シードぶんの計測
// ---------------------------------------------------------------------------

interface SeedResult {
  seed: number;
  races: number;
  favoriteWinRate: number;
  favoriteTop3Rate: number;
  longshotWinRate: number;
  /** 人気別の勝率（1番人気から） */
  winRateByRank: number[];
  interventionMeanAll: number;
  interventionMeanIntervened: number;
  interventionMin: number;
  interventionMax: number;
  aiMultMean: number;
  optimalMultMean: number;
  aiWinRate: number;
  optimalWinRate: number;
  meanF: number;
  durabilityGap: number;
  poolSize: number;
  /** 出走頭数 → その頭数のレース数（正典 §10.4 の分布を確認する・Q-4） */
  fieldSizeCounts: Record<number, number>;
  /** 出走頭数 → 最低人気の勝利数（P-4: 裾が頭数によらず生きているか） */
  longshotWinsByFieldSize: Record<number, number>;
}

function runSeed(seed: number, racesForSeed: number): SeedResult {
  // --- 母集団を作る（実際の遺伝エンジンの産物を使う） ---
  const { balance: geneticsBalance, founders } = resolveRuntimeConfig();
  const sim = runSimulation(
    {
      seed,
      generations: POOL_GENERATIONS,
      population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3),
      v1Pairs: 1,
      v1Repeats: 5,
      retainFinalPopulation: true,
    },
    geneticsBalance,
    founders,
    NICKS_GEN,
  );
  const pool = sortPoolByClass(sim.finalPopulation ?? []);
  if (pool.length === 0) throw new Error('母集団の取得に失敗（retainFinalPopulation）');

  // --- V-12: 平均F と 表現型 − genotype 乖離（丈夫さ） ---
  const meanF = mean(pool.map((h) => h.inbreedCoeff));
  // genotype 由来の丈夫さ（2アレルの相加平均）に対し、発現値がどれだけ下がったか
  const durabilityGap = mean(
    pool.map((h) => {
      const g = (h.genotype.durability.a1 + h.genotype.durability.a2) / 2;
      return g === 0 ? 0 : h.durability / g - 1;
    }),
  );

  // --- レースを回す ---
  let favoriteWins = 0;
  let favoriteTop3 = 0;
  let longshotWins = 0;
  const winsByRank: number[] = [];
  const racesByRank: number[] = [];
  const fieldSizeCounts: Record<number, number> = {};
  const longshotWinsByFieldSize: Record<number, number> = {};

  const allMults: number[] = [];
  const intervenedMults: number[] = [];
  const aiMults: number[] = [];
  const optimalMults: number[] = [];
  let aiWins = 0;
  let optimalWins = 0;
  let interventionRaces = 0;

  const fieldRng = deriveRng(seed, STREAM.FIELD);

  for (let raceIndex = 0; raceIndex < racesForSeed; raceIndex++) {
    const race = generateRace(pool, raceIndex, fieldRng, CLASS_BAND, UNLOCK);
    const fieldSize = race.entrants.length;

    // (1) 人気を推定する（本番とは別系列・§9.2）
    //   タイブレークを含む順位付けは popularity.ts に切り出し、経路テストを掛けている（O-2）
    const estimator = new PopularityEstimator(race.entrants.map((e) => e.horseId));
    for (let t = 0; t < POPULARITY_TRIALS; t++) {
      const r = resolveRace({
        conditions: race.conditions,
        entrants: race.entrants,
        seed: deriveRng(seed, STREAM.POPULARITY, raceIndex, t).nextUint32() >>> 0,
        balance,
      });
      estimator.addTrial(r.order.map((o) => o.horseId));
    }
    const ranked = estimator.rank().map((x) => ({ id: x.horseId }));
    const favorite = ranked[0];
    const longshot = ranked[ranked.length - 1];
    if (favorite === undefined || longshot === undefined) continue;

    // (2) 介入: 1レースにつき1頭を「自馬」とみなす（§8b.1: 介入できるのは自馬のみ）
    const ownRng = deriveRng(seed, STREAM.INTERVENTION, raceIndex);
    const ownIndex = ownRng.int(0, fieldSize - 1);
    const own = race.entrants[ownIndex];
    const speed = averageSpeedMps(
      race.conditions.distance,
      race.conditions.surface,
      race.conditions.trackCondition,
      balance,
    );
    const mults = new Map<string, number>();
    let aiMult = 1;
    let optMult = 1;
    if (own !== undefined) {
      const horse = {
        iq: own.stats.iq,
        gt: own.stats.gt,
        st: own.stats.st,
        condition: own.condition,
        fatigue: own.fatigue,
      };
      const ai = resolveIntervention(horse, aiProxyPlan(horse, ownRng, ib), speed, ib);
      const opt = resolveIntervention(horse, optimalPlan(ib), speed, ib);
      aiMult = ai.interventionMult;
      optMult = opt.interventionMult;
      aiMults.push(aiMult);
      optimalMults.push(optMult);
      intervenedMults.push(aiMult);
      mults.set(own.horseId, aiMult);
      interventionRaces += 1;
    }
    // V-9 の母集団: 全出走馬（介入のない馬は 1.00）
    for (const e of race.entrants) allMults.push(mults.get(e.horseId) ?? 1);

    // (3) 本番確定（AI 代行の介入を反映）
    const decideSeed = deriveRng(seed, STREAM.DECIDE, raceIndex).nextUint32() >>> 0;
    const result = resolveRace({
      conditions: race.conditions,
      entrants: race.entrants,
      seed: decideSeed,
      balance,
      interventionMults: mults,
    });
    const winner = result.order[0];
    if (winner === undefined) continue;

    if (winner.horseId === favorite.id) favoriteWins += 1;
    const top3 = result.order.slice(0, 3).map((o) => o.horseId);
    if (top3.includes(favorite.id)) favoriteTop3 += 1;
    fieldSizeCounts[fieldSize] = (fieldSizeCounts[fieldSize] ?? 0) + 1;
    if (winner.horseId === longshot.id) {
      longshotWins += 1;
      longshotWinsByFieldSize[fieldSize] = (longshotWinsByFieldSize[fieldSize] ?? 0) + 1;
    }

    for (let rank = 0; rank < ranked.length; rank++) {
      racesByRank[rank] = (racesByRank[rank] ?? 0) + 1;
      if (ranked[rank]?.id === winner.horseId) winsByRank[rank] = (winsByRank[rank] ?? 0) + 1;
    }

    // (4) V-8: 同じレースを「手動最適」に差し替えて勝率を比べる
    if (own !== undefined) {
      const optResult = resolveRace({
        conditions: race.conditions,
        entrants: race.entrants,
        seed: decideSeed,
        balance,
        interventionMults: new Map([[own.horseId, optMult]]),
      });
      if (result.order[0]?.horseId === own.horseId) aiWins += 1;
      if (optResult.order[0]?.horseId === own.horseId) optimalWins += 1;
    }
  }

  const denom = Math.max(1, racesForSeed);
  return {
    seed,
    races: racesForSeed,
    favoriteWinRate: favoriteWins / denom,
    favoriteTop3Rate: favoriteTop3 / denom,
    longshotWinRate: longshotWins / denom,
    winRateByRank: racesByRank.map((n, i) => (winsByRank[i] ?? 0) / Math.max(1, n)),
    interventionMeanAll: mean(allMults),
    interventionMeanIntervened: mean(intervenedMults),
    interventionMin: minOf(allMults, 1),
    interventionMax: maxOf(allMults, 1),
    aiMultMean: mean(aiMults),
    optimalMultMean: mean(optimalMults),
    aiWinRate: aiWins / Math.max(1, interventionRaces),
    optimalWinRate: optimalWins / Math.max(1, interventionRaces),
    meanF,
    durabilityGap,
    poolSize: pool.length,
    fieldSizeCounts,
    longshotWinsByFieldSize,
  };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

const GATES = {
  V4: [0.3, 0.34] as const,
  V5: [0.6, 0.65] as const,
  V6: [0.005, 0.02] as const,
  V8: [0.93, 0.97] as const,
  /** V-9a（D-014）: 不変条件。全サンプルが 0.90〜1.10。これがゲート */
  V9A_RANGE: [0.9, 1.1] as const,
  V12_F_MAX: 0.1,
  V12_DURABILITY_MIN: -0.08,
} as const;

/**
 * ★`Math.min(...xs)` は要素数が多いと `RangeError: Maximum call stack size exceeded` で落ちる。
 *   10万レース（サンプル約32万件）で実際に踏んだ。少数のスモークテストでは再現しない。
 */
function minOf(xs: readonly number[], fallback: number): number {
  let m = fallback;
  for (const x of xs) if (x < m) m = x;
  return m;
}

function maxOf(xs: readonly number[], fallback: number): number {
  let m = fallback;
  for (const x of xs) if (x > m) m = x;
  return m;
}

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : ' '.repeat(w - str.length) + str;
}

function verdict(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

function pct(x: number): string {
  return `${round(x * 100, 2)}%`;
}

const racesPerSeed = Math.max(1, Math.round(TOTAL_RACES / SEEDS.length));
const started = Date.now();

// ★R-8: 既定から外れた設定を冒頭で自己申告する
console.log(
  `レース総数=${racesPerSeed * SEEDS.length}（${SEEDS.length}シード × ${racesPerSeed}）\n` +
    `人気推定の試行数=${POPULARITY_TRIALS}（本番確定とは別系列・§9.2）\n` +
    `母集団=${POOL_GENERATIONS}ゲーム内年 × 繁殖牝馬${POOL_MARES}頭の最終年産駒\n` +
    `RACE_RANDOM_K=${balance.RACE_RANDOM_K}${RACE_K === DEFAULT_RACE_BALANCE.RACE_RANDOM_K ? "（正典 §13.1 の値）" : `（★較正値。正典 §13.1 は ${DEFAULT_RACE_BALANCE.RACE_RANDOM_K}）`} / INTERVENTION_CAP=±${ib.INTERVENTION_CAP} / クラス幅=${CLASS_BAND}\n` +
    `⚠️ 素質開放率は P3 で置き換わるプレースホルダ（0.55〜0.85）。K の較正はこの仮定に依存する`,
);
console.log('');

const results: SeedResult[] = [];
for (const seed of SEEDS) {
  const r = runSeed(seed, racesPerSeed);
  results.push(r);
  console.log(
    `seed=${pad(seed, 6)} 完了 (母集団${r.poolSize}頭) ` +
      `1番人気 勝${pct(r.favoriteWinRate)} 複${pct(r.favoriteTop3Rate)} / 最低人気 ${pct(r.longshotWinRate)}`,
  );
}
console.log('');

const favWin = mean(results.map((r) => r.favoriteWinRate));
const favTop3 = mean(results.map((r) => r.favoriteTop3Rate));
const longshot = mean(results.map((r) => r.longshotWinRate));
const multMeanAll = mean(results.map((r) => r.interventionMeanAll));
const multMeanIntervened = mean(results.map((r) => r.interventionMeanIntervened));
const multMin = Math.min(...results.map((r) => r.interventionMin));
const multMax = Math.max(...results.map((r) => r.interventionMax));
const aiMult = mean(results.map((r) => r.aiMultMean));
const optMult = mean(results.map((r) => r.optimalMultMean));
const v8Ratio = optMult === 0 ? 0 : aiMult / optMult;
const aiWin = mean(results.map((r) => r.aiWinRate));
const optWin = mean(results.map((r) => r.optimalWinRate));
const v8WinRatio = optWin === 0 ? 0 : aiWin / optWin;
const meanF = mean(results.map((r) => r.meanF));
const durabilityGap = mean(results.map((r) => r.durabilityGap));

const checks: { id: string; label: string; value: string; pass: boolean }[] = [
  {
    id: 'V-4',
    label: '1番人気の勝率 30〜34%',
    value: pct(favWin),
    pass: favWin >= GATES.V4[0] && favWin <= GATES.V4[1],
  },
  {
    id: 'V-5',
    label: '1番人気の複勝率 60〜65%',
    value: pct(favTop3),
    pass: favTop3 >= GATES.V5[0] && favTop3 <= GATES.V5[1],
  },
  {
    id: 'V-6',
    label: '最低人気の勝率 0.5〜2%',
    value: pct(longshot),
    pass: longshot >= GATES.V6[0] && longshot <= GATES.V6[1],
  },
  {
    id: 'V-8',
    label: 'AI代行 ÷ 手動最適（倍率の期待値比）93〜97%',
    value: pct(v8Ratio),
    pass: v8Ratio >= GATES.V8[0] && v8Ratio <= GATES.V8[1],
  },
  {
    // ★D-014 で V-9 は V-9a（不変条件・ゲート）と V-9b（監視・目標値なし）に分割された。
    //   旧 V-9「平均 0.99〜1.01」は §8b.3 の片側正のボーナスと両立しないため廃止。
    id: 'V-9a',
    label: '全サンプルが 0.90〜1.10 内（ハードキャップの不変条件）',
    value: `${round(multMin, 4)}〜${round(multMax, 4)}`,
    pass: multMin >= GATES.V9A_RANGE[0] && multMax <= GATES.V9A_RANGE[1],
  },
  {
    id: 'V-12a',
    label: '平均F 0.10 以下',
    value: String(round(meanF, 4)),
    pass: meanF <= GATES.V12_F_MAX,
  },
  {
    id: 'V-12b',
    label: '丈夫さの「表現型 − genotype」乖離 −8% 以内',
    value: pct(durabilityGap),
    pass: durabilityGap >= GATES.V12_DURABILITY_MIN,
  },
];

console.log(`${pad('#', 6)} ${pad('検証項目', 44)} ${pad('実測', 16)}  判定`);
console.log('-'.repeat(78));
for (const c of checks) {
  console.log(`${pad(c.id, 6)} ${pad(c.label, 44)} ${pad(c.value, 16)}  ${verdict(c.pass)}`);
}

console.log('');
console.log('--- 人気別の勝率（1番人気から・シード平均） ---');
const maxRank = Math.max(...results.map((r) => r.winRateByRank.length));
for (let rank = 0; rank < Math.min(maxRank, 18); rank++) {
  const vals = results.map((r) => r.winRateByRank[rank]).filter((v): v is number => v !== undefined);
  if (vals.length === 0) continue;
  console.log(`  ${pad(rank + 1, 2)}番人気  ${pad(pct(mean(vals)), 8)}`);
}

console.log('');
console.log('--- P-4: 出走頭数別の最低人気勝率（V-6 をプール値だけで見ない）---');
console.log('※ 正典 §10.4 は 8〜18頭。頭数分布が一様かもここで確認する');
{
  const sizes = new Set<number>();
  for (const r of results) for (const k of Object.keys(r.fieldSizeCounts)) sizes.add(Number(k));
  const sorted = [...sizes].sort((a, b) => a - b);
  let totalRaces = 0;
  for (const n of sorted) totalRaces += results.reduce((s, r) => s + (r.fieldSizeCounts[n] ?? 0), 0);
  console.log(`  ${pad('頭数', 5)} ${pad('レース数', 9)} ${pad('構成比', 8)} ${pad('最低人気勝率', 13)}`);
  for (const n of sorted) {
    const races = results.reduce((s, r) => s + (r.fieldSizeCounts[n] ?? 0), 0);
    const wins = results.reduce((s, r) => s + (r.longshotWinsByFieldSize[n] ?? 0), 0);
    const rate = races === 0 ? 0 : wins / races;
    const flag = rate < GATES.V6[0] ? '  ← 裾が死んでいる' : '';
    console.log(
      `  ${pad(n, 5)} ${pad(races, 9)} ${pad(pct(races / Math.max(1, totalRaces)), 8)} ${pad(pct(rate), 13)}${flag}`,
    );
  }
}
console.log('');
console.log('--- V-9b（監視・絶対目標値は置かない・D-014）と参考値 ---');
 console.log(
   `  V-9b 介入した馬だけの interventionMult 平均: ${round(multMeanIntervened, 4)}（時系列で監視する値）`,
 );
 console.log(`  全出走馬での平均（介入なしは1.00）: ${round(multMeanAll, 4)}`);
console.log(`  介入対象馬だけの interventionMult 平均: ${round(multMeanIntervened, 4)}`);
console.log(`  AI代行の倍率平均: ${round(aiMult, 4)} / 手動最適: ${round(optMult, 4)}`);
console.log(
  `  自馬の勝率 AI代行 ${pct(aiWin)} / 手動最適 ${pct(optWin)} → 勝率比 ${pct(v8WinRatio)}`,
);
console.log(`  シード間の 1番人気勝率のばらつき(SD): ${pct(sd(results.map((r) => r.favoriteWinRate)))}`);

const elapsed = (Date.now() - started) / 1000;
console.log('');
console.log(`所要時間: ${round(elapsed, 1)} 秒`);
const overall = checks.every((c) => c.pass);
console.log(`総合: ${verdict(overall)}`);

if (process.argv.includes('--json')) {
  // ★非有限値は文字列化する（O-7）。素の JSON.stringify だと NaN と Infinity が
  //   どちらも null になり、V-9a の範囲判定を JSON から追試できない。
  //   あわせて測定条件（自由変数）も出す（R-12: どの条件で出た数字かを機械可読に残す）
  console.log(
    toSafeJson({
      checks,
      results,
      elapsedSec: elapsed,
      // ★R-12 / Q-2: **判定に効く自由変数はすべて機械可読に残す**。
      //   pool-generations は実測で V-4 を約0.75pp 動かす（20世代 34.16% / 40世代 33.41%）。
      //   どの条件で出た数字かが JSON だけで再現できる状態にする。
      settings: {
        races: racesPerSeed * SEEDS.length,
        seeds: SEEDS,
        popularityTrials: POPULARITY_TRIALS,
        poolGenerations: POOL_GENERATIONS,
        poolMares: POOL_MARES,
        classBand: CLASS_BAND,
        unlock: UNLOCK,
        raceRandomK: RACE_K,
        fieldStrengthFloor: FIELD_STRENGTH_FLOOR,
        distanceSuitMin: DISTANCE_SUIT_MIN,
        offDistanceEntryRate: OFF_DISTANCE_ENTRY_RATE,
        offSurfaceEntryRate: OFF_SURFACE_ENTRY_RATE,
        oversampleRatio: OVERSAMPLE_RATIO,
      },
    }),
  );
}

process.exitCode = overall ? 0 : 1;
