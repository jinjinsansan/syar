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
 * 形質ごとの突然変異スケール。
 * 正典 §6.4 の N(0,45) / clamp±150 は 0〜1000 スケール（能力5種）を前提とした値なので、
 * 値域の異なる形質には値域比で縮尺して適用する（surface は 0〜100 なので 1/10）。
 */
function mutationScale(balance: BalanceConfig, key: NumericTraitKey): number {
  const bounds = balance.traitBounds[key];
  return (bounds.max - bounds.min) / balance.MUTATION_SCALE_BASE;
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
    const scale = mutationScale(balance, key);

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
    if (ancestors.length > 0) {
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

    // --- §6.4 突然変異 ---
    const isBig = rng.bool(g.BIG_MUTATION_RATE);
    if (isBig) bigMutationTraits.push(key);
    // 【正典外・既定無効】品種平均への回帰（balance.REGRESSION_RATE の説明を参照）
    const regressionCenter = bounds.min + (bounds.max - bounds.min) * balance.REGRESSION_CENTER_RATIO;
    for (const slot of ['a1', 'a2'] as const) {
      mutationRolls++;
      let noise: number;
      if (isBig) {
        // 大突然変異は N(0,180) に「置き換え」。負にも振れる（血統インフレ抑制・§13.3）
        noise = rng.gaussian(0, g.BIG_MUTATION_SD * scale);
      } else {
        noise = clamp(
          rng.gaussian(0, g.MUTATION_SD * scale),
          -balance.MUTATION_CLAMP * scale,
          balance.MUTATION_CLAMP * scale,
        );
      }
      if (balance.REGRESSION_RATE !== 0) {
        noise -= (pair[slot] - regressionCenter) * balance.REGRESSION_RATE;
      }
      pair[slot] = pair[slot] + noise;
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
