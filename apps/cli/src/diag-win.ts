/**
 * A-3 切り分け: 単勝の払戻率が 82% にならない理由を直接測る。
 *
 * 【なぜ単勝に絞るか】
 *   cap 0% / 未発売的中 0（被覆完全）/ 凸性は上振れ方向 — **下振れの説明が3つとも消えた**。
 *   券種の集計を挟まず、**MC が予測した勝率と確定側の実際の勝率**を突き合わせる。
 *   両者が一致すれば払戻率は恒等的に 82% になるので、ずれていれば場所が分かる。
 *
 * 【測る量】
 *   各レースで MC 勝率 p̂ を出し、確定側の勝者の p̂ を記録する。
 *   同分布なら E[p̂(勝者)] = Σ p̂ᵢ² が成り立つ（自己無撞着性）。
 *   さらに p̂ を層に分け、**層ごとの予測勝率と実現勝率**を比べる（較正曲線）。
 */
import { NICKS_GEN, deriveRng } from '@star/sim-engine';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceEntrant } from '@star/race-engine';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';
import { VERIFY_PAYOUT_STREAM as S } from '@star/sim-engine';

const argv = process.argv.slice(2);
const num = (n: string, d: number) => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const RACES = num('races', 400);
const MC = num('odds-trials', 4000);

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  { seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
);
const pool = sortPoolByClass(sim.finalPopulation ?? []);

const winnerOf = (conditions: never, entrants: RaceEntrant[], seed: number): number => {
  const r = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  return Number(r.order[0]!.horseId.replace(/^H/, ''));
};

/** 較正曲線の層（予測勝率の帯） */
const BINS = [0, 0.02, 0.05, 0.08, 0.12, 0.18, 0.3, 1];
const bin = { pred: new Array(BINS.length - 1).fill(0), actual: new Array(BINS.length - 1).fill(0), n: new Array(BINS.length - 1).fill(0) };

let sumPhatOfWinner = 0;
let sumPhatSq = 0;
let sumInvPhatOfWinner = 0;
let fields = 0;
/** ★売られた頭数（MC で1回以上勝った馬）。恒等式の分母はこちらでなければならない */
let sold = 0;
/** MC で1回も勝たなかった馬が実際に勝った回数 */
let unsoldWins = 0;
const contribSum = new Array(7).fill(0);
const contribN = new Array(7).fill(0);
const binOf = (v: number): number =>
  BINS.findIndex((_, j) => j < BINS.length - 1 && v >= BINS[j]! && v < BINS[j + 1]!);

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
  const phat = new Map<number, number>();
  for (const [h, c] of wins) phat.set(h, c / MC);
  for (const v of phat.values()) sumPhatSq += v * v;

  const actual = winnerOf(conditions, entrants, deriveRng(SEED, S.FINAL, i).nextUint32());
  const pw = phat.get(actual) ?? 0;
  sumPhatOfWinner += pw;
  if (pw > 0) sumInvPhatOfWinner += 1 / pw;
  fields += entrants.length;
  sold += phat.size;
  if (pw === 0) unsoldWins += 1;
  if (pw > 0) { const b = binOf(pw); if (b >= 0) contribSum[b] += 1 / pw; }
  for (let k = 1; k <= entrants.length; k += 1) { const b = binOf(phat.get(k) ?? -1); if (b >= 0) contribN[b] += 1; }

  // 較正曲線: 各馬について「予測勝率」と「実際に勝ったか」を層に積む
  for (let k = 1; k <= entrants.length; k += 1) {
    const p = phat.get(k) ?? 0;
    const b = BINS.findIndex((_, j) => j < BINS.length - 1 && p >= BINS[j]! && p < BINS[j + 1]!);
    if (b < 0) continue;
    bin.pred[b] += p;
    bin.actual[b] += actual === k ? 1 : 0;
    bin.n[b] += 1;
  }
}

console.log(`# 単勝の較正診断  seed=${SEED} races=${RACES} MC=${MC}`);
console.log(`  平均出走頭数 ${(fields / RACES).toFixed(2)}`);
console.log(`\n  ★自己無撞着性: 同分布なら E[p̂(勝者)] = Σp̂² が成り立つ`);
console.log(`    E[p̂(勝者)] = ${(sumPhatOfWinner / RACES).toFixed(4)}`);
console.log(`    Σp̂²/R      = ${(sumPhatSq / RACES).toFixed(4)}`);
console.log(`\n  ★払戻率 = 0.82 × E[1/p̂(勝者)] / 平均頭数`);
console.log(`    E[1/p̂(勝者)] = ${(sumInvPhatOfWinner / RACES).toFixed(3)}  （一致するなら平均頭数と等しい）`);
console.log(`    払戻率(頭数で割る) = ${((0.82 * (sumInvPhatOfWinner / RACES)) / (fields / RACES) * 100).toFixed(2)}%`);
console.log(`
  ★分母は**売られた頭数**でなければならない（未発売の馬は買えないので賭け金に入らない）`);
console.log(`    平均売り目数 ${(sold / RACES).toFixed(3)}  未発売馬の勝利 ${unsoldWins}回（${((unsoldWins / RACES) * 100).toFixed(2)}%）`);
console.log(`    払戻率(売り目で割る) = ${((0.82 * (sumInvPhatOfWinner / RACES)) / (sold / RACES) * 100).toFixed(2)}%`);

// ★機構を推測せず、不足がどこから来ているかを直接分解する。
//   恒等式 Σ pi/p̂i = 売り目数 は、各馬が 1 ずつ寄与することを意味する。
//   p̂ の帯ごとに寄与の合計と頭数を並べれば、1 を下回っている帯が不足の出どころ。
//   ⚠️ 較正曲線（平均の比較）では見えない。恒等式は 1/p̂ で重み付いた和なので、
//      帯の平均が一致していても比で重み付けた和は一致しない（R-16 と同じ形）。
console.log(`
  ★寄与の分解: 各帯は「頭数ぶんの寄与」を出すはず`);
console.log(`    ${"帯".padEnd(14)} ${"寄与合計".padStart(10)} ${"期待(頭数)".padStart(11)} ${"差".padStart(9)}`);
{
  let deficit = 0;
  for (let b = 0; b < BINS.length - 1; b += 1) {
    if (contribN[b] === 0) continue;
    const exp = contribN[b] / RACES;
    const got = contribSum[b] / RACES;
    deficit += got - exp;
    const label = `${(BINS[b]! * 100).toFixed(0)}〜${(BINS[b + 1]! * 100).toFixed(0)}%`;
    console.log(`    ${label.padEnd(14)} ${got.toFixed(3).padStart(10)} ${exp.toFixed(3).padStart(11)} ${(got - exp).toFixed(3).padStart(9)}`);
  }
  console.log(`    合計の差 ${deficit.toFixed(3)}`);
}
console.log(`\n  ★較正曲線（予測 vs 実現）`);
console.log(`    ${'帯'.padEnd(14)} ${'予測'.padStart(8)} ${'実現'.padStart(8)} ${'頭数'.padStart(7)}`);
for (let b = 0; b < BINS.length - 1; b += 1) {
  if (bin.n[b] === 0) continue;
  const label = `${(BINS[b]! * 100).toFixed(0)}〜${(BINS[b + 1]! * 100).toFixed(0)}%`;
  console.log(
    `    ${label.padEnd(14)} ${((bin.pred[b] / bin.n[b]) * 100).toFixed(2).padStart(7)}% ` +
      `${((bin.actual[b] / bin.n[b]) * 100).toFixed(2).padStart(7)}% ${String(bin.n[b]).padStart(7)}`,
  );
}
