/**
 * ★V-14（D-044 で新設）— 育成の効きを**結果で**測る
 *
 * ★D-048 で改訂（旧: 放置 55〜75% かつ 適切な育成 90%以上）。
 *
 * | # | 基準 |
 * |---|---|
 * | ① | **適切な育成が 88%以上**（水準の錨） |
 * | ② | **適切な育成 − 放置 が 12pt 以上**（★これが「デイリー来訪の動機」の本体） |
 * | ③ | **同一 EP 予算下**で追い切り偏重がバランス型を大きく上回らない（D-047）
 * |   | ★**水準の差ではありません。** EP あたり開放率の比で見ます |
 *
 * 【★なぜ旧定義が満たせなかったか】
 *   実質的な自由度は `BASE_GAIN` **1つ**でした。放置は `BASE_GAIN × 0.3` で一意に決まるので、
 *   **放置を帯に入れた時点で `BASE_GAIN` が決まり**、バランス型は
 *   **残り26%の週（`MAIN_EFFECT_COEF` が効く48週/182週）**でしか動かせません。
 *   **1つの自由度に2つの絶対水準を要求していた**ため、構成上満たせませんでした。
 *
 * 【★差は BASE_GAIN によらず不変でした — そこが本質】
 *   BASE 7.4: 89.3 − 73.7 = 15.6pt / BASE 7.8: 90.5 − 75.2 = 15.3pt
 *   §7.1 が求めるのは「指示を出さない週は成長が鈍る＝デイリー来訪の動機」で、
 *   **動機は差**です。放置馬が何%に着地するかは、プレイヤーの意思決定に影響しません。
 *   ★ただし水準の錨を1つ残します（差だけだと 40%/55% でも通り、
 *     「育て切った」実感が消えるため）。
 *
 * 【★なぜ係数ではなく結果をゲートにするのか】
 *   係数の値が正しいかは誰にも分かりませんが、**満たすべき結果は決められます**。
 *   3つ目は**支配戦略を作らない**ためです — 追い切りは主効果の3.5倍なので、
 *   **故障率2.2倍と疲労+32 が相殺していなければ、他のメニューが存在しないのと同じ**になります。
 *
 * 【★R-20: 1頭の一生は単一実現】
 *   1頭で判定してはいけません。**多数の馬を通し、キャリア間のばらつき（SD）も出します。**
 *
 * 実行: npm run verify:v14 -- --horses 400 --seed 42
 */
import {
  ABILITY_KEYS, NICKS_GEN, deriveRng, type AbilityKey, type HorseRecord, type Rng,
} from '@star/sim-engine';
import {
  DEFAULT_MENU, MENU_IDS, advanceWeek, initialState, menuCoef,
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

/** ★週進行の乱数の用途ID。既存4表（1〜52）と重ならない 61〜 の帯（指示書 §2） */

/** 育成方針 */
type Policy = 'neglect' | 'balanced' | 'hard_only';

/**
 * その週のメニューを決める。
 * ★放置は「指示を出さない週＝軽め調整」（§7.1）。
 */
function chooseMenu(policy: Policy, week: number, fatigue: number): MenuId {
  if (policy === 'neglect') return DEFAULT_MENU;
  if (policy === 'hard_only') {
    // ★追い切り偏重。疲労が振り切れたら休むしかない（そうしないと確実に故障する）
    return fatigue >= 85 ? 'rest' : 'hard';
  }
  // バランス型: 疲労を見ながら回す
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return 'light';
}

interface CareerResult {
  /** 引退時の素質開放率（current/potential の平均） */
  readonly unlock: number;
  readonly injuries: number;
  readonly careerEnded: boolean;
  readonly epSpent: number;
  /** 現役週数（早期引退なら短い） */
  readonly weeks: number;
  /** ★分解用: メニュー別の週数 */
  readonly menuWeeks: Record<MenuId, number>;
  /** ★分解用: 故障の休養に費やした週数 */
  readonly injuryRestWeeks: number;
  /** ★分解用: 調子の平均 */
  readonly conditionMean: number;
  /** ★分解用: 疲労の平均 */
  readonly fatigueMean: number;
  /** ★分解用: 恒久ダメージで失われた potential の割合 */
  readonly potentialLost: number;
}

/**
 * 1頭を78週から260週まで通す。
 *
 * ★**`advanceWeek`（週送りの合成器）を通します**（2026-08-11 の載せ替え）。
 *   以前はこの関数が**自前の週ループ**を持っており、
 *   - §7.6 のイベントを一度も引かない
 *   - §7.2 の気性変化（temperDelta）を適用しない
 *   状態で測っていました。**較正した経路と、遊びの経路が別物**だったということです。
 *   R-23 は「いつの証拠か」でしたが、これは「**どの経路の証拠か**」の失効です。
 *
 * ★平均の取り方を旧ループに合わせています（調子・疲労は**その週を進める前**の値）。
 *   ここを後の値に変えると、載せ替え以外の理由で数字が動きます。
 */
function runCareer(horse: HorseRecord, policy: Policy, horseIndex: number): CareerResult {
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

  let injuries = 0;
  let epSpent = 0;
  const menuWeeks = Object.fromEntries(MENU_IDS.map((m) => [m, 0])) as Record<MenuId, number>;
  const potential0 = { ...horse.potential } as Record<AbilityKey, number>;
  let injuryRestWeeks = 0;
  let condSum = 0;
  let fatSum = 0;
  let weeksCounted = 0;

  while (state.retirement === null) {
    const week = state.ageWeeks;
    // ★進める「前」の値を積む（旧ループと同じ）
    condSum += state.condition;
    fatSum += state.fatigue;
    weeksCounted += 1;

    const r = advanceWeek({
      state,
      traits,
      menu: chooseMenu(policy, week, state.fatigue),
      // ★B-1 が通す経路と同じ条件で測る。false に戻すと
      //   「較正した経路と遊びの経路が別物」に逆戻りします
      enableEvents: true,
      rngFor: (stream: number): Rng => deriveRng(SEED, stream, horseIndex * 1000 + week),
    });
    menuWeeks[r.log.menu] += 1;
    if (r.log.resting) injuryRestWeeks += 1;
    if (r.log.injury !== null) injuries += 1;
    epSpent += r.log.epSpent;
    state = r.state;
  }

  const { potential, current } = state;
  let sum = 0;
  for (const k of ABILITY_KEYS) sum += potential[k] > 0 ? current[k] / potential[k] : 0;
  let lost = 0;
  for (const k of ABILITY_KEYS) lost += potential0[k] > 0 ? 1 - potential[k] / potential0[k] : 0;
  return {
    unlock: sum / ABILITY_KEYS.length,
    injuries, careerEnded: state.careerEnded, epSpent,
    weeks: state.ageWeeks - LIFECYCLE_WEEKS.trainableFrom,
    menuWeeks, injuryRestWeeks,
    conditionMean: weeksCounted > 0 ? condSum / weeksCounted : 0,
    fatigueMean: weeksCounted > 0 ? fatSum / weeksCounted : 0,
    potentialLost: lost / ABILITY_KEYS.length,
  };
}

const { balance, founders } = resolveRuntimeConfig();
const sim = runSimulation(
  {
    seed: SEED, generations: POOL_GENERATIONS, population: POOL_MARES,
    stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true,
  },
  balance, founders, NICKS_GEN,
);
const pool = (sim.finalPopulation ?? []).slice(0, HORSES);
if (pool.length === 0) throw new Error('母集団が空です');

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

console.log(`# V-14 育成の効き（結果でのゲート・D-044）  seed=${SEED} horses=${pool.length}`);
console.log(`  ★係数ではなく結果を見る。係数が正しいかは誰にも分からないが、満たすべき結果は決められる`);
console.log('');
console.log(`  ${'方針'.padEnd(14)} ${'開放率'.padStart(8)} ${'SD'.padStart(7)} ${'SE'.padStart(7)} ${'故障/頭'.padStart(8)} ${'引退'.padStart(6)} ${'EP/頭'.padStart(10)}`);

const results: Record<Policy, CareerResult[]> = { neglect: [], balanced: [], hard_only: [] };
for (const policy of ['neglect', 'balanced', 'hard_only'] as const) {
  for (let i = 0; i < pool.length; i += 1) results[policy].push(runCareer(pool[i]!, policy, i));
  const rs = results[policy];
  const u = rs.map((r) => r.unlock * 100);
  const label = { neglect: '放置(軽めのみ)', balanced: 'バランス型', hard_only: '追い切り偏重' }[policy];
  console.log(
    `  ${label.padEnd(14)} ${mean(u).toFixed(1).padStart(7)}% ${sd(u).toFixed(2).padStart(7)} ${(sd(u) / Math.sqrt(rs.length)).toFixed(3).padStart(7)} ` +
      `${mean(rs.map((r) => r.injuries)).toFixed(2).padStart(8)} ${((rs.filter((r) => r.careerEnded).length / rs.length) * 100).toFixed(1).padStart(5)}% ` +
      `${Math.round(mean(rs.map((r) => r.epSpent))).toLocaleString().padStart(10)}`,
  );
}

const u = (p: Policy): number => mean(results[p].map((r) => r.unlock * 100));
const neglect = u('neglect');
const balanced = u('balanced');
const hardOnly = u('hard_only');

console.log('');
// ★D-048: 水準の錨は1つだけ。動機の本体は「差」
const g1 = balanced >= 88;
const gap = balanced - neglect;
const g2 = gap >= 12;
// ★③の定義（D-047 で確定）: 「同一 EP 予算下の開放率」。
//   EP は希少資源で、プレイヤーが直面する問いは
//   「同じ EP を注いだときどちらが強くなるか」だから。
const epBalanced = mean(results.balanced.map((r) => r.epSpent));
const epHard = mean(results.hard_only.map((r) => r.epSpent));
const perEp = (p: Policy): number => u(p) / mean(results[p].map((r) => r.epSpent));
/**
 * ★「大きく上回らない」の判定幅（較正定数）。
 *   正典 D-044 は「大きく上回らない」としか書いておらず、**この値は私が決めたもの**です。
 *
 * 【★2026-08-11 の是正】
 *   ここは長らく **`hardOnly <= balanced + 2pt`（時間軸の差）**で判定していました。
 *   ★**すぐ上のコメントで「③の定義は同一 EP 予算下の開放率」と書きながら、
 *     判定はそうなっていませんでした。** 定義と実装が食い違ったまま
 *   「V-14 ③ FAIL」を何便も報告し、「次の梃子は menuIntensity」と書いていました。
 *
 *   **EP を多く注いだほうが強くなるのは設計として正しい**（D-048 の「動機は差」）。
 *   ③ が問うのは **「同じ EP でどちらが強いか」だけ**です。
 *
 *   → 判定を **EP あたり開放率の比**に直します。比 1.0 が「互角」で、
 *     追い切り偏重がこれを大きく超えたら支配戦略です。
 *   ⚠️ **1行で書くこと**
 */
// prettier-ignore
export const DOMINANCE_MARGIN_RATIO = 1.02;
const epRatio = perEp('hard_only') / perEp('balanced');
const g3 = epRatio <= DOMINANCE_MARGIN_RATIO;
const seOf = (p: Policy): number => {
  const a = results[p].map((r) => r.unlock * 100);
  return sd(a) / Math.sqrt(a.length);
};
const gapSe = Math.sqrt(seOf('balanced') ** 2 + seOf('neglect') ** 2);
console.log(`  ★① 適切な育成が 88%以上 : ${balanced.toFixed(1)}%  （余裕 ${(balanced - 88).toFixed(1)}pt = ${((balanced - 88) / seOf('balanced')).toFixed(1)} SE）  ${g1 ? 'PASS' : 'FAIL'}`);
console.log(`  ★② 差が 12pt 以上       : ${gap.toFixed(1)}pt（${balanced.toFixed(1)} − ${neglect.toFixed(1)}）  （余裕 ${(gap - 12).toFixed(1)}pt = ${((gap - 12) / gapSe).toFixed(1)} SE）  ${g2 ? 'PASS' : 'FAIL'}`);
console.log(`     （放置 ${neglect.toFixed(1)}% は錨を持たない。★動機は差であって水準ではない・D-048）`);
console.log(
  `  ★③ 同一EP予算下で追い切り偏重が支配的でない: 比 ${epRatio.toFixed(2)}倍` +
    `（上限 ${DOMINANCE_MARGIN_RATIO.toFixed(2)}倍）  ${g3 ? 'PASS' : 'FAIL'}`,
);
console.log(
  `     EP あたり開放率: 追い切り ${(perEp('hard_only') * 10000).toFixed(2)} vs ` +
    `バランス ${(perEp('balanced') * 10000).toFixed(2)}（1万EPあたり%）` +
    `   EP実額 ${Math.round(epHard).toLocaleString()} vs ${Math.round(epBalanced).toLocaleString()}`,
);
console.log(
  `     【参考・判定に使わない】時間軸の水準差: ${hardOnly.toFixed(1)}% vs ${balanced.toFixed(1)}% ` +
    `= ${(hardOnly - balanced).toFixed(1)}pt` +
    `  ★EP を多く注いだほうが強くなるのは設計として正しい（D-048）。ここは③の失敗ではない`,
);
console.log(`\n★V-14: ${g1 && g2 && g3 ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------------------
// ★分解: なぜ追い切り偏重が支配的なのか。**機構を推測せず、実際の内訳を出す**
// ---------------------------------------------------------------------------
console.log('');
console.log('# ★分解 — 追い切りの利得を、故障と疲労がどれだけ削っているか');
console.log('');
console.log(`  ${'方針'.padEnd(14)} ${MENU_IDS.map((m) => m.slice(0, 4).padStart(8)).join('')}`);
for (const policy of ['neglect', 'balanced', 'hard_only'] as const) {
  const rs = results[policy];
  const label = { neglect: '放置', balanced: 'バランス型', hard_only: '追い切り偏重' }[policy];
  const cells = MENU_IDS.map((m) => mean(rs.map((r) => r.menuWeeks[m])).toFixed(0).padStart(8));
  console.log(`  ${label.padEnd(14)} ${cells.join('')}`);
}
console.log('  （メニュー別の平均週数。全体で182週）');
console.log('');
console.log(`  ${'方針'.padEnd(14)} ${'実効係数'.padStart(9)} ${'故障休養'.padStart(9)} ${'平均疲労'.padStart(9)} ${'平均調子'.padStart(9)} ${'素質喪失'.padStart(9)}`);
for (const policy of ['neglect', 'balanced', 'hard_only'] as const) {
  const rs = results[policy];
  const label = { neglect: '放置', balanced: 'バランス型', hard_only: '追い切り偏重' }[policy];
  // ★実効係数 = メニュー係数を週数で加重平均（sp で代表）
  const totalW = MENU_IDS.reduce((a, m) => a + mean(rs.map((r) => r.menuWeeks[m])), 0);
  const eff = MENU_IDS.reduce((a, m) => a + menuCoef(m, 'sp') * mean(rs.map((r) => r.menuWeeks[m])), 0) / totalW;
  console.log(
    `  ${label.padEnd(14)} ${eff.toFixed(3).padStart(9)} ${mean(rs.map((r) => r.injuryRestWeeks)).toFixed(1).padStart(8)}週 ` +
      `${mean(rs.map((r) => r.fatigueMean)).toFixed(1).padStart(9)} ${mean(rs.map((r) => r.conditionMean)).toFixed(2).padStart(9)} ` +
      `${(mean(rs.map((r) => r.potentialLost)) * 100).toFixed(2).padStart(8)}%`,
  );
}
console.log('');
console.log('  ★読み方: 実効係数の比がそのまま到達率の差に効く。');
console.log('    故障休養（週）と素質喪失（%）が、その利得をどれだけ打ち消せているかを見る。');
