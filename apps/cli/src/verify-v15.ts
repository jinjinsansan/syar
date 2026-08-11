/**
 * ★V-15: 気性の集団分散がキャリア中に保たれるか（正典 §13.2・D-049）
 *
 * 正典（レビュー側新設・2026-08-11 / 両側化 同日）:
 *   > ① **キャリア中盤の集団 SD が誕生時 SD の 50% 以上**
 *   > ② **キャリアを通じた平均低下が 15% 以上**
 *
 * 【★なぜ両側なのか】
 *   ①だけだと、**最大余裕を与える状態が「比率 1.0 ＝ 気性の変化が一度も起きない世界」**でした。
 *   V-12a（上限のみ → F≒0 ＝ 近交の機構が一度も働かない世界）と同じ型です。
 *   → **機構を止めるとゲートが最もよく通る**形を、②で塞ぎます。
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
  /** ①合格の下限: 誕生時 SD に対する比 */
  minSdRatio: 0.5,
  /** ★②合格の下限: キャリアを通じた平均低下（機構が働いていることの担保） */
  minDecline: 0.15,
  /** 測る方針（★①は最悪、②は代表。§理由は下） */
  policies: ['neglect', 'balanced', 'hard_only'] as const,
  /** ②の代表方針。V-7 / V-14 の錨と揃える */
  representative: 'balanced' as const,
} as const;

export type Policy = (typeof V15_MEASUREMENT.policies)[number];

/** ★V-7 / V-14 / B-1 と**同一**の3方針（別物にすると比較できない） */
function chooseMenu(policy: Policy, week: number, fatigue: number): MenuId {
  if (policy === 'neglect') return DEFAULT_MENU;
  if (policy === 'hard_only') return fatigue >= 85 ? 'rest' : 'hard';
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return DEFAULT_MENU;
}

interface TemperTrace {
  /** 指定の週での気性（引退後は入らない） */
  readonly at: Map<number, number>;
  /** ★キャリアを通じた平均の気性（②の分子） */
  readonly careerMean: number;
  /** 引退時点の気性 */
  readonly end: number;
  readonly birth: number;
}

/** 1頭を回して気性の推移を記録する。★引退したらそこで止める */
function temperTrace(horse: HorseRecord, idx: number, policy: Policy): TemperTrace {
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
  const at = new Map<number, number>();
  const want = new Set<number>(V15_MEASUREMENT.probeWeeks);
  let sum = 0;
  let weeks = 0;
  while (state.retirement === null) {
    const week = state.ageWeeks;
    if (want.has(week)) at.set(week, state.temper);
    // ★キャリアを通じた平均（②）。進める前の値を積む
    sum += state.temper;
    weeks += 1;
    const r = advanceWeek({
      state, traits, menu: chooseMenu(policy, week, state.fatigue),
      // ★B-1 が通す経路と同じ条件で測る（イベント有り）。
      //   ここを false にすると「較正した経路と遊びの経路が別物」に逆戻りします
      enableEvents: true,
      rngFor: (stream: number): Rng => deriveRng(SEED, stream, idx * 1000 + week),
    });
    state = r.state;
  }
  return {
    at,
    careerMean: weeks > 0 ? sum / weeks : horse.temper,
    end: state.temper,
    birth: horse.temper,
  };
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

/** 方針ごとの実測 */
const byPolicy = new Map<Policy, TemperTrace[]>(
  V15_MEASUREMENT.policies.map((p) => [p, pool.map((h, i) => temperTrace(h, i, p))]),
);

console.log(`# V-15: 気性が育成中に死なないか（両側・D-049）  seed=${SEED} horses=${pool.length}`);
console.log('  正典: ① キャリア中盤の集団 SD が誕生時 SD の 50% 以上');
console.log('        ② キャリアを通じた平均低下が 15% 以上');
console.log(`  ★①は**最悪の方針**で判定します（安全性は「ある遊び方をした人だけ壊れる」を許さない）`);
console.log(`  ★②は**代表方針（${V15_MEASUREMENT.representative}）**で判定します（理由は下の【★】）`);
console.log(`  ★較正対象: TEMPER_FLOOR_RATIO = ${TEMPER_FLOOR_RATIO}`);
console.log('');
console.log(`  誕生時: 平均 ${mean(birth).toFixed(2)}  SD ${sdBirth.toFixed(3)}  ` +
  `（下限の平均 ${mean(pool.map((h) => temperFloor(h.temper))).toFixed(2)}）`);
console.log('');

interface PolicyResult {
  readonly policy: Policy;
  readonly sdRatio: number;
  readonly alive: number;
  readonly declineCareer: number;
  readonly declineEnd: number;
  readonly declineMid: number;
}

const results: PolicyResult[] = [];
console.log('  【方針ごとの実測】');
console.log(
  `  ${'方針'.padEnd(14)} ${'中盤SD比'.padStart(10)} ${'中盤頭数'.padStart(9)} ` +
  `${'低下(キャリア平均)'.padStart(18)} ${'低下(中盤)'.padStart(11)} ${'低下(引退時)'.padStart(12)}`,
);
for (const policy of V15_MEASUREMENT.policies) {
  const ts = byPolicy.get(policy)!;
  const mid = ts.map((t) => t.at.get(V15_MEASUREMENT.midCareerWeek))
    .filter((v): v is number => v !== undefined);
  const sdRatio = sdv(mid) / sdBirth;
  // ★低下率は**1頭ずつ**求めてから平均する（集団平均の比だと大きい馬に引っぱられる）
  const declineCareer = mean(ts.map((t) => (t.birth > 0 ? 1 - t.careerMean / t.birth : 0)));
  const declineEnd = mean(ts.map((t) => (t.birth > 0 ? 1 - t.end / t.birth : 0)));
  const midByHorse = ts
    .map((t) => { const v = t.at.get(V15_MEASUREMENT.midCareerWeek); return v === undefined || t.birth <= 0 ? null : 1 - v / t.birth; })
    .filter((v): v is number => v !== null);
  const declineMid = mean(midByHorse);
  results.push({ policy, sdRatio, alive: mid.length, declineCareer, declineEnd, declineMid });
  console.log(
    `  ${policy.padEnd(14)} ${`${(sdRatio * 100).toFixed(1)}%`.padStart(10)} ${String(mid.length).padStart(9)} ` +
    `${`${(declineCareer * 100).toFixed(1)}%`.padStart(18)} ${`${(declineMid * 100).toFixed(1)}%`.padStart(11)} ` +
    `${`${(declineEnd * 100).toFixed(1)}%`.padStart(12)}`,
  );
}
console.log(`  ★中盤より前に引退した馬は除外しています（致命的故障・§7.5）。頭数は上の列のとおり`);
console.log('');

// ── ① 最悪の方針で判定 ──────────────────────────────────
const worst1 = results.reduce((a, b) => (b.sdRatio < a.sdRatio ? b : a));
const g1 = worst1.sdRatio >= V15_MEASUREMENT.minSdRatio;
console.log(
  `  ★① 中盤の集団SD ≥ 誕生時の ${V15_MEASUREMENT.minSdRatio * 100}%  ` +
  `最悪の方針 ${worst1.policy}: ${(worst1.sdRatio * 100).toFixed(1)}%  ${g1 ? 'PASS' : 'FAIL'}`,
);

// ── ② 代表方針で判定 + 最悪も出す ───────────────────────
const rep = results.find((r) => r.policy === V15_MEASUREMENT.representative)!;
const worst2 = results.reduce((a, b) => (b.declineCareer < a.declineCareer ? b : a));
const g2 = rep.declineCareer >= V15_MEASUREMENT.minDecline;
console.log(
  `  ★② キャリアを通じた平均低下 ≥ ${V15_MEASUREMENT.minDecline * 100}%  ` +
  `代表方針 ${rep.policy}: ${(rep.declineCareer * 100).toFixed(1)}%  ${g2 ? 'PASS' : 'FAIL'}`,
);
// ★最悪方針で読んだ場合の判定も出す。どちらの読みでも結論が変わらないなら、
//   照会の答えを待たずに進めます（変わるなら止めます）
const g2worst = worst2.declineCareer >= V15_MEASUREMENT.minDecline;
console.log(
  `     ★最悪の方針 ${worst2.policy} で読んだ場合: ${(worst2.declineCareer * 100).toFixed(1)}%  ${g2worst ? 'PASS' : 'FAIL'}` +
  `  → 読みの違いで結論は${g2 === g2worst ? '**変わりません**' : '★変わります（裁定が要る）'}`,
);
console.log(
  `  【要約】① 最悪 ${(worst1.sdRatio * 100).toFixed(1)}% / ② 代表 ${(rep.declineCareer * 100).toFixed(1)}% ` +
  `最悪 ${(worst2.declineCareer * 100).toFixed(1)}%  ratio=${TEMPER_FLOOR_RATIO}`,
);

console.log('');
console.log('  【★①と②は「最悪の方針」が逆向きです（照会 Q-P3-28）】');
console.log(`    ① が最も厳しいのは**休養の多い方針**（${worst1.policy}）— 下限に速く収束するほど SD が縮む`);
console.log(`    ② が最も厳しいのは**休養の少ない方針**（${worst2.policy}）— そもそも temperDelta を引かない`);
console.log('    ★放置（軽め調整のみ）は §7.2 の temperDelta が 0 のメニューしか使わないので、');
console.log('      気性は故障休養の週しか動きません。**機構が壊れているのではなく、プレイヤーが使っていない**状態です。');
console.log('      → ②を最悪方針で測ると「使わなかった人がいるから機構が死んでいる」と判定してしまいます。');
console.log(`      ここでは②を代表方針（${V15_MEASUREMENT.representative}）で判定しました。裁定を仰ぎます。`);

console.log('');
const pass = g1 && g2;
console.log(pass ? '★V-15: PASS' : '★V-15: FAIL');
console.log(`  ★TEMPER_FLOOR_RATIO = ${TEMPER_FLOOR_RATIO} での実測です`);
process.exit(pass ? 0 : 1);
