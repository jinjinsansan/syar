/**
 * genotype → 表現型（potential / 適性 / 気性 / 丈夫さ）の写像。
 *
 * 創始馬（founders.ts）と産駒（breeding.ts）が**同一の規則**で発現することを保証するために
 * ここに一本化する。V-2（100世代後の平均能力 vs 初期比）は両者の比較なので、
 * 発現規則が食い違うと検証そのものが無意味になる。
 */

import type { BalanceConfig } from './balance.js';
import { clamp, expressNumeric } from './genetics.js';
import type { Rng } from './rng.js';
import type { AbilityKey, Genotype, GrowthType, Strategy } from './types.js';
import { ABILITY_KEYS, STRATEGIES } from './types.js';

export interface ExpressionModifiers {
  /** 近交係数 F（創始馬は 0） */
  F: number;
  /** 血の濃縮の参照先（最大寄与の共通祖先の genotype。無ければ undefined） */
  concentrationSource?: Genotype | undefined;
  /** ニックス倍率（§6.6。無効時は 1） */
  nicksMultiplier: number;
}

export interface Phenotype {
  potential: Record<AbilityKey, number>;
  stats: Record<AbilityKey, number>;
  unlockRate: number;
  surfaceAptitude: { turf: number; dirt: number };
  /** 道悪適性 0〜100（正典 §5.2・D-015） */
  heavyAptitude: number;
  distanceCenter: number;
  distanceRange: number;
  strategyAptitude: Record<Strategy, number>;
  growth: GrowthType;
  temper: number;
  durability: number;
  injuryRateMult: number;
  frail: boolean;
}

/**
 * 正典 §6.1-7/8 と §6.5 の補正をまとめて適用する。
 *
 * 乱数の消費順序（決定論のため固定）:
 *   1. 素質開放率  2. 成長型の発現  3. 近交弱勢ロール  4. 脚質適性の揺らぎ
 */
export function expressPhenotype(
  genotype: Genotype,
  mods: ExpressionModifiers,
  rng: Rng,
  balance: BalanceConfig,
): Phenotype {
  const g = balance.genetics;
  const F = mods.F;

  const boost = Math.min(F * g.INBREED_BOOST_SLOPE, g.INBREED_BOOST_MAX);
  const concentration = Math.min(
    F * balance.INBREED_CONCENTRATION_SLOPE,
    balance.INBREED_CONCENTRATION_MAX,
  );

  // --- 素質値 ---
  const potential: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  for (const key of ABILITY_KEYS) {
    const bounds = balance.traitBounds[key];
    let value = expressNumeric(genotype[key], balance.DOMINANT_WEIGHT);

    value *= 1 + boost; // 素質値ボーナス（§6.5）

    if (mods.concentrationSource !== undefined && concentration > 0) {
      // 血の濃縮: 共通祖先のアレル値へ寄せる（§6.5）
      const ancestorValue = expressNumeric(
        mods.concentrationSource[key],
        balance.DOMINANT_WEIGHT,
      );
      value = value + (ancestorValue - value) * concentration;
    }

    value *= mods.nicksMultiplier; // ニックス（§6.6）

    potential[key] = clamp(Math.round(value), bounds.min, bounds.max);
  }

  // --- 初期 stats = potential × 素質開放率（§6.1-8: 0.28〜0.35） ---
  const unlockRate = rng.range(g.INITIAL_UNLOCK_MIN, g.INITIAL_UNLOCK_MAX);
  const stats: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  for (const key of ABILITY_KEYS) {
    stats[key] = Math.round(potential[key] * unlockRate);
  }

  // --- 気性・丈夫さ（インブリードの代償・§6.5） ---
  const temperBounds = balance.traitBounds['temper'];
  const durabilityBounds = balance.traitBounds['durability'];
  let temper =
    expressNumeric(genotype.temper, balance.DOMINANT_WEIGHT) + F * balance.INBREED_TEMPER_SLOPE;
  let durability =
    expressNumeric(genotype.durability, balance.DOMINANT_WEIGHT) -
    F * balance.INBREED_DURABILITY_SLOPE;
  const injuryRateMult = 1 + F * balance.INBREED_INJURY_SLOPE;

  // --- 成長型の発現（2アレルから等確率） ---
  let growth: GrowthType = rng.bool(0.5) ? genotype.growth.a1 : genotype.growth.a2;

  // --- 近交弱勢（§6.5）: F > 閾値 のとき25%で虚弱。素質ボーナスは維持する ---
  let frail = false;
  if (F > g.INBREED_DEPRESSION_THRESHOLD && rng.bool(balance.INBREED_DEPRESSION_PROB)) {
    frail = true;
    durability -= balance.INBREED_FRAIL_DURABILITY_PENALTY;
    // 「成長型が強制 late 化」。late_bloomer は late より更に遅いのでそのまま残す
    if (growth !== 'late_bloomer') growth = 'late';
  }

  return {
    potential,
    stats,
    unlockRate,
    surfaceAptitude: {
      turf: Math.round(expressNumeric(genotype.surface.turf, balance.DOMINANT_WEIGHT)),
      dirt: Math.round(expressNumeric(genotype.surface.dirt, balance.DOMINANT_WEIGHT)),
    },
    heavyAptitude: Math.round(expressNumeric(genotype.heavy_aptitude, balance.DOMINANT_WEIGHT)),
    distanceCenter: Math.round(expressNumeric(genotype.distance_center, balance.DOMINANT_WEIGHT)),
    distanceRange: Math.round(expressNumeric(genotype.distance_range, balance.DOMINANT_WEIGHT)),
    strategyAptitude: expressStrategyAptitude(
      genotype.strategy_bias.a1,
      genotype.strategy_bias.a2,
      rng,
      balance,
    ),
    growth,
    temper: clamp(Math.round(temper), temperBounds.min, temperBounds.max),
    durability: clamp(Math.round(durability), durabilityBounds.min, durabilityBounds.max),
    injuryRateMult,
    frail,
  };
}

/**
 * 脚質適性の発現。
 * genotype が持つのは strategy_bias の2アレルのみ（§5.4）だが §5.2 は
 * 4脚質 × 0..100 の適性値を要求するため、P0 では
 * 第1バイアス=PRIMARY / 第2バイアス=SECONDARY / 残り=OTHER に揺らぎを載せて写像する。
 */
export function expressStrategyAptitude(
  primary: Strategy,
  secondary: Strategy,
  rng: Rng,
  balance: BalanceConfig,
): Record<Strategy, number> {
  const out: Record<Strategy, number> = { nige: 0, senko: 0, sashi: 0, oikomi: 0 };
  for (const s of STRATEGIES) {
    const base =
      s === primary
        ? balance.STRATEGY_PRIMARY
        : s === secondary
          ? balance.STRATEGY_SECONDARY
          : balance.STRATEGY_OTHER;
    const jitter = rng.range(-balance.STRATEGY_JITTER, balance.STRATEGY_JITTER);
    out[s] = clamp(Math.round(base + jitter), 0, 100);
  }
  return out;
}
