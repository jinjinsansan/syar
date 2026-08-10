/**
 * 故障判定（正典 §7.5）
 *
 * ```
 * injuryProb = 0.0018
 *   * (1 + fatigue / 40)
 *   * (1000 / durability)
 *   * menuIntensity          // 追い切り2.2 / 坂路1.3 / プール0.5 / 休養0
 *   * injuryRateMult         // インブリード由来（§6.5）
 *   * ageFactor              // 4歳以降1.0 → 5歳末1.6 へ線形
 * ```
 *
 * | 重篤度 | 確率 | 休養週 | 恒久ダメージ |
 * |---|---|---|---|
 * | 軽度 | 60% | 3〜6 | なし |
 * | 中度 | 30% | 10〜20 | potential SP -3% |
 * | 重度 | 9% | 30〜52 | potential 全体 -8%, durability -100 |
 * | 致命的 | 1% | — | 競走能力喪失 → 強制引退（繁殖入りは可能） |
 *
 * 【★馬を死なせない】
 *   正典: 「致命的故障でも**引退にとどめる**。心理的ダメージが大きすぎて離脱要因になる。
 *   景品のかかるゲームではなおさら**理不尽な全損を作らない**」
 *
 * 【★恒久ダメージは「仕様」なので、仕様の場所に書く（D-045）】
 *   `potential` が下がると `current > potential` になりえます。
 *   正典 §7.3 は「current が potential を超えることは絶対にない」と定めているので、
 *   **current を新しい potential まで切り下げる**しかありません（案A）。
 *
 *   ★当初これを**成長関数の副作用**として起こしていました。誤りです:
 *     - **落ちる時点がずれる**（故障した週ではなく、次に成長を計算した週）
 *     - **成長を通らない週**（休養中・引退後）で不変条件が破れたままになる
 *     - **原因が効果の場所に書かれていない**
 *   → ここで明示的に行い、**何がどれだけ失われたかを返します**。
 *
 * 【★プレイヤーに明示する（D-045 の条件）】
 *   **黙って8%削るほうが「理不尽」です。** `InjuryResult.permanentLoss` に
 *   失われた量を入れ、UI がそのまま表示できる形で返します。
 */

import type { AbilityKey, Rng } from '@star/sim-engine';
import { ABILITY_KEYS } from '@star/sim-engine';
import { MENUS, type MenuId } from './menus.js';

/**
 * 故障の基礎確率（正典 §7.5 は 0.0018 と書くが、★V-7 の較正ゲートで決める・D-049）。
 *
 * 【★較正の根拠】
 *   V-7a（恒久ダメージを伴う故障を負うキャリアの割合・帯 20〜40%）で較正します。
 *   1,800頭・バランス型・78→260週:
 *
 *     0.0018 → 39.1%（上端まで 0.8 SE）★正典の値だが余裕ほぼゼロ
 *     0.0015 → 34.0%（上端まで 5.4 SE）
 *     ★0.0013 → 29.9%（下端 9.2 SE / 上端 9.4 SE）★最小余裕が最大・帯の中央
 *     0.0011 → 26.6%（下端まで 6.3 SE）
 *
 * ⚠️ **1行で書くこと**（変異試験は行単位で宣言を置換するため）
 */
// prettier-ignore
export const INJURY_BASE_PROB = 0.0013;

/** 正典 §7.5 の `1 + fatigue / 40` の 40。★正典の写し */
export const FATIGUE_DIVISOR = 40;

/** 正典 §7.5 の `1000 / durability` の 1000。★正典の写し（創始水準650・D-009） */
export const DURABILITY_REFERENCE = 1000;

/**
 * 正典 §7.5 の ageFactor: 「4歳以降1.0 → 5歳末1.6 へ線形」。
 * 4歳 = 208週 / 5歳末 = 260週（§7.1 のタイムライン）。
 * ★**4歳未満は 1.0**（正典に規定が無いので下側は伸ばさない。照会 Q-P3-9）。
 */
export const AGE_FACTOR = { fromWeeks: 208, toWeeks: 260, from: 1.0, to: 1.6 } as const;

/** 重篤度（正典 §7.5） */
export type InjurySeverity = 'mild' | 'moderate' | 'severe' | 'career_ending';

/** 正典 §7.5 の重篤度分布・休養週・恒久ダメージ。★すべて正典の写し */
export const SEVERITY_TABLE: readonly {
  readonly severity: InjurySeverity;
  readonly weight: number;
  readonly restWeeks: readonly [number, number] | null;
}[] = [
  { severity: 'mild', weight: 0.60, restWeeks: [3, 6] },
  { severity: 'moderate', weight: 0.30, restWeeks: [10, 20] },
  { severity: 'severe', weight: 0.09, restWeeks: [30, 52] },
  { severity: 'career_ending', weight: 0.01, restWeeks: null },
];

/** 中度の恒久ダメージ: potential SP −3%。★正典の写し */
export const MODERATE_SP_LOSS = 0.03;
/** 重度の恒久ダメージ: potential 全体 −8%。★正典の写し */
export const SEVERE_ALL_LOSS = 0.08;
/** 重度の恒久ダメージ: durability −100。★正典の写し */
export const SEVERE_DURABILITY_LOSS = 100;

/** 年齢による故障率の倍率（§7.5） */
export function ageFactor(ageWeeks: number): number {
  const { fromWeeks, toWeeks, from, to } = AGE_FACTOR;
  if (ageWeeks <= fromWeeks) return from;
  if (ageWeeks >= toWeeks) return to;
  return from + ((to - from) * (ageWeeks - fromWeeks)) / (toWeeks - fromWeeks);
}

export interface InjuryRiskInput {
  readonly menu: MenuId;
  readonly fatigue: number;
  readonly durability: number;
  readonly injuryRateMult: number;
  readonly ageWeeks: number;
}

/**
 * その週の故障確率（§7.5）。
 * ★`durability` が 0 以下でも壊れないようにします（0 除算で Infinity になる）。
 */
export function injuryProbability(input: InjuryRiskInput): number {
  const { menu, fatigue, durability, injuryRateMult, ageWeeks } = input;
  const intensity = MENUS[menu].intensity;
  if (intensity === 0) return 0; // 休養では故障しない（§7.5 の menuIntensity 0）
  const dur = Math.max(1, durability);
  const p =
    INJURY_BASE_PROB *
    (1 + fatigue / FATIGUE_DIVISOR) *
    (DURABILITY_REFERENCE / dur) *
    intensity *
    injuryRateMult *
    ageFactor(ageWeeks);
  return Math.max(0, Math.min(1, p));
}

/** 故障で永久に失われたもの。★プレイヤーに明示するための内訳（D-045） */
export interface PermanentLoss {
  /** 能力ごとの素質の減少量（正の値）。0 の能力は含めない */
  readonly potential: Partial<Record<AbilityKey, number>>;
  /** 丈夫さの減少量（正の値） */
  readonly durability: number;
  /** ★素質が下がったことで現在値も切り下げられた量（正の値）。0 の能力は含めない */
  readonly current: Partial<Record<AbilityKey, number>>;
}

export interface HorseInjuryState {
  readonly potential: Readonly<Record<AbilityKey, number>>;
  readonly current: Readonly<Record<AbilityKey, number>>;
  readonly durability: number;
}

export interface InjuryResult {
  readonly severity: InjurySeverity;
  /** 休養週数。致命的なら null（引退） */
  readonly restWeeks: number | null;
  /** ★致命的: 競走能力喪失 → 強制引退。**馬は死なない**（繁殖入りは可能） */
  readonly careerEnding: boolean;
  readonly potential: Record<AbilityKey, number>;
  readonly current: Record<AbilityKey, number>;
  readonly durability: number;
  /** ★永久に失われたもの。**UI がそのまま表示できる形**で返す（D-045） */
  readonly permanentLoss: PermanentLoss;
}

/** 重篤度を引く（§7.5 の 60/30/9/1%） */
export function rollSeverity(rng: Rng): InjurySeverity {
  const r = rng.float();
  let acc = 0;
  for (const row of SEVERITY_TABLE) {
    acc += row.weight;
    if (r < acc) return row.severity;
  }
  return SEVERITY_TABLE[SEVERITY_TABLE.length - 1]!.severity;
}

/**
 * 故障を適用し、**恒久ダメージと現在値の切り下げをここで確定させる**（D-045）。
 *
 * ★`current > potential` を作らないのは**この関数の責務**です。
 *   成長関数に任せると、休養中・引退後など**成長を通らない週で不変条件が破れます**。
 */
export function applyInjury(
  state: HorseInjuryState,
  severity: InjurySeverity,
  rng: Rng,
): InjuryResult {
  const row = SEVERITY_TABLE.find((x) => x.severity === severity)!;
  const restWeeks = row.restWeeks === null ? null : rng.int(row.restWeeks[0], row.restWeeks[1]);

  const potential = { ...state.potential } as Record<AbilityKey, number>;
  const lostPotential: Partial<Record<AbilityKey, number>> = {};
  let durability = state.durability;
  let lostDurability = 0;

  if (severity === 'moderate') {
    const loss = potential.sp * MODERATE_SP_LOSS;
    potential.sp -= loss;
    lostPotential.sp = loss;
  } else if (severity === 'severe') {
    for (const k of ABILITY_KEYS) {
      const loss = potential[k] * SEVERE_ALL_LOSS;
      potential[k] -= loss;
      lostPotential[k] = loss;
    }
    lostDurability = Math.min(SEVERE_DURABILITY_LOSS, durability);
    durability -= lostDurability;
  }

  // ★現在値の切り下げはここで行う（成長関数の副作用にしない・D-045）
  const current = { ...state.current } as Record<AbilityKey, number>;
  const lostCurrent: Partial<Record<AbilityKey, number>> = {};
  for (const k of ABILITY_KEYS) {
    if (current[k] > potential[k]) {
      lostCurrent[k] = current[k] - potential[k];
      current[k] = potential[k];
    }
  }

  return {
    severity,
    restWeeks,
    careerEnding: severity === 'career_ending',
    potential,
    current,
    durability,
    permanentLoss: { potential: lostPotential, durability: lostDurability, current: lostCurrent },
  };
}

/** 恒久ダメージがあったか（★プレイヤーへの明示が必要かの判定） */
export function hasPermanentLoss(loss: PermanentLoss): boolean {
  return (
    loss.durability > 0 ||
    Object.keys(loss.potential).length > 0 ||
    Object.keys(loss.current).length > 0
  );
}
