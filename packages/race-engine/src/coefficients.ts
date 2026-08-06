/**
 * 基礎スコアと乗算補正（正典 §8.2・§8.3・§8.4）
 *
 * すべて純関数。乱数を使うのはスキル発動判定（skills.ts）だけで、ここには一切入れない
 * ——「同じ入力なら同じ係数」がテストで固定できる形にしておくため。
 */

import type { AbilityKey, Strategy } from '@star/sim-engine';
import { ABILITY_KEYS } from '@star/sim-engine';
import { ABILITY_WEIGHTS, DISTANCE_BANDS, PACE_STRATEGY_EFFECT, type RaceBalance } from './balance.js';
import type {
  CourseShape,
  DistanceBand,
  Pace,
  RaceEntrant,
  Surface,
  TrackCondition,
} from './types.js';

/**
 * ★NaN は `<` `>` の両方が false になるため、素朴な三項演算子の clamp を**素通りする**（O-7）。
 *   係数が NaN になると score が NaN になり、着順比較がすべて false になって
 *   「入力順のまま」という静かな破綻を生む（R-3）。中央値に倒して止める。
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return value < min ? min : value > max ? max : value;
}

/** 0〜100 の適性を [min, max] へ線形写像する（I-DIST-MAP / I-SURF-MAP / I-STRATEGY-APT-MAP 共通） */
export function mapAptitude(aptitude0to100: number, min: number, max: number): number {
  return min + clamp(aptitude0to100, 0, 100) / 100 * (max - min);
}

/** 距離帯の判定（正典 §8.2） */
export function distanceBandOf(distance: number): DistanceBand {
  for (const entry of DISTANCE_BANDS) {
    if (distance <= entry.maxDistance) return entry.band;
  }
  // DISTANCE_BANDS の最終要素は Infinity なので到達しない
  throw new Error(`distanceBandOf: 距離帯を決定できない (${distance})`);
}

/**
 * 基礎スコア（正典 §8.2）: `base = Σ stats[key] * weight[key][band]`
 *
 * ★`stats`（現在値）を使う。`potential` ではない（正典 §2 / §8.2）。
 */
export function baseScore(
  stats: Record<AbilityKey, number>,
  distance: number,
  /** 長距離砲（§8.5）が発動していれば ST の寄与を増やす */
  stayerBonus = 0,
): number {
  const weights = ABILITY_WEIGHTS[distanceBandOf(distance)];
  let sum = 0;
  for (const key of ABILITY_KEYS) {
    const w = key === 'st' ? weights[key] * (1 + stayerBonus) : weights[key];
    sum += stats[key] * w;
  }
  return sum;
}

/** 距離適性（正典 §5.2 の正規分布カーブ。0〜100） */
export function distanceAptitude(distance: number, center: number, range: number): number {
  if (!(range > 0)) {
    throw new Error(`distanceAptitude: range は正の数であること (${range})`);
  }
  const d = distance - center;
  return 100 * Math.exp(-(d * d) / (2 * range * range));
}

/** §8.3 distanceAptitudeCoef（I-DIST-MAP） */
export function distanceAptitudeCoef(
  distance: number,
  center: number,
  range: number,
  balance: RaceBalance,
): number {
  return mapAptitude(
    distanceAptitude(distance, center, range),
    balance.DISTANCE_COEF_MIN,
    balance.DISTANCE_COEF_MAX,
  );
}

/** §8.3 surfaceCoef（I-SURF-MAP） */
export function surfaceCoef(
  surfaceAptitude: Record<Surface, number>,
  surface: Surface,
  balance: RaceBalance,
): number {
  return mapAptitude(surfaceAptitude[surface], balance.SURFACE_COEF_MIN, balance.SURFACE_COEF_MAX);
}

/**
 * §8.3 trackConditionCoef（I-COND-APT-MAP）
 *
 * 正典「良馬場は常に1.0」— 適性値によらず 1.0 を返す。
 */
export function trackConditionCoef(
  heavyAptitude: number,
  trackCondition: TrackCondition,
  balance: RaceBalance,
): number {
  // 正典「良馬場は常に1.0」— 道悪適性によらず 1.0（「良馬場が得意」は無意味・D-015）
  if (trackCondition === 'good') return 1.0;
  // ★悪い馬場ほど適性差が大きく出る（I-HEAVY-SEVERITY）。
  //   稍重も不良も同じ係数なら、正典どおり4段にした意味が消える。
  const severity = balance.TRACK_COND_SEVERITY[trackCondition];
  const full = mapAptitude(
    heavyAptitude,
    balance.TRACK_COND_COEF_MIN,
    balance.TRACK_COND_COEF_MAX,
  );
  return 1 + severity * (full - 1);
}

/** §8.4 展開の決定。逃げ宣言頭数から決まる */
export function decidePace(nigeCount: number, balance: RaceBalance): Pace {
  if (nigeCount >= balance.PACE_HIGH_NIGE_COUNT) return 'high';
  if (nigeCount <= balance.PACE_SLOW_NIGE_COUNT) return 'slow';
  return 'middle';
}

/**
 * §8.3 strategyCoef = 展開との噛み合い（§8.4）× 脚質適性
 *
 * 正典 §8.4 は2つの効果を並べて書いている:
 *   (1) ペースと脚質の組み合わせによる ±%（表）
 *   (2) 脚質適性 `strategy_aptitude[選択脚質]/100` が 0.85〜1.05 で効く
 * 両方が strategyCoef に入る（§8.3 は strategyCoef を1つしか持たないため）。
 */
export function strategyCoef(
  strategy: Strategy,
  strategyAptitude: Record<Strategy, number>,
  pace: Pace,
  balance: RaceBalance,
): number {
  const paceEffect = 1 + PACE_STRATEGY_EFFECT[pace][strategy];
  const aptEffect = mapAptitude(
    strategyAptitude[strategy],
    balance.STRATEGY_APT_COEF_MIN,
    balance.STRATEGY_APT_COEF_MAX,
  );
  return paceEffect * aptEffect;
}

/** §8.3 conditionCoef（I-CONDITION-MAP） */
export function conditionCoef(condition: number, balance: RaceBalance): number {
  const span = balance.CONDITION_MAX - balance.CONDITION_MIN;
  const t = clamp((condition - balance.CONDITION_MIN) / span, 0, 1);
  return balance.CONDITION_COEF_MIN + t * (balance.CONDITION_COEF_MAX - balance.CONDITION_COEF_MIN);
}

/**
 * §8.3 fatigueCoef = `1 - fatigue / 500`
 *
 * ★下限0でクランプする（O-7）。疲労が 500 を超えると係数が負になり、
 *   スコアの符号が反転して**最も疲れた馬が最強**になる。
 *   `randomMult` 側には `Math.max(0,…)` の防御があるのに、ここだけ無防備だった（非対称）。
 */
export function fatigueCoef(fatigue: number, balance: RaceBalance): number {
  return clamp(1 - fatigue / balance.FATIGUE_DIV, 0, 1);
}

/** §8.3 weightCoef: 基準55kg・±1kg ごとに ∓0.8% */
/**
 * ★同じく下限でクランプする（O-7）。基準から +125kg で係数が0、それ以上で負になる。
 *   現実的な斤量では起きないが、**符号が反転しうる式を無防備に置かない**。
 */
export function weightCoef(weightKg: number, baseWeightKg: number, balance: RaceBalance): number {
  return clamp(1 - (weightKg - baseWeightKg) * balance.WEIGHT_PER_KG, 0, 2);
}

/**
 * §8.3 gateCoef（I-GATE-MAP）
 *
 * 直線コースは枠順の有利不利が無いので 1.0。
 * 周回コースは内枠有利で、距離が伸びるほど薄まる（ポジション争いの比重が下がる）。
 */
export function gateCoef(
  gate: number,
  fieldSize: number,
  distance: number,
  courseShape: CourseShape,
  balance: RaceBalance,
): number {
  if (courseShape === 'straight') return 1.0;
  if (fieldSize <= 1) return 1.0;
  // 内枠 +1 〜 外枠 -1 の位置スコア
  const position = 1 - (2 * (clamp(gate, 1, fieldSize) - 1)) / (fieldSize - 1);
  const span = balance.GATE_ZERO_DISTANCE - balance.GATE_FULL_DISTANCE;
  const distanceFactor = clamp(1 - (distance - balance.GATE_FULL_DISTANCE) / span, 0, 1);
  return 1 + position * balance.GATE_MAX_EDGE * distanceFactor;
}

/**
 * §8.3 ageCoef（I-AGE-CURVE）
 *
 * 正典が与える3点: 2歳 0.88 / 4歳 1.00 / 5歳末 0.96。
 * 2→4歳を線形、4→5歳末（=6歳到達時点）を線形、6歳以降は頭打ち。
 */
export function ageCoef(age: number, balance: RaceBalance): number {
  const { AGE_COEF_2: a2, AGE_COEF_4: a4, AGE_COEF_5_END: a5 } = balance;
  if (age <= 2) return a2;
  if (age <= 4) return a2 + ((age - 2) / 2) * (a4 - a2);
  if (age <= 6) return a4 + ((age - 4) / 2) * (a5 - a4);
  return a5;
}

/** レース1頭ぶんの、スキル以外の全補正（純関数・乱数なし） */
export function deterministicCoefs(
  entrant: RaceEntrant,
  params: {
    distance: number;
    surface: Surface;
    trackCondition: TrackCondition;
    courseShape: CourseShape;
    baseWeightKg: number;
    fieldSize: number;
    pace: Pace;
  },
  balance: RaceBalance,
): {
  distanceAptitudeCoef: number;
  surfaceCoef: number;
  trackConditionCoef: number;
  strategyCoef: number;
  conditionCoef: number;
  fatigueCoef: number;
  weightCoef: number;
  gateCoef: number;
  ageCoef: number;
} {
  return {
    distanceAptitudeCoef: distanceAptitudeCoef(
      params.distance,
      entrant.distanceCenter,
      entrant.distanceRange,
      balance,
    ),
    surfaceCoef: surfaceCoef(entrant.surfaceAptitude, params.surface, balance),
    trackConditionCoef: trackConditionCoef(entrant.heavyAptitude, params.trackCondition, balance),
    strategyCoef: strategyCoef(entrant.strategy, entrant.strategyAptitude, params.pace, balance),
    conditionCoef: conditionCoef(entrant.condition, balance),
    fatigueCoef: fatigueCoef(entrant.fatigue, balance),
    weightCoef: weightCoef(entrant.weightKg, params.baseWeightKg, balance),
    gateCoef: gateCoef(
      entrant.gate,
      params.fieldSize,
      params.distance,
      params.courseShape,
      balance,
    ),
    ageCoef: ageCoef(entrant.age, balance),
  };
}
