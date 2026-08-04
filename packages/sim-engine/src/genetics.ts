/**
 * アレル継承・隔世遺伝・突然変異 — 正典 §6.2 / §6.3 / §6.4
 */

import type { BalanceConfig } from './balance.js';
import type { Rng } from './rng.js';
import type {
  AllelePair,
  Genotype,
  HorseId,
  HorseLookup,
  HorseRecord,
  NumericTraitKey,
  PedigreeCache,
  SkillGene,
} from './types.js';
import { NUMERIC_TRAITS, getAllelePair, setAllelePair } from './types.js';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * アレル対 → 発現値。
 * 正典 §5.4 は2アレル保持を定めるが発現規則を定義していないため P0 で定義する。
 * DOMINANT_WEIGHT = 0.5 なら相加的（2値の平均）。
 */
export function expressNumeric(pair: AllelePair, dominantWeight: number): number {
  const hi = Math.max(pair.a1, pair.a2);
  const lo = Math.min(pair.a1, pair.a2);
  return hi * dominantWeight + lo * (1 - dominantWeight);
}

function pickAllele(rng: Rng, pair: AllelePair): number {
  return rng.bool(0.5) ? pair.a1 : pair.a2;
}

/**
 * 形質ごとの変異パラメータを解決する。
 *
 * 既定は値域比スケール: 正典 §6.4 の N(0,90) / clamp±150 は 0〜1000 スケール（能力5種）
 * を前提とした値なので、値域の異なる形質には値域比で縮尺する（surface は 0〜100 なので 1/10）。
 * ただし距離系形質は値域が広く、この機械的な縮尺だと世代を経て分化が消えるため、
 * `balance.traitMutation` で絶対値による上書きができる（正典 §5.2 の警告・P0-fix F-3）。
 */
export interface ResolvedMutation {
  sd: number;
  bigSd: number;
  clamp: number;
  regressionRate: number;
  /** 回帰の引き戻し先（品種中心）。正典 §6.4・D-009 */
  center: number;
}

export function resolveMutation(balance: BalanceConfig, key: NumericTraitKey): ResolvedMutation {
  const bounds = balance.traitBounds[key];
  const scale = (bounds.max - bounds.min) / balance.MUTATION_SCALE_BASE;
  const override = balance.traitMutation[key];
  // 絶対値指定の形質では通常変異との比を保つ。MUTATION_SD=0（変異を止めたテスト等）では
  // ゼロ除算で NaN が genotype に流れ込むため 0 に倒す
  const bigRatio =
    balance.genetics.MUTATION_SD === 0
      ? 0
      : balance.genetics.BIG_MUTATION_SD / balance.genetics.MUTATION_SD;

  return {
    sd: override?.sd ?? balance.genetics.MUTATION_SD * scale,
    // 大突然変異も同じ縮尺に従う
    bigSd:
      override?.sd === undefined ? balance.genetics.BIG_MUTATION_SD * scale : override.sd * bigRatio,
    clamp: override?.clamp ?? balance.MUTATION_CLAMP * scale,
    regressionRate: override?.regressionRate ?? balance.REGRESSION_RATE,
    // ★形質ごとの創始水準。未指定なら旧方式（値域比）へフォールバックするが、
    //   それは保険であって正典の規定ではない（正典 §6.4・D-009）
    center:
      override?.center ??
      bounds.min + (bounds.max - bounds.min) * balance.REGRESSION_CENTER_RATIO,
  };
}

/**
 * 正典 §6.4 の変異＋平均回帰を1アレルに適用する（純関数）。
 *
 * ```
 * 通常変異  : clamp(N(0, sd), ±clamp幅) − (アレル値 − 品種中心) × 回帰率
 * 大突然変異: N(0, sd×2)               − (アレル値 − 品種中心) × 回帰率   ← 通常のclamp幅は適用しない
 * ```
 *
 * ★**clamp は変異ノイズのみにかける**（正典 §6.4・D-012）。回帰項を含めた合計に clamp を
 * かけてはいけない。理由:
 *   1. sd の導出に使う平衡式 `平衡SD = sd/√(2r−r²)` は AR(1) 過程を前提としており、
 *      合計に clamp をかけると裾で線形性が崩れて導出の根拠が失われる
 *   2. clamp の目的は乱数の暴れを抑えることで、決定論的な引き戻しを抑えることではない
 *   3. 合計に clamp すると**最も引き戻したい極端なアレルほど引き戻しが弱くなる**
 *      （アレル値900で −90.0 → −76.5）。血統インフレ抑制という回帰の目的に逆行する
 *
 * 乱数を引数で受け取る純関数にしてあるのは、**式の形そのものをテストで固定する**ため。
 * `MUTATION_SD = 0` の条件では両形式が同値になり、テストが式の違いを検出できない。
 */
export function mutateAllele(
  value: number,
  gaussianDraw: number,
  mutation: ResolvedMutation,
  isBig: boolean,
): number {
  const noise = isBig ? gaussianDraw : clamp(gaussianDraw, -mutation.clamp, mutation.clamp);
  const pull =
    mutation.regressionRate === 0 ? 0 : (value - mutation.center) * mutation.regressionRate;
  return value + noise - pull;
}

export interface InheritOutcome {
  genotype: Genotype;
  atavismTraits: NumericTraitKey[];
  bigAtavismTraits: NumericTraitKey[];
  bigMutationTraits: NumericTraitKey[];
  atavismEligibleRolls: number;
  bigAtavismEligibleRolls: number;
  mutationRolls: number;
}

/**
 * 正典 §6.2〜§6.4 を1形質ずつ適用して子の genotype を作る。
 *
 * 順序は §6.1 のフロー通り: 4.アレル継承 → 5.隔世遺伝 → 6.突然変異
 */
export function inheritGenotype(params: {
  sire: HorseRecord;
  dam: HorseRecord;
  childPedigree: PedigreeCache;
  rng: Rng;
  lookup: HorseLookup;
  balance: BalanceConfig;
}): InheritOutcome {
  const { sire, dam, childPedigree, rng, lookup, balance } = params;
  const g = balance.genetics;

  const atavismTraits: NumericTraitKey[] = [];
  const bigAtavismTraits: NumericTraitKey[] = [];
  const bigMutationTraits: NumericTraitKey[] = [];
  let atavismEligibleRolls = 0;
  let bigAtavismEligibleRolls = 0;
  let mutationRolls = 0;

  // 祖父母4頭（存在するものだけ）。父側/母側のどちらから来たかを保持する。
  const grandparents: { horse: HorseRecord; side: 'sire' | 'dam' }[] = [];
  for (const id of [sire.sireId, sire.damId]) {
    const gp = id === null ? undefined : lookup(id);
    if (gp !== undefined) grandparents.push({ horse: gp, side: 'sire' });
  }
  for (const id of [dam.sireId, dam.damId]) {
    const gp = id === null ? undefined : lookup(id);
    if (gp !== undefined) grandparents.push({ horse: gp, side: 'dam' });
  }

  // 5代以内の祖先（大物覚醒の参照範囲・§6.3）
  const ancestors: HorseRecord[] = [];
  for (const id of childPedigree.keys() as Iterable<HorseId>) {
    const a = lookup(id);
    if (a !== undefined) ancestors.push(a);
  }

  const genotype: Genotype = {
    sp: { a1: 0, a2: 0 },
    st: { a1: 0, a2: 0 },
    pw: { a1: 0, a2: 0 },
    gt: { a1: 0, a2: 0 },
    iq: { a1: 0, a2: 0 },
    surface: { turf: { a1: 0, a2: 0 }, dirt: { a1: 0, a2: 0 } },
    distance_center: { a1: 0, a2: 0 },
    distance_range: { a1: 0, a2: 0 },
    // カテゴリ形質: 父の2アレルから1つ・母の2アレルから1つ（§6.2 と同じ規則）
    strategy_bias: {
      a1: rng.bool(0.5) ? sire.genotype.strategy_bias.a1 : sire.genotype.strategy_bias.a2,
      a2: rng.bool(0.5) ? dam.genotype.strategy_bias.a1 : dam.genotype.strategy_bias.a2,
    },
    growth: {
      a1: rng.bool(0.5) ? sire.genotype.growth.a1 : sire.genotype.growth.a2,
      a2: rng.bool(0.5) ? dam.genotype.growth.a1 : dam.genotype.growth.a2,
    },
    temper: { a1: 0, a2: 0 },
    durability: { a1: 0, a2: 0 },
    skill_genes: [],
  };

  for (const key of NUMERIC_TRAITS) {
    const bounds = balance.traitBounds[key];
    const mutation = resolveMutation(balance, key);

    // --- §6.2 アレル継承 ---
    const pair: AllelePair = {
      a1: pickAllele(rng, getAllelePair(sire.genotype, key)),
      a2: pickAllele(rng, getAllelePair(dam.genotype, key)),
    };

    // --- §6.3 隔世遺伝（6%）: 祖父母世代4頭のいずれかのアレルを直接継承 ---
    if (grandparents.length > 0) {
      atavismEligibleRolls++;
      if (rng.bool(g.ATAVISM_RATE)) {
        const chosen = rng.pick(grandparents);
        const value = pickAllele(rng, getAllelePair(chosen.horse.genotype, key));
        if (chosen.side === 'sire') {
          pair.a1 = value;
        } else {
          pair.a2 = value;
        }
        atavismTraits.push(key);
      }
    }

    // --- §6.3 大物覚醒（1.5%・別枠）: 5代以内で最も高いアレル値を持つ祖先を参照 ---
    // ★適用は能力5種のみ（正典 §6.3・D-011）。気性は「高いほど気性難」なので
    //   覚醒が悪化として働き、距離適性では全馬が万能型へ寄ってしまうため。
    if (ancestors.length > 0 && balance.BIG_ATAVISM_TRAITS.includes(key)) {
      bigAtavismEligibleRolls++;
      if (rng.bool(g.BIG_ATAVISM_RATE)) {
        let best = Number.NEGATIVE_INFINITY;
        for (const ancestor of ancestors) {
          const ap = getAllelePair(ancestor.genotype, key);
          const localMax = Math.max(ap.a1, ap.a2);
          if (localMax > best) best = localMax;
        }
        if (best > Number.NEGATIVE_INFINITY) {
          // 低い方のアレルを置き換える（＝眠っていた大物の血が表に出る）
          if (pair.a1 <= pair.a2) {
            pair.a1 = best;
          } else {
            pair.a2 = best;
          }
          bigAtavismTraits.push(key);
        }
      }
    }

    // --- §6.4 突然変異 + 平均回帰 ---
    const isBig = rng.bool(g.BIG_MUTATION_RATE);
    if (isBig) bigMutationTraits.push(key);
    // 変異と平均回帰は mutateAllele() に集約（式の形をテストで固定するため純関数に切り出してある）
    for (const slot of ['a1', 'a2'] as const) {
      mutationRolls++;
      const draw = rng.gaussian(0, isBig ? mutation.bigSd : mutation.sd);
      pair[slot] = mutateAllele(pair[slot], draw, mutation, isBig);
    }

    // --- 値域 clamp（アレル値上限。§13.3 抑制の三本柱の1つ） ---
    pair.a1 = clamp(Math.round(pair.a1), bounds.min, bounds.max);
    pair.a2 = clamp(Math.round(pair.a2), bounds.min, bounds.max);

    setAllelePair(genotype, key, pair);
  }

  genotype.skill_genes = inheritSkillGenes(sire, dam, rng, balance);

  return {
    genotype,
    atavismTraits,
    bigAtavismTraits,
    bigMutationTraits,
    atavismEligibleRolls,
    bigAtavismEligibleRolls,
    mutationRolls,
  };
}

/**
 * スキル遺伝子の継承。
 * 正典 §5.3「スキル最大3個」/ §5.4 skill_genes 以外に規則の記述がないため P0 で定義:
 *   両親の遺伝子それぞれを独立に SKILL_GENE_INHERIT_RATE で継承 → 重複除去 → 上限まで
 *   さらに低確率でプールから新規遺伝子を獲得（無いと世代とともに遺伝子プールが枯渇する）
 */
export function inheritSkillGenes(
  sire: HorseRecord,
  dam: HorseRecord,
  rng: Rng,
  balance: BalanceConfig,
): SkillGene[] {
  const inherited: SkillGene[] = [];
  for (const gene of [...sire.genotype.skill_genes, ...dam.genotype.skill_genes]) {
    if (inherited.includes(gene)) continue;
    if (rng.bool(balance.SKILL_GENE_INHERIT_RATE)) inherited.push(gene);
  }
  if (rng.bool(balance.SKILL_GENE_MUTATION_RATE)) {
    const novel = rng.pick(balance.SKILL_GENE_POOL);
    if (!inherited.includes(novel)) inherited.push(novel);
  }
  if (inherited.length <= balance.SKILL_GENE_MAX) return inherited;
  return rng.shuffled(inherited).slice(0, balance.SKILL_GENE_MAX);
}
