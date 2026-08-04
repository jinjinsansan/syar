/**
 * チューニング定数（正典 §13.1 + P0 で必要になった補完定数）
 *
 * 正典 §13 の原則: **全定数は config として外出しし、コードにベタ書きしない。**
 * エンジン側の関数はすべて BalanceConfig を引数で受け取り、この既定値に依存しない。
 */

import { ABILITY_KEYS } from './types.js';
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
  BIG_ATAVISM_RATE: 0.015, // ★単調上昇ラチェット・§6.3 の警告参照
  MUTATION_SD: 90, // D-008 で 45→90（回帰で削られる分散を補償する）
  BIG_MUTATION_RATE: 0.008,
  BIG_MUTATION_SD: 180,
  REGRESSION_RATE: 0.2, // ★平均回帰（D-008・§6.4）血統インフレの唯一の実効抑制
  REGRESSION_CENTER_RATIO: 0.45, // 回帰先＝値域の45%（0〜1000形質なら450）
  DOMINANT_WEIGHT: 0.5, // 素質発現＝2アレルの相加平均。★0.5超は系統的な上げ要因になる
  MUTATION_CLAMP_RATIO: 150 / 90, // clamp幅 ÷ sd（正典 §6.4: ±150 と N(0,90) の比）
  INBREED_BOOST_MAX: 0.3,
  INBREED_BOOST_SLOPE: 4.0,
  INBREED_DEPRESSION_THRESHOLD: 0.25,
  INITIAL_UNLOCK_MIN: 0.28,
  INITIAL_UNLOCK_MAX: 0.35,

  // 育成 (§7) —— P3 で使用（P0 では未使用）
  BASE_GAIN: 12,
  HEADROOM_EXP: 0.7,
  // ⚠️ INJURY_BASE は §7.5 で `1000 / durability` を掛ける前提であり、
  //    **丈夫さの集団水準が創始値 650 近傍にあること**を暗黙の基準にしている。
  //    回帰中心を誤って 450 にしていた間は故障率が約1.44倍になっていた（D-009 で是正）。
  //    丈夫さの水準を動かす変更をするときは、この定数の較正もやり直すこと（P1 への申し送り）。
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

/**
 * 形質別の変異挙動の上書き。未指定の項目は既定（値域比スケール・共通の回帰率）に従う。
 */
export interface TraitMutationSpec {
  /** 変異SDを絶対値で指定する（形質の単位そのまま）。省略時は値域比スケール */
  sd?: number;
  /** 変異の clamp 幅を絶対値で指定する。省略時は値域比スケール */
  clamp?: number;
  /** この形質にだけ適用する回帰率。省略時は共通の REGRESSION_RATE */
  regressionRate?: number;
  /**
   * 品種中心（回帰の引き戻し先）。**その形質の創始分布の期待値**を使う（正典 §6.4・D-009）。
   * 省略時は値域比（REGRESSION_CENTER_RATIO）にフォールバックするが、
   * それは正典から参照されない保険であり、全形質に center を与えるのが正しい。
   */
  center?: number;
}

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
   * 平均回帰率（正典 §6.4 の機構・D-008 で採択）。
   *
   * 突然変異ノイズに `-(アレル値 - 品種中心) × REGRESSION_RATE` のドリフトを加える。
   * 分散（= V-1 のばらつき）は突然変異で維持したまま、平均だけが平衡点に落ち着く。
   * 実在サラブレッドの**選抜停滞（selection plateau）**を表現するもので、
   * 正典 §13.3 が明記するとおり**血統インフレの唯一の実効的な抑制機構**である
   * （アレル値上限・対称な突然変異・headroom はいずれも平均の上昇を止めないことが P0 で実証済み）。
   *
   * ⚠️ 本定数を弱める/外す場合は、単調上昇ラチェットである大物覚醒（§6.3）の
   *    発生率も併せて見直すこと。回帰がこれを相殺する前提で機構が残されている。
   */
  REGRESSION_RATE: number;
  /**
   * 【役目を終えた定数・フォールバック専用】回帰先を値域比で決める旧方式（値域の45%）。
   *
   * D-009 で回帰中心は形質ごとの創始水準（`traitMutation[key].center`）に変わった。
   * **正典からは参照されない。** `center` が未指定の形質が現れた場合の保険としてのみ残す。
   */
  REGRESSION_CENTER_RATIO: number;

  /**
   * 形質ごとの変異・回帰パラメータ（正典 §6.4 の表・§13.1・D-009/D-012）。
   * 品種中心と sd はここで形質ごとに与える。`buildTraitMutation()` が創始定義から導出する。
   */
  traitMutation: Readonly<Partial<Record<NumericTraitKey, TraitMutationSpec>>>;

  /**
   * 大物覚醒（§6.3）の適用対象形質。**能力5種のみ**（正典 §6.3・D-011）。
   *
   * 「大物」= 能力の高い名馬という意味なので、能力以外の形質に
   * 「祖先の最大値を引く」単調ラチェットをかけると設計意図と食い違う。
   * 特に**気性は「高いほど気性難」**（§5.3）なので、覚醒するたびに馬が扱いにくくなる
   * という逆向きの効果になっていた。距離適性への適用は distance_range を押し上げて
   * 全馬を万能型に近づけ、§5.2 の分化を損なっていた（実測: 非能力6形質すべてが上方向へ）。
   *
   * 通常の隔世遺伝（6%・ランダムな祖父母のアレル）は**全形質に適用したまま**。
   */
  BIG_ATAVISM_TRAITS: readonly NumericTraitKey[];

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

// ---------------------------------------------------------------------------
// 創始世代（指示書 §3.3 で新規定義された定数。チューニング対象）
// 回帰中心をここから導出するため、DEFAULT_BALANCE より前に定義する
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
// 形質別の変異・回帰パラメータ（正典 §6.4 の表・§13.1 TRAIT_MUTATION・D-009）
// ---------------------------------------------------------------------------

/** 一様分布 [a, b] の期待値 */
function uniformMean(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/** 一様分布 [a, b] の標準偏差 */
function uniformSd(range: readonly [number, number]): number {
  return (range[1] - range[0]) / Math.sqrt(12);
}

/**
 * 形質別の変異・回帰パラメータを**創始定義から導出**する（正典 §6.4・D-009）。
 *
 * ★品種中心は「値域の45%」ではなく、その形質の**創始分布の期待値**を使う。
 *   値域から機械的に算出すると創始中心と一致するのは能力5種だけで、
 *   丈夫さ（創始650 / 値域中心450）のように選抜圧のかからない形質は
 *   引き戻しに対抗できず、世代とともに恒久的な水準ずれになる。
 *   実測（P0-fix2 レビュー側監査）: 丈夫さが 20ゲーム内年で 650 → 449 へ収束していた。
 *   丈夫さは §7.5 の故障率の分母なので、これは INJURY_BASE の較正を丸ごと無効化する。
 *
 * FOUNDERS から導出しているのは、創始定義と回帰中心が将来ずれないようにするため
 * （FOUNDERS.DURABILITY_MEAN を変えたら回帰中心も自動で追随する）。
 * 実際の値は正典 §13.1 の表とリテラル一致することをテストで固定している。
 *
 * ★上書きするのは **sd（と比例する clamp）と品種中心だけ**。回帰率・clamp比は全形質共通（0.20 / 1.67）。
 *
 * 非能力形質は2条件を同時に満たす必要があり、sd は回帰率から従属的に決まる:
 *   1. 集団平均が創始水準から動かない（V-2d: ±10%）
 *      → 大物覚醒（§6.3）が単調上昇ラチェットとして押し上げる。平衡時のずれ ∝ 押し上げ量 / 回帰率
 *        （実測: BIG_ATAVISM_RATE=0 にすると距離のずれは -1.7%/-3.0% まで消える）
 *   2. 集団SDが創始水準を保つ（V-2e: 0.8〜1.4倍）
 *      → 平衡SD = sd / sqrt(2r - r²)。よって **sd = 創始アレルSD × sqrt(2r - r²)**
 * 値域比スケールだとこの関係を満たさないため、距離系だけ sd を絶対値で与える。
 *
 * 実測（800頭・300ゲーム内年・4シードの**最悪値**。REPORT_P0FIX2 §3-1）:
 *   r=0.05 sd162/54  → center +14.3% / range +19.9%  FAIL
 *   r=0.10 sd226/75  → center  +8.6% / range +12.8%  FAIL
 *   r=0.20 sd312/104 → center  +4.5% / range  +6.7%  PASS（採用）
 *
 * ⚠️ P0-fix では「回帰0.20 では距離SDが 0.4倍に収縮する」と報告したが、
 *    あれは sd を値域比（=小さすぎる値）のままにしていたためで、回帰率0.20 自体は問題ない。
 *    sd を上式で追随させれば 0.20 でも分散は保たれる（実測 0.92倍）。
 *
 * ⚠️ 同じ問題は距離系以外でも起きていた（D-012・レビュー側監査）。値域比スケールのままだと
 *    芝/ダート適性は平衡SDが創始の 0.71倍に**収縮**（馬場適性の個性が消える）、
 *    丈夫さは 1.41倍に**拡大**（故障率のばらつきが広がる）していた。
 *    平均は ±10% 内に収まったままだったため V-2d では捕まらず、V-2e は距離しか見ていなかった。
 *    → 非能力形質はすべて同じ導出に従わせ、V-2e も全非能力形質へ一般化した。
 */
export function buildTraitMutation(
  f: FoundersConfig,
  regressionRate: number = BALANCE.REGRESSION_RATE,
  clampRatio: number = BALANCE.MUTATION_CLAMP_RATIO,
): Readonly<Record<NumericTraitKey, TraitMutationSpec>> {
  const abilityCenter = { center: f.ABILITY_MEAN };

  /**
   * 非能力形質の変異幅を創始アレルSDから導出する（正典 §6.4・D-012）。
   *   平衡SD = sd / √(2r − r²)  →  sd = 創始アレルSD × √(2r − r²)
   * 定数を別々に持つと片方だけ変えたときに平衡が壊れるので、必ずここで一緒に導出する。
   */
  const derive = (founderAlleleSd: number): { sd: number; clamp: number } => {
    const sd = Math.round(
      founderAlleleSd * Math.sqrt(2 * regressionRate - regressionRate * regressionRate),
    );
    return { sd, clamp: Math.round(sd * clampRatio) };
  };

  return {
    // 能力5種だけは例外。sd は V-1（同一配合のばらつき12〜18%）から較正する
    sp: abilityCenter,
    st: abilityCenter,
    pw: abilityCenter,
    gt: abilityCenter,
    iq: abilityCenter,
    durability: { ...derive(f.DURABILITY_SD), center: f.DURABILITY_MEAN },
    temper: { ...derive(f.TEMPER_SD), center: f.TEMPER_MEAN },
    'surface.turf': { ...derive(uniformSd(f.SURFACE_RANGE)), center: uniformMean(f.SURFACE_RANGE) },
    'surface.dirt': { ...derive(uniformSd(f.SURFACE_RANGE)), center: uniformMean(f.SURFACE_RANGE) },
    distance_center: {
      ...derive(uniformSd(f.DISTANCE_CENTER_RANGE)),
      center: uniformMean(f.DISTANCE_CENTER_RANGE),
    },
    distance_range: {
      ...derive(uniformSd(f.DISTANCE_RANGE_RANGE)),
      center: uniformMean(f.DISTANCE_RANGE_RANGE),
    },
  };
}

export const TRAIT_MUTATION = buildTraitMutation(FOUNDERS);

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

  // 平均回帰（正典 §6.4・D-008 で採択）
  REGRESSION_RATE: BALANCE.REGRESSION_RATE,
  REGRESSION_CENTER_RATIO: BALANCE.REGRESSION_CENTER_RATIO,
  traitMutation: TRAIT_MUTATION,
  // 大物覚醒は能力5種のみ（正典 §6.3・D-011）
  BIG_ATAVISM_TRAITS: ABILITY_KEYS,

  DOMINANT_WEIGHT: BALANCE.DOMINANT_WEIGHT,

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
