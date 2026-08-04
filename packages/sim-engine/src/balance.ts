/**
 * チューニング定数（正典 §13.1 + P0 で必要になった補完定数）
 *
 * 正典 §13 の原則: **全定数は config として外出しし、コードにベタ書きしない。**
 * エンジン側の関数はすべて BalanceConfig を引数で受け取り、この既定値に依存しない。
 */

import type { GrowthType, NumericTraitKey, SkillGene, Strategy } from './types.js';

// ---------------------------------------------------------------------------
// 正典 §13.1 の BALANCE（原文のまま外出し）
// ---------------------------------------------------------------------------

export interface BalanceGenetics {
  ATAVISM_RATE: number;
  BIG_ATAVISM_RATE: number;
  MUTATION_SD: number;
  BIG_MUTATION_RATE: number;
  BIG_MUTATION_SD: number;
  INBREED_BOOST_MAX: number;
  INBREED_BOOST_SLOPE: number;
  INBREED_DEPRESSION_THRESHOLD: number;
  INITIAL_UNLOCK_MIN: number;
  INITIAL_UNLOCK_MAX: number;
}

/**
 * 正典 §13.1 の定数群。
 * P0 で実際に使うのは遺伝ブロックのみ。育成(§7)/レース(§8)/介入(§8b) の定数は
 * 正典との対応を崩さないためにここへ写経しておく（P1 以降で使用）。
 */
export const BALANCE = {
  // 遺伝 (§6) —— P0 で使用
  ATAVISM_RATE: 0.06,
  BIG_ATAVISM_RATE: 0.015,
  MUTATION_SD: 45,
  BIG_MUTATION_RATE: 0.008,
  BIG_MUTATION_SD: 180,
  INBREED_BOOST_MAX: 0.3,
  INBREED_BOOST_SLOPE: 4.0,
  INBREED_DEPRESSION_THRESHOLD: 0.25,
  INITIAL_UNLOCK_MIN: 0.28,
  INITIAL_UNLOCK_MAX: 0.35,

  // 育成 (§7) —— P3 で使用（P0 では未使用）
  BASE_GAIN: 12,
  HEADROOM_EXP: 0.7,
  INJURY_BASE: 0.0018,

  // レース (§8) —— P1 で使用（P0 では未使用）
  RACE_RANDOM_K: 0.12,

  // 介入 (§8b・D-006) —— P1 で使用（P0 では未使用）
  INTERVENTION_CAP: 0.1,
  AI_PROXY_TARGET: 0.95,
  LAG_WINDOW_MS: 150,
  TAP_RATE_CAP: 15,
  STAMINA_SPURT_DRAIN: 3.0,
  EARLY_SPURT_METER: 900,
} as const;

// ---------------------------------------------------------------------------
// P0 補完定数（正典に数値の明記がなく、実装のために定義が必要だったもの）
// 逸脱ではなく「解釈で埋めた箇所」。REPORT_P0 §5 に全件列挙する。
// ---------------------------------------------------------------------------

export interface TraitBound {
  min: number;
  max: number;
}

/**
 * 数値形質の値域。
 * - 能力5種: 正典 §5.1「各 0〜1000」/ §13.3「アレル値上限1000」
 * - surface: 正典 §5.2「turf/dirt: 0..100」
 * - temper: 正典 §5.3「0..100」
 * - durability: 正典 §5.3「0..1000」
 * - distance_center / distance_range: 正典に値域の明記なし。§5.4 の genotype 例
 *   （center 1800/2400, range 600/900）と実在の距離帯を包含する範囲を P0 で定義。
 */
export const TRAIT_BOUNDS: Readonly<Record<NumericTraitKey, TraitBound>> = {
  sp: { min: 0, max: 1000 },
  st: { min: 0, max: 1000 },
  pw: { min: 0, max: 1000 },
  gt: { min: 0, max: 1000 },
  iq: { min: 0, max: 1000 },
  'surface.turf': { min: 0, max: 100 },
  'surface.dirt': { min: 0, max: 100 },
  distance_center: { min: 1000, max: 3600 },
  distance_range: { min: 200, max: 1200 },
  temper: { min: 0, max: 100 },
  durability: { min: 0, max: 1000 },
};

export interface BalanceConfig {
  genetics: BalanceGenetics;
  traitBounds: Readonly<Record<NumericTraitKey, TraitBound>>;

  /** 突然変異の clamp 幅（正典 §6.4: ±150。0〜1000 スケール基準） */
  MUTATION_CLAMP: number;
  /**
   * 突然変異の基準スケール。
   * 正典 §6.4 の N(0,45)/clamp±150 は 0〜1000 スケールの能力値を前提とした値なので、
   * 値域の異なる形質（surface 0〜100 等）へは (max-min)/MUTATION_SCALE_BASE 倍して適用する。
   */
  MUTATION_SCALE_BASE: number;

  /** 血の濃縮 lerp（正典 §6.5: min(F*1.2, 0.35)） */
  INBREED_CONCENTRATION_SLOPE: number;
  INBREED_CONCENTRATION_MAX: number;
  /** 近交弱勢（正典 §6.5） */
  INBREED_TEMPER_SLOPE: number;
  INBREED_DURABILITY_SLOPE: number;
  INBREED_INJURY_SLOPE: number;
  INBREED_DEPRESSION_PROB: number;
  INBREED_FRAIL_DURABILITY_PENALTY: number;

  /** 血統探索の代数（正典 §6.5: 5代まで） */
  PEDIGREE_DEPTH: number;

  /**
   * 【正典外・提案機構】平均回帰率。既定 0 = 完全に無効（正典どおりの挙動）。
   *
   * 正典 §13.3 は血統インフレ抑制の三本柱を「アレル値上限1000 / 突然変異が負にも振れる /
   * headroom」としているが、P0 の実測ではこの3つでは V-2（+50%以内）を満たせない:
   *   - 上限1000 は +122% の位置にある「壁」であって抑制力ではない
   *   - 平均0の対称な突然変異は、方向性選抜と組み合わさると毎世代その正の裾が選ばれるため
   *     抑制どころかインフレの燃料になる
   *   - headroom は current（調教）側の頭打ちであり potential には効かない
   * 実在サラブレッドが強い選抜下でも能力が頭打ちになるのは選抜停滞（selection plateau）
   * によるもので、それを表現する機構が正典に存在しない。
   *
   * 本定数はその候補として用意した「品種平均への回帰」で、突然変異ノイズに
   *   -(アレル値 - 品種中心) × REGRESSION_RATE
   * のドリフトを加える。分散（= V-1 のばらつき）は維持したまま平均だけが平衡点に落ち着く。
   * **採否はレビュー側/オーナーの判断事項（QUESTIONS_P0 Q1）。承認まで既定 0 のまま。**
   */
  REGRESSION_RATE: number;
  /** 回帰先の中心（形質値域内の比率）。0.45 なら 0〜1000 の形質で 450 */
  REGRESSION_CENTER_RATIO: number;

  /**
   * 素質値の発現ウェイト。potential = 高い方のアレル×w + 低い方×(1-w)。
   * 0.5 = 相加的（優劣なし）。正典 §5.4 は2アレル保持を定めるが発現規則は未定義のため P0 で定義。
   */
  DOMINANT_WEIGHT: number;

  /** 脚質適性の発現（正典 §5.2 は 0..100 の4値を定めるが genotype は bias 2アレルのみ） */
  STRATEGY_PRIMARY: number;
  STRATEGY_SECONDARY: number;
  STRATEGY_OTHER: number;
  STRATEGY_JITTER: number;

  /** スキル遺伝子（正典 §5.3: 最大3個） */
  SKILL_GENE_MAX: number;
  SKILL_GENE_INHERIT_RATE: number;
  /** 新規スキル遺伝子の獲得率。0 だと世代を経るごとに遺伝子プールが枯渇するため P0 で定義 */
  SKILL_GENE_MUTATION_RATE: number;
  SKILL_GENE_POOL: readonly SkillGene[];

  /** 生産上限（正典 §6.7） */
  MARE_LIFETIME_FOALS: number;
  STALLION_BASE_COVERINGS: number;
  STALLION_COVERINGS_PER_G1: number;
  /** 繁殖可能になる年齢。正典 §7.1「260週(5歳末)で強制引退→繁殖入り」より6歳 */
  MIN_BREEDING_AGE_YEARS: number;
}

/** 正典 §8.5 のスキル6種に対応する遺伝子プール */
export const SKILL_GENE_POOL: readonly SkillGene[] = [
  'G_SPURT', // 末脚爆発
  'G_ESCAPE', // 逃げ粘り
  'G_GATE', // ゲート巧者
  'G_MUD', // 雨得意
  'G_INNER', // 内枠強者
  'G_STAYER', // 長距離砲
];

export const DEFAULT_BALANCE: BalanceConfig = {
  genetics: {
    ATAVISM_RATE: BALANCE.ATAVISM_RATE,
    BIG_ATAVISM_RATE: BALANCE.BIG_ATAVISM_RATE,
    MUTATION_SD: BALANCE.MUTATION_SD,
    BIG_MUTATION_RATE: BALANCE.BIG_MUTATION_RATE,
    BIG_MUTATION_SD: BALANCE.BIG_MUTATION_SD,
    INBREED_BOOST_MAX: BALANCE.INBREED_BOOST_MAX,
    INBREED_BOOST_SLOPE: BALANCE.INBREED_BOOST_SLOPE,
    INBREED_DEPRESSION_THRESHOLD: BALANCE.INBREED_DEPRESSION_THRESHOLD,
    INITIAL_UNLOCK_MIN: BALANCE.INITIAL_UNLOCK_MIN,
    INITIAL_UNLOCK_MAX: BALANCE.INITIAL_UNLOCK_MAX,
  },
  traitBounds: TRAIT_BOUNDS,

  MUTATION_CLAMP: 150,
  MUTATION_SCALE_BASE: 1000,

  INBREED_CONCENTRATION_SLOPE: 1.2,
  INBREED_CONCENTRATION_MAX: 0.35,
  INBREED_TEMPER_SLOPE: 120,
  INBREED_DURABILITY_SLOPE: 350,
  INBREED_INJURY_SLOPE: 2.0,
  INBREED_DEPRESSION_PROB: 0.25,
  INBREED_FRAIL_DURABILITY_PENALTY: 200,

  PEDIGREE_DEPTH: 5,

  // 正典外の提案機構。承認まで無効（0）
  REGRESSION_RATE: 0,
  REGRESSION_CENTER_RATIO: 0.45,

  DOMINANT_WEIGHT: 0.5,

  STRATEGY_PRIMARY: 85,
  STRATEGY_SECONDARY: 70,
  STRATEGY_OTHER: 30,
  STRATEGY_JITTER: 10,

  SKILL_GENE_MAX: 3,
  SKILL_GENE_INHERIT_RATE: 0.5,
  SKILL_GENE_MUTATION_RATE: 0.02,
  SKILL_GENE_POOL,

  MARE_LIFETIME_FOALS: 8,
  STALLION_BASE_COVERINGS: 20,
  STALLION_COVERINGS_PER_G1: 10,
  MIN_BREEDING_AGE_YEARS: 6,
};

// ---------------------------------------------------------------------------
// 創始世代（指示書 §3.3 で新規定義された定数。チューニング対象）
// ---------------------------------------------------------------------------

export interface FoundersConfig {
  ABILITY_MEAN: number;
  ABILITY_SD: number;
  ABILITY_MIN: number;
  ABILITY_MAX: number;
  TEMPER_MEAN: number;
  TEMPER_SD: number;
  TEMPER_MIN: number;
  TEMPER_MAX: number;
  DURABILITY_MEAN: number;
  DURABILITY_SD: number;
  DURABILITY_MIN: number;
  DURABILITY_MAX: number;
  DISTANCE_CENTER_RANGE: readonly [number, number];
  DISTANCE_RANGE_RANGE: readonly [number, number];
  /** 正典・指示書ともに未定義。P0 で定義（芝/ダート適性アレルの一様範囲） */
  SURFACE_RANGE: readonly [number, number];
  SKILL_GENE_COUNT: readonly [number, number];
  /** 血統ライン数（指示書 §3.3: LINE_A〜LINE_T の20系統） */
  LINE_COUNT: number;
  /** 脚質バイアス / 成長型の創始分布。指示書に指定がないため一様分布とする */
  STRATEGY_POOL: readonly Strategy[];
  GROWTH_POOL: readonly GrowthType[];
}

export const FOUNDERS: FoundersConfig = {
  ABILITY_MEAN: 450,
  ABILITY_SD: 110,
  ABILITY_MIN: 100,
  ABILITY_MAX: 850,
  TEMPER_MEAN: 50,
  TEMPER_SD: 15,
  TEMPER_MIN: 5,
  TEMPER_MAX: 95,
  DURABILITY_MEAN: 650,
  DURABILITY_SD: 100,
  DURABILITY_MIN: 300,
  DURABILITY_MAX: 950,
  DISTANCE_CENTER_RANGE: [1200, 3000],
  DISTANCE_RANGE_RANGE: [400, 1000],
  SURFACE_RANGE: [20, 90],
  SKILL_GENE_COUNT: [0, 2],
  LINE_COUNT: 20,
  STRATEGY_POOL: ['nige', 'senko', 'sashi', 'oikomi'],
  GROWTH_POOL: ['early', 'normal', 'late', 'late_bloomer'],
};

// ---------------------------------------------------------------------------
// ニックステーブル生成（指示書 §3.3: 20×20 のうち5%のセルに 1.05〜1.15）
// ---------------------------------------------------------------------------

export interface NicksGenConfig {
  HIT_RATIO: number;
  MULT_MIN: number;
  MULT_MAX: number;
}

export const NICKS_GEN: NicksGenConfig = {
  HIT_RATIO: 0.05,
  MULT_MIN: 1.05,
  MULT_MAX: 1.15,
};
