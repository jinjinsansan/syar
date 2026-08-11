/**
 * ★V-15: 気性の集団分散がキャリア中に保たれるか（正典 §13.2・D-049）
 *
 * 正典（レビュー側新設・2026-08-11）:
 *   > **キャリア中盤の集団 SD が誕生時 SD の 50% 以上**
 *
 * 【★なぜこのゲートが要るのか】
 *   V-2e / V-2f は**誕生時の値**を見ます。だから
 *   「遺伝では散らばっているのに、育成中に全員が同じ値へ潰れる」を**検出できません**。
 *   実際 2026-08-11 に、気性が 1年弱で全馬 0 に集まっているのに
 *   **V-2e も V-2f も B-1 もテスト588件も全部通っていました**（R-16）。
 *
 *   → **誕生時ではなくキャリア中盤で測る**ゲートを別に置きます。
 *
 * 【★「キャリア中盤」の定義】
 *   調教開始 78週 と 引退 260週 の**中点 = 169週**。
 *   ★ここを動かすと判定が動くので、**測定条件として固定**します（R-14）。
 *   併せて 104 / 130 / 169 / 208 / 259 週の推移も出します
 *   （1点だけ見ると「たまたまそこだけ保たれていた」を見逃します）。
 *
 * 【★致命的故障で引退した馬の扱い】
 *   169週より前に引退した馬は「キャリア中盤の集団」にいないので**除外**します。
 *   ★除外した頭数を必ず出します。黙って除くと母集団が変わったことが分かりません。
 *
 * 【★較正の対象は `TEMPER_FLOOR_RATIO` です】
 *   このツールは**判定と実測を出すだけ**で、比率を自分で選びません。
 *   `INJURY_BASE_PROB` と同じく、定数を1行書き換えて流し直して決めます。
 *
 * 実行: npx tsx apps/cli/src/verify-v15.ts --horses 400 --seed 42
 */
import { NICKS_GEN, deriveRng, type HorseRecord, type Rng } from '@star/sim-engine';
import {
  DEFAULT_MENU, TEMPER_FLOOR_RATIO, advanceWeek, initialState, temperFloor,
  type HorseTraits, type MenuId, type TrainingState,
} from '@star/training';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
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
const HORSES = num('horses', 400);

/** ★V-15 の測定条件（R-14: 判定を作るので固定する） */
export const V15_MEASUREMENT = {
  /** キャリア中盤 = 調教開始と引退の中点 */
  midCareerWeek: (LIFECYCLE_WEEKS.trainableFrom + LIFECYCLE_WEEKS.retireAt) / 2,
  /** 推移を見る週（1点だけ見ると見逃す） */
  probeWeeks: [104, 130, 169, 208, 259] as const,
  /** 合格の下限: 誕生時 SD に対する比 */
  minRatio: 0.5,
  /** ★基準の育成方針。V-7 / V-14 と同一（別物にすると比較できない） */
  policy: 'balanced' as const,
} as const;

/** ★V-7 / V-14 / B-1 と**同一**のバランス型方針 */
function chooseMenu(week: number, fatigue: number): MenuId {
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return DEFAULT_MENU;
}

/** 1頭を回して、指定の週での気性を記録する。★引退したらそこで止める */
function temperTrace(horse: HorseRecord, idx: number): Map<number, number> {
  const traits: HorseTraits = {
    sex: horse.sex, growth: horse.growth,
    injuryRateMult: horse.injuryRateMult, birthTemper: horse.temper,
  };
  let state: TrainingState = {
    ...initialState({
      potential: horse.potential, current: horse.stats,
      durability: horse.durability, temper: horse.temper,
    }),
    ageWeeks: LIFECYCLE_WEEKS.trainableFrom,
  };
  const trace = new Map<number, number>();
  const want = new Set<number>(V15_MEASUREMENT.probeWeeks);
  while (state.retirement === null) {
    const week = state.ageWeeks;
    if (want.has(week)) trace.set(week, state.temper);
    const r = advanceWeek({
      state, traits, menu: chooseMenu(week, state.fatigue),
      // ★B-1 が通す経路と同じ条件で測る（イベント有り）。
      //   ここを false にすると「較正した経路と遊びの経路が別物」に逆戻りします
      enableEvents: true,
      rngFor: (stream: number): Rng => deriveRng(SEED, stream, idx * 1000 + week),
    });
    state = r.state;
  }
  return trace;
}

const { balance, founders } = resolveRuntimeConfig();

const pool: HorseRecord[] = [];
for (let s = 0; pool.length < HORSES; s += 1) {
  const sim = runSimulation(
    {
      seed: SEED + s * 1000, generations: POOL_GENERATIONS, population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5,
      retainFinalPopulation: true,
    },
    balance, founders, NICKS_GEN,
  );
  const got = sim.finalPopulation ?? [];
  if (got.length === 0) throw new Error(`母集団が空です（seed ${SEED + s * 1000}）`);
  pool.push(...got);
  if (s > 20) throw new Error(`シードを21本使っても ${HORSES}頭に届きません（${pool.length}頭）`);
}
pool.length = HORSES;
// ★R-21: 要求より少なければ報告せず止める
if (pool.length !== HORSES) {
  throw new Error(`要求 ${HORSES}頭に対し ${pool.length}頭しか集まりませんでした`);
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sdv = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

const birth = pool.map((h) => h.temper);
const sdBirth = sdv(birth);
const traces = pool.map((h, i) => temperTrace(h, i));

console.log(`# V-15: 気性の集団分散がキャリア中に保たれるか  seed=${SEED} horses=${pool.length}`);
console.log(`  正典: 「キャリア中盤の集団 SD が誕生時 SD の 50% 以上」`);
console.log(`  測定条件: 中盤 = ${V15_MEASUREMENT.midCareerWeek}週（78と260の中点） / 方針 = ${V15_MEASUREMENT.policy} / イベント有`);
console.log(`  ★較正対象: TEMPER_FLOOR_RATIO = ${TEMPER_FLOOR_RATIO}`);
console.log('');
console.log(`  誕生時: 平均 ${mean(birth).toFixed(2)}  SD ${sdBirth.toFixed(3)}  ` +
  `（下限の平均 ${mean(pool.map((h) => temperFloor(h.temper))).toFixed(2)}）`);
console.log('');
console.log(`  ${'週'.padStart(5)} ${'頭数'.padStart(6)} ${'平均'.padStart(8)} ${'SD'.padStart(8)} ${'SD比'.padStart(8)}`);

let midRatio = NaN;
let midAlive = 0;
for (const w of V15_MEASUREMENT.probeWeeks) {
  const vals = traces.map((t) => t.get(w)).filter((v): v is number => v !== undefined);
  if (vals.length === 0) {
    console.log(`  ${String(w).padStart(5)} ${'0'.padStart(6)}  ★この週に残っている馬がいません`);
    continue;
  }
  const sd = sdv(vals);
  const ratio = sd / sdBirth;
  const mark = w === V15_MEASUREMENT.midCareerWeek ? ' ←中盤' : '';
  console.log(
    `  ${String(w).padStart(5)} ${String(vals.length).padStart(6)} ` +
    `${mean(vals).toFixed(2).padStart(8)} ${sd.toFixed(3).padStart(8)} ` +
    `${(ratio * 100).toFixed(1).padStart(7)}%${mark}`,
  );
  if (w === V15_MEASUREMENT.midCareerWeek) { midRatio = ratio; midAlive = vals.length; }
}

const dropped = pool.length - midAlive;
console.log('');
console.log(`  ★中盤(${V15_MEASUREMENT.midCareerWeek}週)より前に引退した馬: ${dropped} 頭（致命的故障・§7.5）`);
console.log(`     → 中盤の集団は ${midAlive} 頭。★黙って除いていないことの確認`);
console.log('');

const pass = midRatio >= V15_MEASUREMENT.minRatio;
console.log(
  pass
    ? `★V-15: PASS — 中盤の SD は誕生時の ${(midRatio * 100).toFixed(1)}%（下限 ${V15_MEASUREMENT.minRatio * 100}%）`
    : `★V-15: FAIL — 中盤の SD は誕生時の ${(midRatio * 100).toFixed(1)}%（下限 ${V15_MEASUREMENT.minRatio * 100}%に届かない）`,
);
console.log(`  ★TEMPER_FLOOR_RATIO = ${TEMPER_FLOOR_RATIO} での実測です。比率を変えて流し直して較正してください`);
process.exit(pass ? 0 : 1);
