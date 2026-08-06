/**
 * 配合フロー統合 — 正典 §6.1
 *
 *   1. 交配可否チェック（性別・年齢・種付回数上限・同一年内重複）
 *   2. 近交係数 F を計算              → §6.5
 *   3. ニックス判定                    → §6.6
 *   4. 各形質のアレル継承              → §6.2
 *   5. 隔世遺伝ロール                  → §6.3
 *   6. 突然変異ロール                  → §6.4
 *   7. F とニックスの補正を適用        → §6.5, §6.6
 *   8. potential 確定、初期 stats 算出（素質開放率 0.28〜0.35）
 *   9. 性別決定（牡50% / 牝50%）
 *  10. 馬名生成 or ユーザー命名待ち     → P0 対象外（呼び出し側が ID を与える）
 *  11. breeding_records に rng_seed とともに記録
 */

import type { BalanceConfig } from './balance.js';
import { inheritGenotype } from './genetics.js';
import { buildPedigreeCache, calcInbreedCoefficient } from './inbreeding.js';
import { getNicksMultiplier, type NicksTable } from './nicks.js';
import { expressPhenotype } from './phenotype.js';
import { Rng } from './rng.js';
import type { BreedingRecord, HorseId, HorseLookup, HorseRecord, Sex } from './types.js';

// ---------------------------------------------------------------------------
// 1. 交配可否チェック（§6.1-1 / §6.7）
// ---------------------------------------------------------------------------

export type MateRejection =
  | 'sire_not_male'
  | 'dam_not_female'
  | 'same_horse'
  | 'sire_too_young'
  | 'dam_too_young'
  | 'dam_lifetime_foals_exceeded'
  | 'dam_already_bred_this_year'
  | 'sire_coverings_exceeded';

export interface MateCheck {
  ok: boolean;
  reason?: MateRejection;
}

/** 種牡馬の年間種付上限（正典 §6.7: 20 + G1勝利数 × 10） */
export function stallionCoveringLimit(sire: HorseRecord, balance: BalanceConfig): number {
  return balance.STALLION_BASE_COVERINGS + sire.g1Wins * balance.STALLION_COVERINGS_PER_G1;
}

export function canMate(
  sire: HorseRecord,
  dam: HorseRecord,
  balance: BalanceConfig,
  year: number,
): MateCheck {
  if (sire.id === dam.id) return { ok: false, reason: 'same_horse' };
  if (sire.sex !== 'male') return { ok: false, reason: 'sire_not_male' };
  if (dam.sex !== 'female') return { ok: false, reason: 'dam_not_female' };
  if (year - sire.birthYear < balance.MIN_BREEDING_AGE_YEARS) {
    return { ok: false, reason: 'sire_too_young' };
  }
  if (year - dam.birthYear < balance.MIN_BREEDING_AGE_YEARS) {
    return { ok: false, reason: 'dam_too_young' };
  }
  if (dam.foalCount >= balance.MARE_LIFETIME_FOALS) {
    return { ok: false, reason: 'dam_lifetime_foals_exceeded' };
  }
  // 繁殖牝馬は年1回のみ受胎 = 同一年内の重複交配もこれで塞がれる
  if (dam.bredThisYear) return { ok: false, reason: 'dam_already_bred_this_year' };
  if (sire.coveringsThisYear >= stallionCoveringLimit(sire, balance)) {
    return { ok: false, reason: 'sire_coverings_exceeded' };
  }
  return { ok: true };
}

/** 交配成立後の繁殖カウンタ更新（生涯8産・年間種付上限の管理） */
export function applyMatingCounters(sire: HorseRecord, dam: HorseRecord): void {
  sire.coveringsThisYear += 1;
  dam.bredThisYear = true;
  dam.foalCount += 1;
}

// ---------------------------------------------------------------------------
// 配合本体
// ---------------------------------------------------------------------------

export interface BreedParams {
  id: HorseId;
  sire: HorseRecord;
  dam: HorseRecord;
  /** この配合専用の乱数シード。監査・再現のため仔馬に記録される（§6.1-11） */
  seed: number;
  generation: number;
  birthYear: number;
  lookup: HorseLookup;
  balance: BalanceConfig;
  nicks: NicksTable;
}

export function breed(params: BreedParams): HorseRecord {
  const { id, sire, dam, seed, generation, birthYear, lookup, balance, nicks } = params;

  const check = canMate(sire, dam, balance, birthYear);
  if (!check.ok) {
    throw new Error(`breed: 交配不可 (${check.reason ?? 'unknown'}) sire=${sire.id} dam=${dam.id}`);
  }

  const rng = new Rng(seed);

  // --- 2. 近交係数 F（§6.5） ---
  const pedigreeCache = buildPedigreeCache(sire, dam, balance.PEDIGREE_DEPTH);
  const inbreed = calcInbreedCoefficient(sire, dam, lookup, balance.PEDIGREE_DEPTH);

  // --- 3. ニックス判定（§6.6） ---
  const nicksMultiplier = getNicksMultiplier(nicks, sire.sireLine, dam.sireLine);

  // --- 4〜6. アレル継承・隔世遺伝・突然変異 ---
  const inherited = inheritGenotype({
    sire,
    dam,
    childPedigree: pedigreeCache,
    rng,
    lookup,
    balance,
  });
  const genotype = inherited.genotype;

  // --- 7〜8. F / ニックス補正 → potential 確定 → 初期 stats ---
  const topAncestor = inbreed.topAncestorId === null ? undefined : lookup(inbreed.topAncestorId);
  const phenotype = expressPhenotype(
    genotype,
    {
      F: inbreed.F,
      concentrationSource: topAncestor?.genotype,
      nicksMultiplier,
    },
    rng,
    balance,
  );

  // --- 9. 性別（牡50% / 牝50%） ---
  const sex: Sex = rng.bool(0.5) ? 'male' : 'female';

  const breedingRecord: BreedingRecord = {
    sireId: sire.id,
    damId: dam.id,
    rngSeed: seed,
    inbreedCoeff: inbreed.F,
    topCommonAncestorId: inbreed.topAncestorId,
    nicksMultiplier,
    atavismTraits: inherited.atavismTraits,
    bigAtavismTraits: inherited.bigAtavismTraits,
    bigMutationTraits: inherited.bigMutationTraits,
    atavismEligibleRolls: inherited.atavismEligibleRolls,
    bigAtavismEligibleRolls: inherited.bigAtavismEligibleRolls,
    mutationRolls: inherited.mutationRolls,
    frail: phenotype.frail,
  };

  return {
    id,
    sex,
    generation,
    birthYear,
    sireId: sire.id,
    damId: dam.id,
    // 父系ラインは父から、母父系ラインは母の父系ラインから継承（指示書 §3.3）
    sireLine: sire.sireLine,
    damSireLine: dam.sireLine,
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
    inbreedCoeff: inbreed.F,
    nicksMultiplier,
    pedigreeCache,
    foalCount: 0,
    coveringsThisYear: 0,
    bredThisYear: false,
    g1Wins: 0,
    breedingRecord,
  };
}
