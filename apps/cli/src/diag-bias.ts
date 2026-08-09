/**
 * ★恒等式の予測値を計算する（測定ではない）。
 *
 * 【何をするものか】
 *   レビュー側が導いた恒等式
 *
 *     払戻率 = (1 − margin) × [ 1 + (1/n) Σᵢ (1 − pᵢ) / (M·pᵢ) ]
 *
 *   の角括弧の中を、**手元の MC 出力から直接計算**します。
 *   これは仮説ではなく、`p̂ = c/M`（c 〜 Binomial(M, p)）の
 *   `E[1/p̂]` を2次まで展開した恒等式です。
 *
 *     E[1/p̂(勝者)] = Σᵢ pᵢ · E[1/p̂ᵢ] ≈ Σᵢ (1 + (1−pᵢ)/(M·pᵢ)) = n + Σᵢ (1−pᵢ)/(M·pᵢ)
 *
 *   角括弧の中は**必ず 1 より大きい**ので、払戻率は構造的に目標を上回ります。
 *   A-3 で全10シードが上振れし、下振れが1つも無かったのはこの帰結です。
 *
 * 【★races を多く取る必要がありません】
 *   `diag-win.ts` の前提条件 `races ≧ M/4`（R-21）は**払戻率の推定**を守るものです。
 *   1/p 級の稀な馬が一度も勝てないと分子だけが落ちて機械的に下振れするからで、
 *   そこは**勝者**という稀な事象の標本数が効きます。
 *
 *   ここで計算するのは**全出走馬にわたる (1−p̂)/(M·p̂) の平均**で、
 *   勝者を引く必要がありません。1レースあたり14頭ぶん積み上がるので、
 *   数百レースで十分に収束します。**同じ理由の前提を機械的に持ち込みません。**
 *
 * 【★プールの取り方を測定側と揃える】
 *   `diag-win.ts` の払戻率は
 *     0.82 × (Σ_r 1/p̂(勝者_r)) / (Σ_r 売り目数_r)
 *   と**総和どうしの比**で出しています。予測もこれに合わせ、
 *   レースごとの平均をさらに平均するのではなく、**総和どうしの比**を取ります
 *   （頭数がレースで異なるので、両者は一致しません）。
 */
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const RACES = num('races', 400);
const MC = num('odds-trials', 4000);

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
const pool = sortPoolByClass(sim.finalPopulation ?? []);

const winnerOf = (conditions: never, entrants: RaceEntrant[], seed: number): number => {
  const r = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  return Number(r.order[0]!.horseId.replace(/^H/, ''));
};

/** 帯ごとに寄与を分ける（どこが効いているかを見るため。判定には使わない） */
const BINS = [0, 0.02, 0.05, 0.08, 0.12, 0.18, 0.3, 1] as const;
const binBias = new Array<number>(BINS.length - 1).fill(0);
const binN = new Array<number>(BINS.length - 1).fill(0);
const binOf = (v: number): number =>
  BINS.findIndex((_, j) => j < BINS.length - 1 && v >= BINS[j]! && v < BINS[j + 1]!);

let sumBias = 0;
let sold = 0;
let fields = 0;
/** ★MC で1回も勝てず「売られない」馬。恒等式の n から外れる */
let unsold = 0;

for (let i = 0; i < RACES; i += 1) {
  const race = generateRace(pool, i, deriveRng(SEED, S.FIELD, i));
  const entrants: RaceEntrant[] = race.entrants.map((e, k) => ({ ...e, horseId: `H${k + 1}` }));
  const conditions = race.conditions as never;

  const wins = new Map<number, number>();
  const oddsRng = deriveRng(SEED, S.ODDS, i);
  for (let t = 0; t < MC; t += 1) {
    const w = winnerOf(conditions, entrants, oddsRng.nextUint32());
    wins.set(w, (wins.get(w) ?? 0) + 1);
  }

  fields += entrants.length;
  unsold += entrants.length - wins.size;
  for (const c of wins.values()) {
    const p = c / MC;
    const bias = (1 - p) / (MC * p);
    sumBias += bias;
    sold += 1;
    const b = binOf(p);
    if (b >= 0) {
      binBias[b]! += bias;
      binN[b]! += 1;
    }
  }
}

// ★R-21: 読み取れない量で判定しない
if (sold === 0) throw new Error('売り目が1つもありません。測定が成立していません');
if (Math.abs(sumBias - binBias.reduce((a, b) => a + b, 0)) > 1e-9) {
  throw new Error('帯の合計が総和と一致しません（帯の定義が出力を取りこぼしています）');
}

const meanBias = sumBias / sold;
console.log(`# 恒等式の予測値  seed=${SEED} races=${RACES} M=${MC}`);
console.log(`  平均出走頭数 ${(fields / RACES).toFixed(2)}  平均売り目数 ${(sold / RACES).toFixed(2)}  売られない馬 ${unsold}頭`);
console.log('');
console.log(`  ★(1/n) Σ (1−p̂)/(M·p̂) = ${meanBias.toFixed(6)}`);
console.log(`  ★予測される払戻率 = 82% × (1 + ${meanBias.toFixed(6)}) = ${(82 * (1 + meanBias)).toFixed(2)}%`);
console.log(`  ★予測される乖離   = +${(82 * meanBias).toFixed(2)}pt`);
console.log('');
console.log(`  帯ごとの寄与（判定には使わない）`);
console.log(`    ${'帯'.padEnd(14)} ${'頭数'.padStart(8)} ${'寄与合計'.padStart(10)} ${'全体に占める'.padStart(12)}`);
for (let b = 0; b < BINS.length - 1; b += 1) {
  if (binN[b] === 0) continue;
  const label = `${(BINS[b]! * 100).toFixed(0)}〜${(BINS[b + 1]! * 100).toFixed(0)}%`;
  console.log(
    `    ${label.padEnd(14)} ${String(binN[b]).padStart(8)} ${binBias[b]!.toFixed(3).padStart(10)} ` +
      `${((binBias[b]! / sumBias) * 100).toFixed(1).padStart(11)}%`,
  );
}
