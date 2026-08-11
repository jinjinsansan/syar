/**
 * ★V-4 が動いた理由を「上位の分離」で測る（判定を出さない診断・Q-P3-36）
 *
 * 【なぜ測る量を変えるのか（レビュー側の指摘）】
 *   > V-4 は「1番人気が勝つ確率」なので、効くのは集団全体のばらつきではなく
 *   > **上位の分離**です。変動係数は、**最下位が極端に弱いだけでも上がります**。
 *
 *   こちらは①→②で変動係数が 11.55% → 12.82% と**増えた**のに V-4 が**下がった**、
 *   と報告しました。★測っていた量が V-4 に対応していませんでした。
 *
 * 【測る量】
 *   ① **最強馬と2位の能力差**（レース内・平均能力で正規化）
 *   ② **上位3頭の中でのばらつき**（同じく正規化）
 *   ③ 参考: 下位の裾（最弱馬が平均からどれだけ下か）
 *      — 変動係数が何で上がったのかの確認
 *
 *   ★①が下がっていれば、それが V-4 の低下そのものです。仮説は要りません。
 *
 * 実行: npx tsx apps/cli/src/diag-topgap.ts --races 600 --seed 42
 */
import { ABILITY_KEYS, NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { buildTrainingStateSampler } from './training-state.js';
import { generateRace, sortPoolByClass } from './race-field.js';
import { resolveRuntimeConfig } from './config.js';
import { runSimulation } from './simulator.js';
import { POOL_GENERATIONS, POOL_MARES } from './measurement.js';

const argv = process.argv.slice(2);
const num = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const SEED = num('seed', 42);
const RACES = num('races', 600);

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5,
    retainFinalPopulation: true,
  },
  balance, founders, NICKS_GEN,
);
const pool: readonly HorseRecord[] = sortPoolByClass(sim.finalPopulation ?? []);
if (pool.length === 0) throw new Error('母集団の取得に失敗');

const mean = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: readonly number[]): number => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

interface Row {
  readonly label: string;
  /** 最強と2位の差 ÷ レース平均能力 */
  readonly topGap: number[];
  /** 上位3頭の SD ÷ レース平均能力 */
  readonly top3Sd: number[];
  /** (平均 − 最弱) ÷ レース平均能力 */
  readonly bottomTail: number[];
  /** 参考: 全体の変動係数（前便で測ったもの） */
  readonly cv: number[];
}

function measure(label: string, real: boolean): Row {
  const sampler = buildTrainingStateSampler(pool, SEED);
  const rng = deriveRng(SEED, 61);
  const out: Row = { label, topGap: [], top3Sd: [], bottomTail: [], cv: [] };
  for (let i = 0; i < RACES; i += 1) {
    const race = generateRace(
      pool, i, rng, undefined, undefined, undefined,
      real ? { abilityOf: (h) => sampler.stateOf(h)?.stats } : {},
    );
    sampler.advance();
    // ★「総合力」は5能力の和。V-4 は勝率なので、順位付けできる1つの量にまとめる
    const totals = race.entrants
      .map((e) => ABILITY_KEYS.reduce((a, k) => a + e.stats[k], 0))
      .sort((a, b) => b - a);
    if (totals.length < 4) continue;
    const m = mean(totals);
    if (m <= 0) continue;
    out.topGap.push((totals[0]! - totals[1]!) / m);
    out.top3Sd.push(sd(totals.slice(0, 3)) / m);
    out.bottomTail.push((m - totals[totals.length - 1]!) / m);
    out.cv.push(sd(totals) / m);
  }
  return out;
}

const rows = [measure('① 仮定値（0.55〜0.85）', false), measure('② 実データの能力', true)];

console.log(`# V-4 が動いた理由を「上位の分離」で測る  seed=${SEED} races=${RACES}`);
console.log('  ★判定は出しません。V-4 に対応する量を測り直すだけです（Q-P3-36）');
console.log('');
console.log(
  `  ${'条件'.padEnd(24)} ${'①最強-2位'.padStart(11)} ${'②上位3のSD'.padStart(12)} ` +
  `${'③下位の裾'.padStart(11)} ${'参考:全体CV'.padStart(12)}`,
);
for (const r of rows) {
  console.log(
    `  ${r.label.padEnd(22)} ${`${(mean(r.topGap) * 100).toFixed(2)}%`.padStart(11)} ` +
    `${`${(mean(r.top3Sd) * 100).toFixed(2)}%`.padStart(12)} ` +
    `${`${(mean(r.bottomTail) * 100).toFixed(2)}%`.padStart(11)} ` +
    `${`${(mean(r.cv) * 100).toFixed(2)}%`.padStart(12)}`,
  );
}
console.log('');
const [a, b] = rows;
const d = (f: (r: Row) => number[]): string => {
  const x = mean(f(a!)) * 100;
  const y = mean(f(b!)) * 100;
  return `${(y - x >= 0 ? '+' : '')}${(y - x).toFixed(2)}pt（${x.toFixed(2)}% → ${y.toFixed(2)}%）`;
};
console.log('  【①→②の差】');
console.log(`    最強と2位の差   : ${d((r) => r.topGap)}   ★これが下がっていれば V-4 の低下そのもの`);
console.log(`    上位3頭の SD    : ${d((r) => r.top3Sd)}`);
console.log(`    下位の裾        : ${d((r) => r.bottomTail)}   ★全体 CV が何で上がったかの確認`);
console.log(`    参考: 全体 CV   : ${d((r) => r.cv)}`);
console.log('');
console.log('  ★全体 CV が上がりながら「最強と2位の差」が縮んでいれば、');
console.log('    **下位の裾が伸びただけで、上位の分離は落ちている**ということです。');
