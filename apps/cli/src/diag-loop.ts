/**
 * ★週ループの**載せ替え差分**を測る道具（判定を出さない・診断のみ）
 *
 * 【なぜ要るか】
 *   B-1（1頭を誕生から引退まで通す）のために `advanceWeek`（週送りの合成器）を
 *   作りました。ところが `verify-v7.ts` / `verify-v14.ts` は**それぞれ自前の週ループ**を
 *   持っており、較正済みの数字（INJURY_BASE_PROB = 0.0013 → V-7a 29.9%）は
 *   **そちらのループで測ったもの**です。
 *
 *   ★合成器に載せ替えると数字が動きます。**動いた理由が2つ同時にある**ので、
 *     いきなり載せ替えると「何のせいで変わったか」が分からなくなります:
 *
 *     ① **§7.6 のイベント**を旧ループは一度も引いていない
 *     ② **§7.2 の気性変化（`temperDelta`）**を旧ループは適用していない
 *        （併せ馬 −2 / 休養 −5。気性は `temperCoef` 経由で成長のばらつきに効く）
 *
 *   → **①②を1つずつ入れて、それぞれの寄与を出します。**
 *
 * 【★この道具は判定を出しません】
 *   通すために動かせる値がありません。数字を並べるだけです。
 *
 * 【★durability について（照会 Q-P3-20）】
 *   REVIEW_P3_V7_VERDICT は「**キャリア開始時の値を測定条件として固定**」としました。
 *   一方 §7.5 の式 `1000/durability` は、重度故障の −100 が**その後の確率に効く**と読めます。
 *   合成器は**ゲームの規則（現在値）**を実装しています。
 *   ここでは旧ループの現在値版と突き合わせるので、**両者とも現在値**です。
 *
 * 実行: npx tsx apps/cli/src/diag-loop.ts --horses 1800 --seed 42
 */
import {
  ABILITY_KEYS, NICKS_GEN, deriveRng, type AbilityKey, type HorseRecord, type Rng,
} from '@star/sim-engine';
import {
  DEFAULT_MENU, MENUS, TRAIN_STREAM, advanceWeek, applyInjury, fatigueDelta, grow,
  initialState, injuryProbability, nextCondition, rollSeverity, weeklyFatigue,
  type HorseTraits, type MenuId,
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
const HORSES = num('horses', 1800);

/** ★V-7 と**同一**のバランス型方針（別物にすると比較になりません） */
function chooseMenu(week: number, fatigue: number): MenuId {
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return DEFAULT_MENU;
}

interface Outcome {
  /** V-7a: 恒久ダメージ（中度以上）を1回でも負ったか */
  readonly permanent: boolean;
  /** V-7b: 致命的故障で引退したか */
  readonly careerEnded: boolean;
  readonly injuries: number;
  /** 引退時点の SP（成長がどれだけ変わったかの代表値） */
  readonly finalSp: number;
  readonly finalTemper: number;
  readonly events: number;
}

/** ── 旧ループ（`verify-v7.ts` の runCareer と同じ手順）───────────── */
function legacyCareer(horse: HorseRecord, idx: number): Outcome {
  const potential = { ...horse.potential } as Record<AbilityKey, number>;
  const current = { ...horse.stats } as Record<AbilityKey, number>;
  let durability = horse.durability;
  let fatigue = 0;
  let condition = 3;
  let restUntil = -1;
  let injuries = 0;
  let permanent = false;
  let careerEnded = false;

  for (let week = LIFECYCLE_WEEKS.trainableFrom; week < LIFECYCLE_WEEKS.retireAt; week += 1) {
    const resting = week < restUntil;
    const menu: MenuId = resting ? 'rest' : chooseMenu(week, fatigue);
    const p = injuryProbability({
      menu, fatigue, durability, injuryRateMult: horse.injuryRateMult, ageWeeks: week,
    });
    const injRng = deriveRng(SEED, TRAIN_STREAM.INJURY, idx * 1000 + week);
    if (injRng.bool(p)) {
      injuries += 1;
      const sev = rollSeverity(injRng);
      if (sev !== 'mild') permanent = true;
      const r = applyInjury({ potential, current, durability }, sev, injRng);
      for (const k of ABILITY_KEYS) { potential[k] = r.potential[k]; current[k] = r.current[k]; }
      durability = r.durability;
      if (r.careerEnding) { careerEnded = true; break; }
      restUntil = week + (r.restWeeks ?? 0);
      continue;
    }
    const next = grow(
      { menu, ageWeeks: week, growth: horse.growth, temper: horse.temper, condition, current, potential },
      deriveRng(SEED, TRAIN_STREAM.GROWTH, idx * 1000 + week),
    );
    for (const k of ABILITY_KEYS) current[k] = next[k];
    fatigue = weeklyFatigue(fatigue, fatigueDelta(menu));
    condition = nextCondition(fatigue, deriveRng(SEED, TRAIN_STREAM.CONDITION, idx * 1000 + week));
  }
  return {
    permanent, careerEnded, injuries, finalSp: current.sp,
    finalTemper: horse.temper, events: 0,
  };
}

/**
 * ── 合成器（`advanceWeek`）─────────────────────────────────
 * ★乱数の作り方を**旧ループと1文字も変えません**（`idx * 1000 + week`）。
 *   ここを変えると、差が「載せ替えのせい」なのか「乱数のせい」なのか分かりません。
 */
function unifiedCareer(
  horse: HorseRecord,
  idx: number,
  opts: { readonly events: boolean; readonly temperDelta: boolean },
): Outcome {
  const traits: HorseTraits = {
    sex: horse.sex, growth: horse.growth, injuryRateMult: horse.injuryRateMult,
  };
  let state = initialState({
    potential: horse.potential, current: horse.stats,
    durability: horse.durability, temper: horse.temper,
  });
  // ★78週まで飛ばす（旧ループは trainableFrom から始まる）
  state = { ...state, ageWeeks: LIFECYCLE_WEEKS.trainableFrom };

  let injuries = 0;
  let permanent = false;
  let events = 0;
  while (state.retirement === null) {
    const week = state.ageWeeks;
    const menu = chooseMenu(week, state.fatigue);
    const before = state.temper;
    const r = advanceWeek({
      state, traits, menu, enableEvents: opts.events,
      rngFor: (stream: number): Rng => deriveRng(SEED, stream, idx * 1000 + week),
    });
    state = r.state;
    // ★`temperDelta` を切るときは、合成器が動かした気性を**元に戻します**
    //   （合成器側に「気性を動かさない」旗を足すと、測定のための旗が本体に残ります）
    if (!opts.temperDelta) state = { ...state, temper: before };
    if (r.log.injury !== null) {
      injuries += 1;
      if (r.log.injury.severity !== 'mild') permanent = true;
    }
    if (r.log.event !== null) events += 1;
  }
  return {
    permanent,
    careerEnded: state.careerEnded,
    injuries,
    finalSp: state.current.sp,
    finalTemper: state.temper,
    events,
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
if (pool.length !== HORSES) {
  throw new Error(`要求 ${HORSES}頭に対し ${pool.length}頭しか集まりませんでした`);
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sdv = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};
const rate = (rs: Outcome[], f: (o: Outcome) => boolean): { pct: number; se: number } => {
  const a = rs.map((r) => (f(r) ? 1 : 0));
  return { pct: mean(a) * 100, se: (sdv(a) / Math.sqrt(a.length)) * 100 };
};

const variants: { readonly name: string; readonly rs: Outcome[] }[] = [
  { name: '① 旧ループ（V-7 が較正に使った手順）', rs: pool.map((h, i) => legacyCareer(h, i)) },
  {
    name: '② 合成器・イベント無・気性変化無（★①と一致するはず）',
    rs: pool.map((h, i) => unifiedCareer(h, i, { events: false, temperDelta: false })),
  },
  {
    name: '③ 合成器・イベント無・気性変化有（§7.2 の temperDelta を追加）',
    rs: pool.map((h, i) => unifiedCareer(h, i, { events: false, temperDelta: true })),
  },
  {
    name: '④ 合成器・イベント有・気性変化有（★B-1 が通す実際の経路）',
    rs: pool.map((h, i) => unifiedCareer(h, i, { events: true, temperDelta: true })),
  },
];

console.log(`# 週ループの載せ替え差分  seed=${SEED} horses=${pool.length} 方針=バランス型`);
console.log(`  ★判定は出しません。V-7a の帯は 20〜40%（D-049）、V-7b は 5%以下`);
console.log('');
console.log(
  `  ${'条件'.padEnd(46)} ${'V-7a 恒久'.padStart(16)} ${'V-7b 致命'.padStart(14)} ${'件/頭'.padStart(7)} ${'最終SP'.padStart(8)} ${'気性'.padStart(6)} ${'ev/頭'.padStart(6)}`,
);
for (const v of variants) {
  const a = rate(v.rs, (o) => o.permanent);
  const b = rate(v.rs, (o) => o.careerEnded);
  console.log(
    `  ${v.name.padEnd(40)} ${`${a.pct.toFixed(1)}% ±${a.se.toFixed(2)}`.padStart(16)} ` +
      `${`${b.pct.toFixed(1)}% ±${b.se.toFixed(2)}`.padStart(14)} ` +
      `${mean(v.rs.map((r) => r.injuries)).toFixed(3).padStart(7)} ` +
      `${mean(v.rs.map((r) => r.finalSp)).toFixed(1).padStart(8)} ` +
      `${mean(v.rs.map((r) => r.finalTemper)).toFixed(1).padStart(6)} ` +
      `${mean(v.rs.map((r) => r.events)).toFixed(2).padStart(6)}`,
  );
}

console.log('');
const [a1, a2, a3, a4] = variants.map((v) => rate(v.rs, (o) => o.permanent).pct);
console.log('  【差の内訳】');
console.log(`    ★①→② 載せ替えそのもの   : ${(a2! - a1!).toFixed(2)}pt  ← ここが 0 でなければ載せ替えにバグがある`);
console.log(`      ②→③ 気性変化(§7.2)     : ${(a3! - a2!).toFixed(2)}pt`);
console.log(`      ③→④ イベント(§7.6)     : ${(a4! - a3!).toFixed(2)}pt`);
console.log(`      ①→④ 合計               : ${(a4! - a1!).toFixed(2)}pt`);
console.log('');
if (Math.abs(a2! - a1!) > 1e-9) {
  console.log('  ★①と②が一致しません。載せ替えで手順が変わっています（差分の解釈より先に、ここを直す）');
} else {
  console.log('  ★①と②が完全一致。載せ替えで手順は変わっていません');
}
console.log(`  ★MENUS の temperDelta: ${Object.values(MENUS).filter((m) => m.temperDelta !== 0).map((m) => `${m.id}:${m.temperDelta}`).join(' ')}`);
