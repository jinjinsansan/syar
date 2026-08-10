/**
 * ★V-7（故障率 25〜35%）の**測定条件を決めるための道具**（P3 指示書 §4）
 *
 * 正典 §13.2: 「**1キャリアあたりの故障発生率 25〜35%**。分母は**表現型**の丈夫さ」
 *
 * 【★測る前に定義を決める理由】
 *   指示書 §4:「分母が故障で動くので、**定義が判定を作ります**」
 *   V-1 と同じで、**定義を決めた時点で合否がほぼ決まります**。
 *   → **候補ごとの数字を出してから決めます。** 抽象的に選ぶと、
 *     あとで「その定義だと通らない」と分かって全部測り直しになります。
 *
 * 【★「分母」の読みが2通りあります（照会 Q-P3-17）】
 *   - **読みA**: 率の分母が「表現型の丈夫さ」→ **単位が合いません**（%になりません）
 *   - **読みB**: §7.5 の式 `1000 / durability` の分母 → **表現型の値を使え**という指定
 *   ★B のほうが整合します。B なら「測定対象が測定中に動く」のは
 *     **式の入力が毎週変わる**という意味で、**率の定義とは別の話**になります。
 *
 * 実行: npm run verify:v7 -- --horses 500 --seed 42
 */
import {
  ABILITY_KEYS, NICKS_GEN, deriveRng, type AbilityKey, type HorseRecord,
} from '@star/sim-engine';
import {
  DEFAULT_MENU, applyInjury, epCost, fatigueDelta, grow, injuryProbability,
  nextCondition, rollSeverity, weeklyFatigue, type MenuId,
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
export const SEED = num('seed', 42);
export const HORSES = num('horses', 500);

/** ★週進行の乱数の用途ID（既存4表と重ならない61〜の帯） */
const TRAIN_STREAM = { GROWTH: 61, CONDITION: 62, INJURY: 63 } as const;

/**
 * ★測定のための育成方針。V-14 と同一の3方針にする（別物にすると比較できない）。
 *
 * ★**指示書に挙がっていない5つ目の測定条件です。**
 *   故障は調教で起きる（§7.5）ので、**どの方針で測るかで故障率が変わります**。
 *   方針を決めずに「V-7 は何%」とは言えません。
 */
export type Policy = 'neglect' | 'balanced' | 'hard_only';

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

interface CareerInjuries {
  /** 調教開始（78週）〜引退までの故障件数 */
  readonly fromTrainable: number;
  /** ★デビュー（104週）〜引退までの故障件数 */
  readonly fromDebut: number;
  /** 重篤度別の件数（キャリア全体） */
  readonly bySeverity: Record<string, number>;
  readonly careerEnded: boolean;
  /** キャリア開始時の表現型の丈夫さ */
  readonly durability0: number;
  /** 期間平均の丈夫さ */
  readonly durabilityMean: number;
  /** ★V-7a: 恒久ダメージを伴う故障（中度以上）を1回でも負ったか */
  readonly permanent: boolean;
}

/**
 * ★`fixDurability`: 故障確率の式に**キャリア開始時の丈夫さ**を使う（裁定の読み）。
 *   false なら**現在値**を使う（重度故障の durability −100 が将来の確率に効く）。
 *   ★どちらかで挙動が変わるので、両方測って報告します。
 */
function runCareer(horse: HorseRecord, idx: number, policy: Policy, fixDurability = false): CareerInjuries {
  const potential = { ...horse.potential } as Record<AbilityKey, number>;
  const current = { ...horse.stats } as Record<AbilityKey, number>;
  let durability = horse.durability;
  const durability0 = horse.durability;
  let durSum = 0;
  let weeks = 0;
  let fatigue = 0;
  let condition = 3;
  let restUntil = -1;
  let fromTrainable = 0;
  let fromDebut = 0;
  const bySeverity: Record<string, number> = {};
  let careerEnded = false;

  for (let week = LIFECYCLE_WEEKS.trainableFrom; week < LIFECYCLE_WEEKS.retireAt; week += 1) {
    durSum += durability;
    weeks += 1;
    const resting = week < restUntil;
    const menu: MenuId = resting ? 'rest' : chooseMenu(policy, week, fatigue);
    const p = injuryProbability({
      menu, fatigue,
      durability: fixDurability ? durability0 : durability,
      injuryRateMult: horse.injuryRateMult, ageWeeks: week,
    });
    const injRng = deriveRng(SEED, TRAIN_STREAM.INJURY, idx * 1000 + week);
    if (injRng.bool(p)) {
      fromTrainable += 1;
      if (week >= LIFECYCLE_WEEKS.raceableFrom) fromDebut += 1;
      const sev = rollSeverity(injRng);
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
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
    epCost(menu);
  }
  const permanent =
    (bySeverity['moderate'] ?? 0) + (bySeverity['severe'] ?? 0) + (bySeverity['career_ending'] ?? 0) > 0;
  return {
    fromTrainable, fromDebut, bySeverity, careerEnded, permanent,
    durability0, durabilityMean: weeks > 0 ? durSum / weeks : durability0,
  };
}

const { balance, founders } = resolveRuntimeConfig();

/**
 * ★母集団は1シードあたり `POOL_MARES`（400頭）しかありません。
 *   それを超える頭数を要求されたら**シードを増やして集めます**。
 *
 * ★以前ここで `slice(0, HORSES)` だけを書いており、1800頭を要求しても
 *   **黙って400頭で測っていました**。SE が変わらないのに
 *   「頭数を増やした」と報告するところでした（R-21）。
 */
const pool: HorseRecord[] = [];
for (let s = 0; pool.length < HORSES; s += 1) {
  const sim = runSimulation(
    {
      seed: SEED + s * 1000, generations: POOL_GENERATIONS, population: POOL_MARES,
      stallionPool: Math.round(POOL_MARES * 0.3), v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true,
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

const rs = pool.map((h, i) => runCareer(h, i, 'balanced'));
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};
const pct = (a: number[]): string => `${(mean(a) * 100).toFixed(1)}%`;
const se = (a: number[]): string => `${((sd(a) / Math.sqrt(a.length)) * 100).toFixed(2)}pt`;

console.log(`# V-7 の測定条件を決めるための実測  seed=${SEED}〜 horses=${pool.length}（1シード${POOL_MARES}頭を必要数まで積む）`);
console.log(`  正典: 「1キャリアあたりの故障発生率 25〜35%。分母は表現型の丈夫さ」`);
console.log(`  ★測る前に定義を決める（指示書 §4）。候補ごとの数字を出す`);
console.log('');

console.log('  【候補①】キャリアの範囲');
const anyFromTrainable = rs.map((r) => (r.fromTrainable > 0 ? 1 : 0));
const anyFromDebut = rs.map((r) => (r.fromDebut > 0 ? 1 : 0));
console.log(`    調教開始(78週)〜引退 で1回でも故障した馬の割合 : ${pct(anyFromTrainable)}  SE ${se(anyFromTrainable)}`);
console.log(`    ★デビュー(104週)〜引退 で1回でも故障した馬の割合: ${pct(anyFromDebut)}  SE ${se(anyFromDebut)}`);
console.log('');

console.log('  【候補②】率の定義（★これが判定を最も動かす）');
const cntTrainable = rs.map((r) => r.fromTrainable);
const cntDebut = rs.map((r) => r.fromDebut);
console.log(`    「故障した馬の割合」（1回でも）        : ${pct(anyFromTrainable)}`);
console.log(`    ★「1頭あたりの平均故障件数」（2回は2件）: ${mean(cntTrainable).toFixed(3)} 件/頭 = ${(mean(cntTrainable) * 100).toFixed(1)}%相当`);
console.log(`      （デビュー以降だけなら ${mean(cntDebut).toFixed(3)} 件/頭）`);
console.log('');

console.log('  【候補③】分母に使う丈夫さ（★読みAの場合にのみ意味を持つ）');
console.log(`    キャリア開始時の平均 : ${mean(rs.map((r) => r.durability0)).toFixed(1)}`);
console.log(`    ★期間平均           : ${mean(rs.map((r) => r.durabilityMean)).toFixed(1)}`);
console.log(`    → 差 ${(mean(rs.map((r) => r.durability0)) - mean(rs.map((r) => r.durabilityMean))).toFixed(1)}（故障で下がったぶん）`);
console.log('');

console.log('  【参考】重篤度の内訳（1頭あたり件数）');
for (const sev of ['mild', 'moderate', 'severe', 'career_ending']) {
  console.log(`    ${sev.padEnd(14)} ${mean(rs.map((r) => r.bySeverity[sev] ?? 0)).toFixed(3)} 件/頭`);
}
console.log(`    ★競走能力喪失で引退した馬 : ${pct(rs.map((r) => (r.careerEnded ? 1 : 0)))}`);
console.log('');
console.log('  【★D-049 分割後のゲート】基準はバランス型（V-14 の錨と揃える）');
console.log(`    ${'方針'.padEnd(14)} ${'V-7a 恒久ダメージ'.padStart(18)} ${'V-7b 致命的'.padStart(13)}`);
for (const policy of ['neglect', 'balanced', 'hard_only'] as const) {
  const xs = pool.map((h, i) => runCareer(h, i, policy));
  const a = xs.map((r) => (r.permanent ? 1 : 0));
  const b = xs.map((r) => (r.careerEnded ? 1 : 0));
  const label = { neglect: '放置(参考)', balanced: '★バランス型', hard_only: '追い切り偏重(参考)' }[policy];
  const okA = mean(a) * 100 >= 20 && mean(a) * 100 <= 40;
  const okB = mean(b) * 100 <= 3;
  console.log(
    `    ${label.padEnd(14)} ${(pct(a) + ` ${okA ? 'PASS' : 'FAIL'}`).padStart(18)} ${(pct(b) + ` ${okB ? 'PASS' : 'FAIL'}`).padStart(13)}` +
      `   SE ${se(a)} / ${se(b)}`,
  );
}
console.log('    V-7a: 恒久ダメージを伴う故障（中度以上）を負うキャリアの割合 20〜40%');
console.log('    V-7b: 致命的故障（強制引退）3%以下');
console.log('');
console.log('  【★丈夫さの扱いによる差（裁定の読みの確認）】');
{
  const fixedRs = pool.map((h, i) => runCareer(h, i, 'balanced', true));
  const a1 = rs.map((r) => (r.permanent ? 1 : 0));
  const a2 = fixedRs.map((r) => (r.permanent ? 1 : 0));
  console.log(`    式に現在値を使う（重度の −100 が効く）    : V-7a ${pct(a1)}`);
  console.log(`    ★式にキャリア開始時の値を固定して使う    : V-7a ${pct(a2)}`);
  console.log(`    → 差 ${((mean(a2) - mean(a1)) * 100).toFixed(2)}pt`);
  console.log('    ★固定すると、重度故障の durability −100 が将来の故障確率に効かなくなります');
}
console.log('');
console.log('  【候補④】どの育成方針で測るか（★裁定でバランス型に確定）');
console.log(`    ${'方針'.padEnd(14)} ${'故障した馬の割合'.padStart(16)} ${'件数/頭'.padStart(9)} ${'25〜35%'.padStart(8)}`);
for (const policy of ['neglect', 'balanced', 'hard_only'] as const) {
  const xs = pool.map((h, i) => runCareer(h, i, policy));
  const any = xs.map((r) => (r.fromTrainable > 0 ? 1 : 0));
  const cnt = xs.map((r) => r.fromTrainable);
  const label = { neglect: '放置', balanced: 'バランス型', hard_only: '追い切り偏重' }[policy];
  const rate = mean(any) * 100;
  console.log(
    `    ${label.padEnd(14)} ${(pct(any) + ` (SE ${se(any)})`).padStart(16)} ${mean(cnt).toFixed(3).padStart(9)} ` +
      `${(rate >= 25 && rate <= 35 ? 'PASS' : 'FAIL').padStart(8)}`,
  );
}
console.log('    ★故障は調教で起きる（§7.5）ので、方針を決めずに「V-7 は何%」とは言えません');
console.log('');
console.log('  【★R-20 必要頭数の逆算】1頭の一生は単一実現なので、キャリア間ばらつきで決める');
{
  const a = rs.map((r) => (r.permanent ? 1 : 0));
  const b = rs.map((r) => (r.careerEnded ? 1 : 0));
  // ★帯の端までの余裕を 3 SE 確保するのに要る頭数
  const need = (xs: number[], edge: number): number => {
    const m = mean(xs) * 100;
    const s = sd(xs) * 100;
    const margin = Math.abs(edge - m);
    if (margin <= 0) return Infinity;
    return Math.ceil((3 * s / margin) ** 2);
  };
  const aEdge = 40; // V-7a の上端が近い
  const bEdge = 3;  // V-7b の上端
  console.log(`    V-7a: ${(mean(a) * 100).toFixed(1)}% / 上端 ${aEdge}% まで ${(aEdge - mean(a) * 100).toFixed(1)}pt` +
    `（${((aEdge - mean(a) * 100) / (sd(a) * 100 / Math.sqrt(a.length))).toFixed(1)} SE）→ ★3 SE 確保に ${need(a, aEdge)}頭`);
  console.log(`    V-7b: ${(mean(b) * 100).toFixed(1)}% / 上端 ${bEdge}% まで ${(bEdge - mean(b) * 100).toFixed(1)}pt` +
    `（${((bEdge - mean(b) * 100) / (sd(b) * 100 / Math.sqrt(b.length))).toFixed(1)} SE）→ ★3 SE 確保に ${need(b, bEdge)}頭`);
  console.log('    ★帯に入ってから逆算する（外れている間に頭数を増やしても、外れ具合の精度が上がるだけ）');
}
console.log(`  ★どの定義を採るかで、25〜35% に入るかどうかが変わります。判断をお願いします`);
