/**
 * 創始世代の生成 — 指示書 §3.3（正典 §6 は「親がいる」前提なのでここで定義）
 *
 * 正典 §10 の NPC プリシード（50世代）でも同じ関数を再利用する想定。
 * 定数はすべて FoundersConfig（balance.ts）から注入する。チューニング対象。
 */

import type { BalanceConfig, FoundersConfig } from './balance.js';
import { clamp } from './genetics.js';
import { expressPhenotype } from './phenotype.js';
import type { Rng } from './rng.js';
import type {
  AllelePair,
  Genotype,
  HorseId,
  HorseRecord,
  LineId,
  Sex,
  SkillGene,
} from './types.js';

function gaussianAllelePair(
  rng: Rng,
  mean: number,
  sd: number,
  min: number,
  max: number,
): AllelePair {
  return {
    a1: clamp(Math.round(rng.gaussian(mean, sd)), min, max),
    a2: clamp(Math.round(rng.gaussian(mean, sd)), min, max),
  };
}

function uniformAllelePair(rng: Rng, range: readonly [number, number]): AllelePair {
  return {
    a1: Math.round(rng.range(range[0], range[1])),
    a2: Math.round(rng.range(range[0], range[1])),
  };
}

/**
 * 創始馬の genotype を生成する。
 * 乱数消費順: 能力5種 → 芝/ダート → 距離 → 脚質 → 成長型 → 気性 → 丈夫さ → スキル遺伝子
 */
export function createFounderGenotype(
  rng: Rng,
  f: FoundersConfig,
  skillPool: readonly SkillGene[],
): Genotype {
  const ability = (): AllelePair =>
    gaussianAllelePair(rng, f.ABILITY_MEAN, f.ABILITY_SD, f.ABILITY_MIN, f.ABILITY_MAX);

  const genotype: Genotype = {
    sp: ability(),
    st: ability(),
    pw: ability(),
    gt: ability(),
    iq: ability(),
    surface: {
      turf: uniformAllelePair(rng, f.SURFACE_RANGE),
      dirt: uniformAllelePair(rng, f.SURFACE_RANGE),
    },
    heavy_aptitude: uniformAllelePair(rng, f.HEAVY_RANGE),
    distance_center: uniformAllelePair(rng, f.DISTANCE_CENTER_RANGE),
    distance_range: uniformAllelePair(rng, f.DISTANCE_RANGE_RANGE),
    strategy_bias: { a1: rng.pick(f.STRATEGY_POOL), a2: rng.pick(f.STRATEGY_POOL) },
    growth: { a1: rng.pick(f.GROWTH_POOL), a2: rng.pick(f.GROWTH_POOL) },
    temper: gaussianAllelePair(rng, f.TEMPER_MEAN, f.TEMPER_SD, f.TEMPER_MIN, f.TEMPER_MAX),
    durability: gaussianAllelePair(
      rng,
      f.DURABILITY_MEAN,
      f.DURABILITY_SD,
      f.DURABILITY_MIN,
      f.DURABILITY_MAX,
    ),
    skill_genes: [],
  };

  // スキル遺伝子: 0〜2個を等確率で（指示書 §3.3）
  const count = rng.int(f.SKILL_GENE_COUNT[0], f.SKILL_GENE_COUNT[1]);
  genotype.skill_genes = rng.shuffled(skillPool).slice(0, count);

  return genotype;
}

export interface FounderParams {
  id: HorseId;
  sex: Sex;
  sireLine: LineId;
  birthYear: number;
  rng: Rng;
  balance: BalanceConfig;
  founders: FoundersConfig;
}

/** 創始馬1頭を生成する。親を持たないので F=0・ニックスなし・pedigree_cache は空 */
export function createFounder(params: FounderParams): HorseRecord {
  const { id, sex, sireLine, birthYear, rng, balance, founders } = params;

  const genotype = createFounderGenotype(rng, founders, balance.SKILL_GENE_POOL);
  const phenotype = expressPhenotype(genotype, { F: 0, nicksMultiplier: 1 }, rng, balance);

  return {
    id,
    sex,
    generation: 0,
    birthYear,
    sireId: null,
    damId: null,
    sireLine,
    damSireLine: null,
    genotype,
    potential: phenotype.potential,
    stats: phenotype.stats,
    unlockRate: phenotype.unlockRate,
    surfaceAptitude: phenotype.surfaceAptitude,
    distanceCenter: phenotype.distanceCenter,
    distanceRange: phenotype.distanceRange,
    strategyAptitude: phenotype.strategyAptitude,
    growth: phenotype.growth,
    temper: phenotype.temper,
    durability: phenotype.durability,
    heavyAptitude: phenotype.heavyAptitude,
    injuryRateMult: phenotype.injuryRateMult,
    frail: phenotype.frail,
    skillGenes: genotype.skill_genes.slice(),
    inbreedCoeff: 0,
    nicksMultiplier: 1,
    pedigreeCache: new Map(),
    foalCount: 0,
    coveringsThisYear: 0,
    bredThisYear: false,
    g1Wins: 0,
    breedingRecord: null,
  };
}
