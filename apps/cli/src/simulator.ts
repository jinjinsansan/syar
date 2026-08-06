/**
 * 100世代シミュレータ本体 — 指示書 §3.4
 *
 * 遺伝エンジン（@star/sim-engine）だけを使って世代を回し、V-1 / V-2 / V-3 を測る。
 * 乱数はすべてマスターシードからの導出（deriveSeed）で、実行のたびに完全一致する。
 */

import {
  ABILITY_KEYS,
  NUMERIC_TRAITS,
  applyMatingCounters,
  breed,
  canMate,
  createFounder,
  deriveRng,
  deriveSeed,
  expressNumeric,
  generateNicksTable,
  getAllelePair,
  makeLineIds,
  type AbilityKey,
  type BalanceConfig,
  type FoundersConfig,
  type HorseId,
  type HorseRecord,
  type NicksGenConfig,
  type NicksTable,
  type NumericTraitKey,
} from '@star/sim-engine';
import {
  runSeason,
  selectionScore,
  type CareerRecord,
} from './racing-season.js';
import { correlation, linearSlope, max, mean, min, quantileSorted, round, sd } from './stats.js';

// --- 正典 §13.2 の合格基準（D-008 で再定義） ---
/** V-2a: 傾きを見る世代数 */
const V2A_WINDOW = 20;
/** V-2a: 許容する傾き（%/世代） */
const V2A_TARGET_ABS_MAX = 0.5;
/** V-2b: 集団平均能力 ÷ アレル上限 の上限 */
const V2B_TARGET_MAX = 0.8;
/** V-1: 能力別CVの平均の許容範囲 */
const V1_TARGET: readonly [number, number] = [0.12, 0.18];
/** V-2d: 全形質の集団平均が創始水準から許容される乖離 */
const V2D_TARGET_ABS_MAX = 0.1;
/** V-2e: distance_center の集団SDの許容倍率（創始比） */
const V2E_TARGET: readonly [number, number] = [0.8, 1.4];

/**
 * V-2d の監視対象 = 能力5種を**除く**全数値形質。
 *
 * 能力5種は方向性選抜がかかって水準が上がるのが正常な挙動であり（V-2a/V-2b が担当）、
 * ±10% ゲートに掛けると V-2a/V-2b と矛盾する。V-2d が守るのは
 * 「選抜圧がかからないのに水準がずれる」形質（丈夫さ・気性・適性・距離）。
 * NUMERIC_TRAITS からの差分で定義しているので、**新しい形質を追加すれば自動で監視対象に入る**。
 */
const NON_ABILITY_TRAITS: readonly NumericTraitKey[] = NUMERIC_TRAITS.filter(
  (key): key is NumericTraitKey => !(ABILITY_KEYS as readonly string[]).includes(key),
);

/**
 * ★D-019 による分割（P-3）。
 *
 * - **V-2d（水準維持 ±10%）**: 選抜圧が**かからない**形質。§8.3 の乗算補正に現れず、
 *   故障率にのみ効く「丈夫さ」だけ。
 * - **V-2f（平坦化 0.5%/世代未満）**: レース選抜が**かかる**形質。§8.3 の乗算補正が使うもの。
 *   走って強い形質を選べば集団で上がるのは**設計どおり**なので、上がること自体ではなく
 *   **上がり続けること**を禁じる（D-008 と同じ構図）。
 *
 * ★heavy_aptitude は実測で分類した（分類を先に決めない）。150世代・実レース選抜で
 *   proxy −0.22% → race +0.55% と**符号が反転**しており選抜圧がかかっている。
 *   振れ幅が他の適性の約1/10なのは発現機会が非良25%に限られるため。
 *   **TRACK_CONDITION_CDF / TRACK_COND_SEVERITY を変えたら再測定が要る。**
 */
const V2D_TRAITS: readonly NumericTraitKey[] = ['durability'];

const V2F_TRAITS: readonly NumericTraitKey[] = NON_ABILITY_TRAITS.filter(
  (key) => !V2D_TRAITS.includes(key),
);

/**
 * V-2d の乖離をどの物差しで測るか（J-2）。
 *
 * ★D-019 で V-2d の対象が丈夫さ1つに絞られた結果、**形質経由ではこの分岐を試せなくなった**
 *   （丈夫さは値域が0以上にクランプされるので創始平均を0にできない）。
 *   機構そのものを関数として切り出し、直接テストする。
 *   ——「対象が減ったせいで機構のテストが書けない」を、機構を隠したまま放置しない。
 */
export function deviationBasis(founderMean: number, founderSd: number): 'ratio' | 'sd' | 'none' {
  if (Math.abs(founderMean) > founderSd) return 'ratio';
  return founderSd > 1e-9 ? 'sd' : 'none';
}

// ---------------------------------------------------------------------------
// オプション
// ---------------------------------------------------------------------------

export interface SimulationOptions {
  /** 回す世代数（= 年数。1世代 = 1年 = 繁殖牝馬プール全頭が1産） */
  generations: number;
  seed: number;
  /** 繁殖牝馬プールの頭数 */
  population: number;
  /** 種牡馬プールの頭数 */
  stallionPool: number;
  /** 種付け候補にする上位割合（既定 0.2 = 能力合計上位20%） */
  stallionTopRatio: number;
  /** 繁殖入りできる年齢（正典 §7.1 の 260週=5歳末引退より6歳） */
  maturityYears: number;
  /** 種牡馬の供用年数 */
  stallionServiceYears: number;
  /** 繁殖牝馬の上限年齢 */
  mareMaxAgeYears: number;
  /** プール補充の選抜方針。random = 追加の選抜圧をかけない（既定） */
  recruit: 'random' | 'top';
  /**
   * 種牡馬選抜に使う「観測能力」の遺伝率 h2（0〜1）。
   * P0 はレースエンジンが無いため、素直に実装すると真の potential で種牡馬を選ぶことになる。
   * これは現実にはあり得ない完全情報での選抜であり、選抜応答を最大化して V-2 を構造的に破綻させる。
   * 実際の競走能力の遺伝率は 0.3 前後で、選抜は観測成績越しにしか効かない:
   *   観測能力 = potential + 個体固有ノイズ * sqrt((1-h2)/h2) * σ(プール)
   * h2 = 1 を指定すると完全情報（= 指示書 §3.4 の文字通りの既定）に戻る。
   * P1 でレースエンジンが入ったら、この近似は実際のレース結果による選抜へ置き換える。
   */
  selectionH2: number;
  /** V-1 で試す配合の組数 */
  v1Pairs: number;
  /** V-1 の反復回数（指示書: 同一配合100回） */
  v1Repeats: number;
  /** 到達不能になった祖先レコードを破棄してメモリを抑える */
  prune: boolean;
  /**
   * V-2c（長期健全性）を測るために、本編とは別に回す長期シミュレーションの年数。
   * 0 なら実行しない（判定は「別実行で確認」となる）。正典 §13.2 の既定は 300ゲーム内年。
   */
  longHorizonGenerations: number;
  /**
   * 最終年の産駒を結果に残す（K-5 のレース母集団・V-12 用）。
   * ★既定 false。true にしない限り戻り値も JSON 出力も P0 と完全に同一のままになる
   *   （追加が既存の検証結果に影響していないことを、既定値の側で担保する）。
   */
  retainFinalPopulation: boolean;

  /**
   * 種牡馬選抜の方式（K-4）。
   *
   * - `'proxy'`: P0 の近似。真の potential に観測ノイズを載せた「観測能力」で選ぶ（`selectionH2`）。
   *   **レース非搭載時のフォールバックとして明示的に隔離している**（指示書 K-4）。
   * - `'race'`: 実際にレースを走らせ、その成績で選ぶ。P1 の本来の姿。
   *
   * ★既定は `'proxy'`。P0 の受け入れ結果（`npm run verify`）を P0-fix5 と**同一の数値**に
   *   保つため。`--selection race` で切り替え、P0 ゲートが実レース選抜下でも成立するかを
   *   別途測る（指示書 §4「P0 ゲートの維持」）。既定を変えると「K-4 の影響」と
   *   「それ以外の変更の影響」が混ざって切り分けられなくなる。
   */
  selection: 'proxy' | 'race';
  /** 1年あたり各馬が走るレース数（`selection: 'race'` のとき） */
  racesPerYear: number;
  /**
   * 選抜指標（`selection: 'race'` のとき）。K-4 で開発側が選ぶ。
   * - `'prize'`: 累計獲得賞金
   * - `'winRate'`: 勝率
   * - `'composite'`: 賞金と複勝率の複合
   */
  selectionMetric: 'prize' | 'prizePerStart' | 'winRate' | 'composite';
}

export const DEFAULT_OPTIONS: SimulationOptions = {
  generations: 100,
  seed: 42,
  population: 200,
  stallionPool: 60,
  stallionTopRatio: 0.2,
  maturityYears: 6,
  stallionServiceYears: 8,
  mareMaxAgeYears: 14,
  recruit: 'random',
  // 0.30 = 競走能力の実測遺伝率。1.0 にすると完全情報選抜（指示書の文字通りの既定）
  selectionH2: 0.3,
  v1Pairs: 5,
  v1Repeats: 100,
  prune: true,
  longHorizonGenerations: 0,
  retainFinalPopulation: false,
  selection: 'proxy',
  racesPerYear: 4,
  // ★O-5 で再選定: prize（累計）は在籍年数と r=0.365 で相関し「長く走ったこと」を測っていた。
  //   prizePerStart は在籍年数と無相関(r=-0.007)で、能力との相関も最も高い(0.639)
  selectionMetric: 'prizePerStart',
};

// ---------------------------------------------------------------------------
// 出力構造
// ---------------------------------------------------------------------------

export interface AlleleDistribution {
  mean: number;
  sd: number;
  p05: number;
  p50: number;
  p95: number;
  max: number;
}

export interface RateStat {
  hits: number;
  rolls: number;
  rate: number;
}

export interface CohortStat {
  /** 世代番号（= 年）。創始世代は 0 */
  generation: number;
  foals: number;
  /** 血統上の世代深度の平均（1 + max(両親の深度)）。年数と遺伝的世代交代の差を可視化する */
  meanGenerationDepth: number;
  marePool: number;
  stallionPool: number;
  sireCandidates: number;
  unbredMares: number;
  meanAbility: Record<AbilityKey, number>;
  meanAbilityTotal: number;
  maxAbilityTotal: number;
  minAbilityTotal: number;
  allele: AlleleDistribution;
  meanF: number;
  maxF: number;
  atavism: RateStat;
  bigAtavism: RateStat;
  bigMutation: RateStat;
  frailCount: number;
  nicksHits: number;
  /**
   * 距離適性の分布（正典 §5.2・P0-fix F-3）。
   * 集団SDが創始水準から広がると「マイラー／ステイヤーの分化」が消え、
   * 逆に縮むと全馬が同じ距離型になる。どちらも §5.2 の意図に反する。
   */
  distanceCenter: { mean: number; sd: number };
  distanceRange: { mean: number; sd: number };
  /**
   * 全数値形質の集団平均（genotype の発現値ベース）。V-2d の測定源。
   * NUMERIC_TRAITS を機械的に走査しているので、形質を追加すれば自動で監視対象に入る。
   */
  traitMeans: Record<NumericTraitKey, number>;
  /**
   * 全数値形質の集団SD（genotype の発現値ベース）。V-2e の測定源。
   * 平均（traitMeans）が創始水準に収まっていても、分散だけが静かに壊れることがある
   * （実測: 芝適性は平均±10%内のまま SD が 0.71倍へ収縮していた）。
   */
  traitSds: Record<NumericTraitKey, number>;
  /**
   * 非能力6形質の**表現型**平均（I-2c）。
   *
   * V-2d/V-2e の判定は genotype 発現値で行うが、§7.5 の故障率の分母は表現型
   * （インブリードの減点を含む `horse.durability`）である。P0 では平均F が小さく
   * 両者の差は無視できるが、P1 で近交が進むと genotype 側だけ見ていては乖離を検出できない。
   * 判定には使わず、監視のために併記する。
   */
  phenotypeMeans: {
    durability: number;
    temper: number;
    'surface.turf': number;
    'surface.dirt': number;
    heavy_aptitude: number;
    distance_center: number;
    distance_range: number;
  };
  /**
   * 中間親（父母の能力合計の平均）と産駒の能力合計のピアソン相関。
   * 「血のつながりの強さ」の実測値。正典 §1.1「血をつなぐことが唯一の進行軸」／
   * §1.4-3「蓄積感」が成立しているかの健全性指標であり、
   * 血統インフレ抑制のために遺伝をノイズで薄めすぎていないかの歯止めになる。
   */
  parentOffspringCorrelation: number;
}

export interface V1PairSample {
  sireId: HorseId;
  damId: HorseId;
  inbreedCoeff: number;
  meanPotentialTotal: number;
  /** 能力ごとの変動係数（SD / 平均） */
  cvByAbility: Record<AbilityKey, number>;
  /** 5能力の変動係数の平均 = この配合の代表値 */
  meanCv: number;
  /** 5能力合計の変動係数（参考。独立成分の合成なので必ず小さく出る） */
  totalCv: number;
}

export interface V1Checkpoint {
  generation: number;
  repeats: number;
  pairs: V1PairSample[];
  meanCv: number;
}

export interface Verification {
  v1: {
    checkpoints: V1Checkpoint[];
    /** 判定に使う値 = 最終世代のチェックポイント */
    primaryGeneration: number;
    primaryMeanCv: number;
    target: readonly [number, number];
    pass: boolean;
  };
  /**
   * V-2 系（血統インフレ）— 正典 §13.2・D-008 で3基準に再定義。
   * 旧「100世代後 +50% 以内」は廃止。守るべきは「平均が上がらないこと」ではなく
   * 「上がり続けて天井に張り付き、個体差が消えないこと」（正典 §13.3）。
   */
  v2a: {
    /** 最終20世代の平均能力の傾き（%/世代） */
    slopePctPerGeneration: number;
    windowGenerations: number;
    targetAbsMax: number;
    pass: boolean;
  };
  v2b: {
    /** 集団平均能力（能力1種あたり）÷ アレル上限 */
    ceilingRatio: number;
    meanAbilityPerKey: number;
    alleleMax: number;
    targetMax: number;
    pass: boolean;
  };
  v2c: {
    /** 長期シミュレーションを実行したか。false なら別実行での確認が必要 */
    evaluated: boolean;
    generations: number;
    v1MeanCv: number;
    target: readonly [number, number];
    pass: boolean;
    note: string;
  };
  /**
   * V-2d 全形質の水準維持（正典 §13.2・D-009）。
   *
   * V-1/V-2a〜c/V-3 はいずれも能力5種しか見ていないため、丈夫さ 650→450 のような
   * 非能力形質の恒久的な水準ずれを検出できなかった。全形質を機械的に測って塞ぐ。
   */
  v2d: {
    traits: {
      key: NumericTraitKey;
      founderMean: number;
      finalMean: number;
      /**
       * basis=ratio なら finalMean/founderMean−1、basis=sd なら (finalMean−founderMean)/創始SD。
       * basis=none（判定不能）のときは **null**（M-5: 型 `number` に NaN を入れていた不一致を是正）。
       */
      deviation: number | null;
      /**
       * 判定の物差し（I-2b）。
       * ratio = 創始平均比（|平均| > 創始SD のとき。既定の6形質はすべてこちら）
       * sd    = 創始SDを単位とした差（平均が散らばりに対して小さく、比率が不安定なとき）
       * none  = 創始平均もSDも0で判定不能 → **PASS させない**（静かに素通りさせない）
       */
      basis: 'ratio' | 'sd' | 'none';
      pass: boolean;
    }[];
    /** 参考: 能力5種（方向性選抜で上がるのが正常なので判定対象外） */
    abilityReference: {
      key: NumericTraitKey;
      founderMean: number;
      finalMean: number;
      deviation: number;
    }[];
    worstKey: NumericTraitKey | null;
    /** 判定可能な形質の中での最大乖離。1件も判定できなければ null（JSON の型と実値を一致させる） */
    worstDeviation: number | null;
    /** 判定不能（basis='none'）だった形質。worst からは除外するが隠さない */
    undecidableKeys: NumericTraitKey[];
    targetAbsMax: number;
    pass: boolean;
  };
  /**
   * V-2e 非能力形質の分化（正典 §13.2・D-012 で距離のみから全非能力形質へ一般化）。
   *
   * 分化は「拡散」でも「収縮」でも失われる。**平均（V-2d）だけ見ても捕まらない** —
   * 実測で芝適性は平均が ±10% 内に収まったまま SD が 0.71倍へ収縮していた。
   */
  /** V-2f 平坦化（D-019）: レース選抜がかかる形質の傾き（%/世代） */
  v2f: {
    traits: { key: NumericTraitKey; slopePctPerGen: number; pass: boolean }[];
    worstKey: NumericTraitKey | null;
    worstSlopePctPerGen: number;
    target: number;
    pass: boolean;
  };
  v2e: {
    traits: {
      key: NumericTraitKey;
      founderSd: number;
      finalSd: number;
      ratio: number;
      pass: boolean;
    }[];
    worstKey: NumericTraitKey | null;
    worstRatio: number;
    target: readonly [number, number];
    pass: boolean;
  };
  /** 旧基準の実測値。比較の連続性のために残すが**合否判定には使わない**（正典 §13.2） */
  legacyRatio: {
    initialMeanAbilityTotal: number;
    finalMeanAbilityTotal: number;
    finalMeanAbilityTotalSmoothed: number;
    ratio: number;
    ratioSmoothed: number;
    note: string;
  };
  v3: {
    atavism: RateStat & { target: number; deviationPt: number; pass: boolean };
    bigAtavism: RateStat & { target: number; deviationPt: number; pass: boolean };
    bigMutation: RateStat & { target: number; deviationPt: number; pass: boolean };
    tolerancePt: number;
    pass: boolean;
  };
  pass: boolean;
}

export interface SimulationResult {
  options: SimulationOptions;
  balanceDigest: {
    genetics: BalanceConfig['genetics'];
    founders: FoundersConfig;
    dominantWeight: number;
    /** 正典外の提案機構（既定 0 = 無効。QUESTIONS_P0 Q1） */
    regressionRate: number;
    /** 形質別の変異・回帰パラメータ（正典 §6.4 の表・D-009）。どの定数で出た数字かを JSON に残す */
    traitMutation: BalanceConfig["traitMutation"];
    pedigreeDepth: number;
    mareLifetimeFoals: number;
    stallionBaseCoverings: number;
    minBreedingAgeYears: number;
  };
  founderCohort: CohortStat;
  cohorts: CohortStat[];
  verification: Verification;
  /** V-2c 用の長期シミュレーション結果（--long-horizon 指定時のみ） */
  longHorizon: SimulationResult | null;
  /**
   * 最終年の産駒（`retainFinalPopulation` 指定時のみ。既定は null）。
   * K-5 のレース母集団と V-12（平均F・表現型乖離）の実測に使う。
   */
  finalPopulation: readonly HorseRecord[] | null;
  totals: {
    matings: number;
    foals: number;
    unbredMares: number;
    horsesCreated: number;
  };
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

const RNG_DOMAIN = {
  NICKS: 1,
  FOUNDER: 2,
  RECRUIT: 3,
  MATING: 4,
  V1: 5,
  PERF: 6,
  /** K-4: 実レース選抜のシーズン（他の用途と系列を混ぜない） */
  RACE: 7,
} as const;

function abilityTotal(horse: HorseRecord): number {
  let total = 0;
  for (const key of ABILITY_KEYS) total += horse.potential[key];
  return total;
}

function abilityAlleles(horse: HorseRecord): number[] {
  const out: number[] = [];
  for (const key of ABILITY_KEYS) {
    out.push(horse.genotype[key].a1, horse.genotype[key].a2);
  }
  return out;
}

/** 全数値形質の集団平均とSDを機械的に取る（V-2d / V-2e の測定源） */
function traitStatsOf(
  horses: readonly HorseRecord[],
  dominantWeight: number,
): { means: Record<NumericTraitKey, number>; sds: Record<NumericTraitKey, number> } {
  const means = {} as Record<NumericTraitKey, number>;
  const sds = {} as Record<NumericTraitKey, number>;
  for (const key of NUMERIC_TRAITS) {
    const values = horses.map((h) =>
      expressNumeric(getAllelePair(h.genotype, key), dominantWeight),
    );
    means[key] = round(mean(values), 2);
    sds[key] = round(sd(values), 3);
  }
  return { means, sds };
}

function summarizeCohort(
  generation: number,
  horses: readonly HorseRecord[],
  dominantWeight: number,
  extra: {
    marePool: number;
    stallionPool: number;
    sireCandidates: number;
    unbredMares: number;
    atavism: RateStat;
    bigAtavism: RateStat;
    bigMutation: RateStat;
    midParent?: readonly number[];
  },
): CohortStat {
  const traitStats = traitStatsOf(horses, dominantWeight);
  const totals = horses.map(abilityTotal);
  const alleles: number[] = [];
  for (const h of horses) alleles.push(...abilityAlleles(h));
  alleles.sort((a, b) => a - b);

  const meanAbility: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  for (const key of ABILITY_KEYS) {
    meanAbility[key] = round(mean(horses.map((h) => h.potential[key])), 2);
  }

  const fValues = horses.map((h) => h.inbreedCoeff);
  const depths = horses.map((h) => h.generation);

  return {
    generation,
    foals: horses.length,
    meanGenerationDepth: round(mean(depths), 3),
    marePool: extra.marePool,
    stallionPool: extra.stallionPool,
    sireCandidates: extra.sireCandidates,
    unbredMares: extra.unbredMares,
    meanAbility,
    meanAbilityTotal: round(mean(totals), 2),
    maxAbilityTotal: round(max(totals), 2),
    minAbilityTotal: round(min(totals), 2),
    allele: {
      mean: round(mean(alleles), 2),
      sd: round(sd(alleles), 2),
      p05: quantileSorted(alleles, 0.05),
      p50: quantileSorted(alleles, 0.5),
      p95: quantileSorted(alleles, 0.95),
      max: round(max(alleles), 2),
    },
    meanF: round(mean(fValues), 5),
    maxF: round(max(fValues), 5),
    atavism: extra.atavism,
    bigAtavism: extra.bigAtavism,
    bigMutation: extra.bigMutation,
    frailCount: horses.filter((h) => h.frail).length,
    nicksHits: horses.filter((h) => h.nicksMultiplier > 1).length,
    distanceCenter: {
      mean: round(mean(horses.map((h) => h.distanceCenter)), 1),
      sd: round(sd(horses.map((h) => h.distanceCenter)), 1),
    },
    distanceRange: {
      mean: round(mean(horses.map((h) => h.distanceRange)), 1),
      sd: round(sd(horses.map((h) => h.distanceRange)), 1),
    },
    traitMeans: traitStats.means,
    traitSds: traitStats.sds,
    phenotypeMeans: {
      durability: round(mean(horses.map((h) => h.durability)), 2),
      temper: round(mean(horses.map((h) => h.temper)), 2),
      'surface.turf': round(mean(horses.map((h) => h.surfaceAptitude.turf)), 2),
      'surface.dirt': round(mean(horses.map((h) => h.surfaceAptitude.dirt)), 2),
      heavy_aptitude: round(mean(horses.map((h) => h.heavyAptitude)), 2),
      distance_center: round(mean(horses.map((h) => h.distanceCenter)), 2),
      distance_range: round(mean(horses.map((h) => h.distanceRange)), 2),
    },
    parentOffspringCorrelation:
      extra.midParent === undefined ? 0 : round(correlation(extra.midParent, totals), 4),
  };
}

function emptyRate(): RateStat {
  return { hits: 0, rolls: 0, rate: 0 };
}

function addRate(target: RateStat, hits: number, rolls: number): void {
  target.hits += hits;
  target.rolls += rolls;
  target.rate = target.rolls === 0 ? 0 : target.hits / target.rolls;
}

/** V-1: 同一配合を repeats 回繰り返して potential のばらつきを測る */
function measureV1Pair(
  sire: HorseRecord,
  dam: HorseRecord,
  pairIndex: number,
  opts: SimulationOptions,
  balance: BalanceConfig,
  nicks: NicksTable,
  lookup: (id: HorseId) => HorseRecord | undefined,
  year: number,
): V1PairSample | null {
  // 繁殖カウンタだけを初期化した複製で試す（本体の状態は一切変えない）
  const sireClone: HorseRecord = { ...sire, coveringsThisYear: 0 };
  const damClone: HorseRecord = { ...dam, bredThisYear: false, foalCount: 0 };
  if (!canMate(sireClone, damClone, balance, year).ok) return null;

  const byAbility: Record<AbilityKey, number[]> = { sp: [], st: [], pw: [], gt: [], iq: [] };
  const totals: number[] = [];
  let inbreedCoeff = 0;

  for (let i = 0; i < opts.v1Repeats; i++) {
    const foal = breed({
      id: `V1_${year}_${pairIndex}_${i}`,
      sire: sireClone,
      dam: damClone,
      seed: deriveSeed(opts.seed, RNG_DOMAIN.V1, year, pairIndex, i),
      generation: 0,
      birthYear: year,
      lookup,
      balance,
      nicks,
    });
    for (const key of ABILITY_KEYS) byAbility[key].push(foal.potential[key]);
    totals.push(abilityTotal(foal));
    inbreedCoeff = foal.inbreedCoeff;
  }

  const cvByAbility: Record<AbilityKey, number> = { sp: 0, st: 0, pw: 0, gt: 0, iq: 0 };
  const cvs: number[] = [];
  for (const key of ABILITY_KEYS) {
    const m = mean(byAbility[key]);
    const cv = m === 0 ? 0 : sd(byAbility[key]) / m;
    cvByAbility[key] = round(cv, 5);
    cvs.push(cv);
  }
  const totalMean = mean(totals);

  return {
    sireId: sire.id,
    damId: dam.id,
    inbreedCoeff: round(inbreedCoeff, 5),
    meanPotentialTotal: round(totalMean, 2),
    cvByAbility,
    meanCv: round(mean(cvs), 5),
    totalCv: round(totalMean === 0 ? 0 : sd(totals) / totalMean, 5),
  };
}

// ---------------------------------------------------------------------------
// シミュレーション本体
// ---------------------------------------------------------------------------

export function runSimulation(
  options: Partial<SimulationOptions>,
  balance: BalanceConfig,
  founders: FoundersConfig,
  nicksGen: NicksGenConfig,
): SimulationResult {
  const opts: SimulationOptions = { ...DEFAULT_OPTIONS, ...options };

  // 成熟年齢は交配可否チェックと同じ値を使う（食い違うと矛盾するため上書き）
  const effectiveBalance: BalanceConfig = {
    ...balance,
    MIN_BREEDING_AGE_YEARS: opts.maturityYears,
  };

  const lines = makeLineIds(founders.LINE_COUNT);
  const nicks = generateNicksTable(
    lines,
    deriveRng(opts.seed, RNG_DOMAIN.NICKS),
    nicksGen.HIT_RATIO,
    nicksGen.MULT_MIN,
    nicksGen.MULT_MAX,
  );

  const all = new Map<HorseId, HorseRecord>();
  const lookup = (id: HorseId): HorseRecord | undefined => all.get(id);

  let horseCounter = 0;
  const nextId = (): HorseId => {
    horseCounter += 1;
    return `HORSE_${String(horseCounter).padStart(6, '0')}`;
  };

  /**
   * 個体固有の「観測ノイズ」（= その馬の競走成績の運）。
   * 生涯を通じて固定する（引退時の成績で種牡馬入りが決まるのと同じ構造）。
   */
  const perfNoise = new Map<HorseId, number>();
  /** K-4: 実レース選抜の通算成績（`selection: 'race'` のときだけ使う） */
  const careers = new Map<HorseId, CareerRecord>();

  const register = (horse: HorseRecord): HorseRecord => {
    all.set(horse.id, horse);
    perfNoise.set(horse.id, deriveRng(opts.seed, RNG_DOMAIN.PERF, horseCounter).gaussian(0, 1));
    return horse;
  };

  // 観測能力 = 真の能力合計 + ノイズ × sqrt((1-h2)/h2) × σ(プール)
  const noiseK = Math.sqrt((1 - Math.min(1, Math.max(1e-6, opts.selectionH2))) / Math.min(1, Math.max(1e-6, opts.selectionH2)));

  // --- 創始世代 -------------------------------------------------------------
  const founderHorses: HorseRecord[] = [];
  const makeFounder = (sex: 'male' | 'female', birthYear: number, index: number): HorseRecord => {
    const rng = deriveRng(opts.seed, RNG_DOMAIN.FOUNDER, index);
    const horse = createFounder({
      id: nextId(),
      sex,
      // 創始馬にはラインをランダム割当（指示書 §3.3）
      sireLine: rng.pick(lines),
      birthYear,
      rng,
      balance: effectiveBalance,
      founders,
    });
    founderHorses.push(horse);
    return register(horse);
  };

  let founderIndex = 0;
  const mares: HorseRecord[] = [];
  const stallions: HorseRecord[] = [];
  /** 最終年の産駒（`retainFinalPopulation` 時のみ蓄える） */
  let finalFoals: HorseRecord[] = [];

  // 年0 から供用可能な現役繁殖世代。年齢を散らして退厩が一度に来ないようにする
  for (let i = 0; i < opts.population; i++) {
    const birthYear = -(opts.maturityYears + (i % 8));
    mares.push(makeFounder('female', birthYear, founderIndex++));
  }
  for (let i = 0; i < opts.stallionPool; i++) {
    const birthYear = -(opts.maturityYears + (i % opts.stallionServiceYears));
    stallions.push(makeFounder('male', birthYear, founderIndex++));
  }

  // 若駒の在庫（年1〜maturity に成熟する創始馬）。これが無いと序盤にプールが枯れる
  const pending = new Map<number, HorseRecord[]>();
  const pushPending = (year: number, horse: HorseRecord): void => {
    const list = pending.get(year);
    if (list === undefined) pending.set(year, [horse]);
    else list.push(horse);
  };
  const filliesPerYear = Math.ceil(opts.population / 8);
  const coltsPerYear = Math.ceil(opts.stallionPool / opts.stallionServiceYears);
  for (let y = 1; y <= opts.maturityYears; y++) {
    for (let i = 0; i < filliesPerYear; i++) {
      pushPending(y, makeFounder('female', y - opts.maturityYears, founderIndex++));
    }
    for (let i = 0; i < coltsPerYear; i++) {
      pushPending(y, makeFounder('male', y - opts.maturityYears, founderIndex++));
    }
  }

  const founderCohort = summarizeCohort(0, founderHorses, effectiveBalance.DOMINANT_WEIGHT, {
    marePool: mares.length,
    stallionPool: stallions.length,
    sireCandidates: 0,
    unbredMares: 0,
    atavism: emptyRate(),
    bigAtavism: emptyRate(),
    bigMutation: emptyRate(),
  });

  // --- 年ループ -------------------------------------------------------------
  const cohorts: CohortStat[] = [];
  const v1Checkpoints: V1Checkpoint[] = [];
  let longHorizon: SimulationResult | null = null;
  const totalAtavism = emptyRate();
  const totalBigAtavism = emptyRate();
  const totalBigMutation = emptyRate();
  let totalMatings = 0;
  let totalUnbred = 0;

  const v1Years = new Set<number>(
    [1, 10, 50, opts.generations].filter((y) => y >= 1 && y <= opts.generations),
  );

  for (let year = 1; year <= opts.generations; year++) {
    // 1. 退厩（生涯8産 / 上限年齢 / 供用年数）
    for (let i = mares.length - 1; i >= 0; i--) {
      const m = mares[i];
      if (m === undefined) continue;
      if (
        m.foalCount >= effectiveBalance.MARE_LIFETIME_FOALS ||
        year - m.birthYear > opts.mareMaxAgeYears
      ) {
        mares.splice(i, 1);
      }
    }
    for (let i = stallions.length - 1; i >= 0; i--) {
      const s = stallions[i];
      if (s === undefined) continue;
      if (year - s.birthYear >= opts.maturityYears + opts.stallionServiceYears) {
        stallions.splice(i, 1);
      }
    }

    // 2. 補充（当年に成熟した馬から）
    const recruits = pending.get(year) ?? [];
    pending.delete(year);
    const recruitRng = deriveRng(opts.seed, RNG_DOMAIN.RECRUIT, year);
    const orderRecruits = (list: HorseRecord[]): HorseRecord[] =>
      opts.recruit === 'top'
        ? list.slice().sort((a, b) => abilityTotal(b) - abilityTotal(a))
        : recruitRng.shuffled(list);

    const newMares = orderRecruits(recruits.filter((h) => h.sex === 'female'));
    const newStallions = orderRecruits(recruits.filter((h) => h.sex === 'male'));
    for (const h of newMares) {
      if (mares.length >= opts.population) break;
      mares.push(h);
    }
    for (const h of newStallions) {
      if (stallions.length >= opts.stallionPool) break;
      stallions.push(h);
    }

    // 3. 年次カウンタのリセット
    for (const m of mares) m.bredThisYear = false;
    for (const s of stallions) s.coveringsThisYear = 0;

    // 4. 種付け候補 = 上位 stallionTopRatio
    //    'proxy': 観測能力（真の能力＋個体固有ノイズ・selectionH2 参照。P0 の近似）
    //    'race' : 実際に走らせた成績（K-4。P1 の本来の姿）
    let rankKey: (h: HorseRecord) => number;
    if (opts.selection === 'race') {
      // ★このシーズンのレースを走らせてから選ぶ。走っていない馬はスコア0で自動的に落ちる
      runSeason(stallions, careers, deriveRng(opts.seed, RNG_DOMAIN.RACE, year), opts.racesPerYear);
      rankKey = (h) => selectionScore(careers.get(h.id), opts.selectionMetric);
    } else {
      const poolSd = sd(stallions.map(abilityTotal));
      rankKey = (h) => abilityTotal(h) + (perfNoise.get(h.id) ?? 0) * noiseK * poolSd;
    }
    const ranked = stallions
      .slice()
      .sort((a, b) => (rankKey(b) !== rankKey(a) ? rankKey(b) - rankKey(a) : a.id.localeCompare(b.id)));
    const candidateCount = Math.max(1, Math.ceil(ranked.length * opts.stallionTopRatio));
    const candidates = ranked.slice(0, candidateCount);

    // 5. 配合
    const matingRng = deriveRng(opts.seed, RNG_DOMAIN.MATING, year);
    const foals: HorseRecord[] = [];
    const midParent: number[] = [];
    const yearAtavism = emptyRate();
    const yearBigAtavism = emptyRate();
    const yearBigMutation = emptyRate();
    let unbred = 0;
    let available = candidates.slice();

    for (let mareIndex = 0; mareIndex < mares.length; mareIndex++) {
      const dam = mares[mareIndex];
      if (dam === undefined) continue;

      // 上位候補からランダムに1頭。種付上限に達した馬は候補から外す
      let sire: HorseRecord | null = null;
      while (available.length > 0) {
        const pick = matingRng.int(0, available.length - 1);
        const cand = available[pick];
        if (cand === undefined) break;
        const check = canMate(cand, dam, effectiveBalance, year);
        if (check.ok) {
          sire = cand;
          break;
        }
        if (check.reason === 'sire_coverings_exceeded') {
          available = available.filter((c) => c.id !== cand.id);
          continue;
        }
        // 種牡馬側ではなく牝馬側の理由（高齢・8産済み等）なら、この牝馬は諦める
        break;
      }

      if (sire === null) {
        unbred++;
        continue;
      }

      const foal = breed({
        id: nextId(),
        sire,
        dam,
        seed: deriveSeed(opts.seed, RNG_DOMAIN.MATING, year, mareIndex),
        generation: 1 + Math.max(sire.generation, dam.generation),
        birthYear: year,
        lookup,
        balance: effectiveBalance,
        nicks,
      });
      midParent.push((abilityTotal(sire) + abilityTotal(dam)) / 2);
      applyMatingCounters(sire, dam);
      register(foal);
      foals.push(foal);
      totalMatings++;

      const rec = foal.breedingRecord;
      if (rec !== null) {
        addRate(yearAtavism, rec.atavismTraits.length, rec.atavismEligibleRolls);
        addRate(yearBigAtavism, rec.bigAtavismTraits.length, rec.bigAtavismEligibleRolls);
        // 大突然変異は形質単位のロール（アレル単位ではない）
        addRate(yearBigMutation, rec.bigMutationTraits.length, rec.mutationRolls / 2);
      }
    }

    addRate(totalAtavism, yearAtavism.hits, yearAtavism.rolls);
    addRate(totalBigAtavism, yearBigAtavism.hits, yearBigAtavism.rolls);
    addRate(totalBigMutation, yearBigMutation.hits, yearBigMutation.rolls);
    totalUnbred += unbred;

    // 6. 当年産駒を成熟年に予約
    for (const foal of foals) {
      pushPending(year + opts.maturityYears, foal);
    }

    cohorts.push(
      summarizeCohort(year, foals, effectiveBalance.DOMINANT_WEIGHT, {
        marePool: mares.length,
        stallionPool: stallions.length,
        sireCandidates: candidates.length,
        unbredMares: unbred,
        atavism: yearAtavism,
        bigAtavism: yearBigAtavism,
        bigMutation: yearBigMutation,
        midParent,
      }),
    );

    // 6b. 最終年の産駒を残す（K-5 のレース母集団・V-12 用。既定 false なので通常は無効）
    if (opts.retainFinalPopulation && year === opts.generations) {
      finalFoals = foals.slice();
    }

    // 7. V-1 チェックポイント
    if (v1Years.has(year)) {
      const samples: V1PairSample[] = [];
      for (let p = 0; p < opts.v1Pairs; p++) {
        const dam = mares[p % Math.max(1, mares.length)];
        const sire = candidates[p % Math.max(1, candidates.length)];
        if (dam === undefined || sire === undefined) continue;
        const sample = measureV1Pair(
          sire,
          dam,
          p,
          opts,
          effectiveBalance,
          nicks,
          lookup,
          year,
        );
        if (sample !== null) samples.push(sample);
      }
      v1Checkpoints.push({
        generation: year,
        repeats: opts.v1Repeats,
        pairs: samples,
        meanCv: round(mean(samples.map((s) => s.meanCv)), 5),
      });
    }

    // 8. 到達不能な祖先を破棄（結果には影響しない。テストで同値性を検証）
    if (opts.prune) {
      const keep = new Set<HorseId>();
      const live: HorseRecord[] = [...mares, ...stallions];
      for (const list of pending.values()) live.push(...list);
      for (const h of live) {
        keep.add(h.id);
        for (const ancestorId of h.pedigreeCache.keys()) keep.add(ancestorId);
      }
      for (const id of all.keys()) {
        if (!keep.has(id)) {
          all.delete(id);
          perfNoise.delete(id);
        }
      }
    }
  }

  // --- 検証まとめ -----------------------------------------------------------
  const finalCohort = cohorts[cohorts.length - 1];
  const finalMean = finalCohort?.meanAbilityTotal ?? 0;
  const tail = cohorts.slice(-5).map((c) => c.meanAbilityTotal);
  const finalMeanSmoothed = mean(tail);
  const initialMean = founderCohort.meanAbilityTotal;

  const primaryV1 = v1Checkpoints[v1Checkpoints.length - 1];
  const primaryMeanCv = primaryV1?.meanCv ?? 0;

  const tolerancePt = 0.005;
  const v3Atavism = {
    ...totalAtavism,
    rate: round(totalAtavism.rate, 5),
    target: balance.genetics.ATAVISM_RATE,
    deviationPt: round(Math.abs(totalAtavism.rate - balance.genetics.ATAVISM_RATE), 5),
    pass: Math.abs(totalAtavism.rate - balance.genetics.ATAVISM_RATE) <= tolerancePt,
  };
  const v3BigAtavism = {
    ...totalBigAtavism,
    rate: round(totalBigAtavism.rate, 5),
    target: balance.genetics.BIG_ATAVISM_RATE,
    deviationPt: round(Math.abs(totalBigAtavism.rate - balance.genetics.BIG_ATAVISM_RATE), 5),
    pass: Math.abs(totalBigAtavism.rate - balance.genetics.BIG_ATAVISM_RATE) <= tolerancePt,
  };
  const v3BigMutation = {
    ...totalBigMutation,
    rate: round(totalBigMutation.rate, 5),
    target: balance.genetics.BIG_MUTATION_RATE,
    deviationPt: round(Math.abs(totalBigMutation.rate - balance.genetics.BIG_MUTATION_RATE), 5),
    pass: Math.abs(totalBigMutation.rate - balance.genetics.BIG_MUTATION_RATE) <= tolerancePt,
  };

  const ratio = initialMean === 0 ? 0 : finalMean / initialMean - 1;
  const ratioSmoothed = initialMean === 0 ? 0 : finalMeanSmoothed / initialMean - 1;

  const v1Pass = primaryMeanCv >= V1_TARGET[0] && primaryMeanCv <= V1_TARGET[1];
  const v3Pass = v3Atavism.pass && v3BigAtavism.pass && v3BigMutation.pass;

  // --- V-2a 平坦化: 最終20世代の平均能力の傾きが 0.5%/世代 未満 ---
  const slopeWindow = cohorts.slice(-V2A_WINDOW);
  const windowLevel = mean(slopeWindow.map((c) => c.meanAbilityTotal));
  const slopePerGeneration = linearSlope(
    slopeWindow.map((c) => c.generation),
    slopeWindow.map((c) => c.meanAbilityTotal),
  );
  const slopePct = windowLevel === 0 ? 0 : (slopePerGeneration / windowLevel) * 100;
  // 「平坦化」の判定なので絶対値で見る（急落も平坦ではないため。REPORT に解釈として明記）
  const v2aPass = slopeWindow.length >= 2 && Math.abs(slopePct) < V2A_TARGET_ABS_MAX;

  // --- V-2f 平坦化（D-019・P-3）: レース選抜がかかる形質は「上がり続けない」ことを見る ---
  const v2fTraits = V2F_TRAITS.map((key) => {
    const level = mean(slopeWindow.map((c) => c.traitMeans[key]));
    const slope = linearSlope(
      slopeWindow.map((c) => c.generation),
      slopeWindow.map((c) => c.traitMeans[key]),
    );
    const slopePctPerGen = level === 0 ? 0 : (slope / level) * 100;
    return {
      key,
      slopePctPerGen: round(slopePctPerGen, 4),
      pass: slopeWindow.length >= 2 && Math.abs(slopePctPerGen) < V2A_TARGET_ABS_MAX,
    };
  });
  const worstSlope = v2fTraits.reduce<(typeof v2fTraits)[number] | null>(
    (acc, t) =>
      acc === null || Math.abs(t.slopePctPerGen) > Math.abs(acc.slopePctPerGen) ? t : acc,
    null,
  );
  const v2fPass = v2fTraits.every((t) => t.pass);

  // --- V-2b 天井余裕: 集団平均能力 ÷ アレル上限 が 80% 以下 ---
  const alleleMax = balance.traitBounds['sp'].max;
  const meanAbilityPerKey = finalMean / ABILITY_KEYS.length;
  const ceilingRatio = alleleMax === 0 ? 0 : meanAbilityPerKey / alleleMax;
  const v2bPass = ceilingRatio <= V2B_TARGET_MAX;

  // --- V-2d 全形質の水準維持: 集団平均が創始水準 ±10% 以内 ---
  const founderTraitMeans = founderCohort.traitMeans;
  const founderTraitSds = founderCohort.traitSds;
  const finalTraitMeans = finalCohort?.traitMeans;
  const v2dTraits = V2D_TRAITS.map((key) => {
    const founderMean = founderTraitMeans[key];
    const finalMean = finalTraitMeans?.[key] ?? 0;
    // ★創始平均が0（に近い）形質は比率で判定できない（I-2b）。
    //   ゼロ割を「乖離0 = 無条件 PASS」で握り潰すと、将来 0 中心の形質が入ったときに
    //   静かに素通りする。創始SDを物差しにした絶対差へ切り替え、basis で明示する。
    //
    //   切替の判定は「平均が0か」ではなく「**平均が散らばりに対して十分大きいか**」で行う。
    //   `!== 0` だけを見ると、平均1・SD19 のような分布でも比率判定になってしまい、
    //   ほぼ0の値で割った不安定な乖離が出る（J-2 のテストを書いていて判明）。
    const founderSd = founderTraitSds[key];
    const basis = deviationBasis(founderMean, founderSd);
    const usesRatio = basis === 'ratio';
    const deviation = usesRatio
      ? finalMean / founderMean - 1
      : founderSd > 1e-9
        ? (finalMean - founderMean) / founderSd
        : Number.NaN;
    return {
      key,
      founderMean,
      finalMean,
      // 判定不能は NaN ではなく null にする（JSON の型と実値を一致させる・M-5）
      deviation: Number.isFinite(deviation) ? round(deviation, 4) : null,
      /** ratio = 創始平均比 / sd = 創始SDを単位とした差 / undefined = 判定不能 */
      basis,
      // 判定不能（創始平均も創始SDも0）なら PASS させない
      pass: Number.isNaN(deviation) ? false : Math.abs(deviation) <= V2D_TARGET_ABS_MAX,
    };
  });
  const abilityReference = ABILITY_KEYS.map((key) => {
    const founderMean = founderTraitMeans[key];
    const finalMean = finalTraitMeans?.[key] ?? 0;
    return {
      key: key as NumericTraitKey,
      founderMean,
      finalMean,
      deviation: round(founderMean === 0 ? 0 : finalMean / founderMean - 1, 4),
    };
  });
  /**
   * 最大乖離の形質を選ぶ（L-3）。
   *
   * ⚠️ NaN（判定不能な形質）を含めて素朴に比較すると、`Math.abs(x) > NaN` が常に false に
   *    なるため **先頭の NaN が居座り、同時に存在する実数の乖離が隠れる**。
   *    合否は every() で別計算なのでゲート自体は正しいが、**最も診断が必要な場面で
   *    verify 表に NaN が出て真の最悪形質が見えなくなる**。NaN は候補から外す。
   */
  const decidable = v2dTraits.filter(
    (t): t is (typeof v2dTraits)[number] & { deviation: number } => t.deviation !== null,
  );
  const worst = decidable.reduce<(typeof decidable)[number] | null>(
    (acc, t) => (acc === null || Math.abs(t.deviation) > Math.abs(acc.deviation) ? t : acc),
    null,
  );
  /** 判定不能だった形質。worst には出さないが、隠さず別枠で報告する */
  const undecidableKeys = v2dTraits.filter((t) => t.deviation === null).map((t) => t.key);

  // --- V-2e 非能力形質の分化: 集団SDが創始の 0.8〜1.4倍（D-012 で全非能力形質へ一般化） ---
  const finalTraitSds = finalCohort?.traitSds;
  const v2eTraits = NON_ABILITY_TRAITS.map((key) => {
    const founderSd = founderTraitSds[key];
    const finalSd = finalTraitSds?.[key] ?? 0;
    const ratio = founderSd === 0 ? 0 : finalSd / founderSd;
    return {
      key,
      founderSd,
      finalSd,
      ratio: round(ratio, 4),
      pass: ratio >= V2E_TARGET[0] && ratio <= V2E_TARGET[1],
    };
  });
  const worstSd = v2eTraits.reduce<(typeof v2eTraits)[number] | null>(
    (acc, t) => (acc === null || Math.abs(t.ratio - 1) > Math.abs(acc.ratio - 1) ? t : acc),
    null,
  );
  const v2ePass = v2eTraits.every((t) => t.pass);

  // --- V-2c 長期健全性: 300ゲーム内年でも V-1 が 12〜18% に留まる ---
  // 本編とは別に長期シミュレーションを内部で回す（再帰は1段だけ）
  let v2c: Verification['v2c'] = {
    evaluated: false,
    generations: 0,
    v1MeanCv: 0,
    target: V1_TARGET,
    pass: false,
    note: 'V-2c は別実行で確認すること（--long-horizon 300 を付けるとこの実行内で判定します）',
  };
  if (opts.longHorizonGenerations > 0) {
    const longRun = runSimulation(
      { ...opts, generations: opts.longHorizonGenerations, longHorizonGenerations: 0 },
      balance,
      founders,
      nicksGen,
    );
    const longCv = longRun.verification.v1.primaryMeanCv;
    v2c = {
      evaluated: true,
      generations: opts.longHorizonGenerations,
      v1MeanCv: longCv,
      target: V1_TARGET,
      pass: longCv >= V1_TARGET[0] && longCv <= V1_TARGET[1],
      note: `同一シードで ${opts.longHorizonGenerations} ゲーム内年を別途実行して判定`,
    };
    longHorizon = longRun;
  }

  const verification: Verification = {
    v1: {
      checkpoints: v1Checkpoints,
      primaryGeneration: primaryV1?.generation ?? 0,
      primaryMeanCv,
      target: V1_TARGET,
      pass: v1Pass,
    },
    v2a: {
      slopePctPerGeneration: round(slopePct, 4),
      windowGenerations: slopeWindow.length,
      targetAbsMax: V2A_TARGET_ABS_MAX,
      pass: v2aPass,
    },
    v2b: {
      ceilingRatio: round(ceilingRatio, 4),
      meanAbilityPerKey: round(meanAbilityPerKey, 2),
      alleleMax,
      targetMax: V2B_TARGET_MAX,
      pass: v2bPass,
    },
    v2c,
    v2d: {
      traits: v2dTraits,
      abilityReference,
      worstKey: worst?.key ?? null,
      worstDeviation: worst?.deviation ?? null,
      undecidableKeys,
      targetAbsMax: V2D_TARGET_ABS_MAX,
      pass: v2dTraits.every((t) => t.pass),
    },
    v2f: {
      traits: v2fTraits,
      worstKey: worstSlope?.key ?? null,
      worstSlopePctPerGen: worstSlope?.slopePctPerGen ?? 0,
      target: V2A_TARGET_ABS_MAX,
      pass: v2fPass,
    },
    v2e: {
      traits: v2eTraits,
      worstKey: worstSd?.key ?? null,
      worstRatio: worstSd?.ratio ?? 0,
      target: V2E_TARGET,
      pass: v2ePass,
    },
    legacyRatio: {
      initialMeanAbilityTotal: round(initialMean, 2),
      finalMeanAbilityTotal: round(finalMean, 2),
      finalMeanAbilityTotalSmoothed: round(finalMeanSmoothed, 2),
      ratio: round(ratio, 5),
      ratioSmoothed: round(ratioSmoothed, 5),
      note: '旧基準（+50%以内）の実測値。D-008 で廃止済みのため合否判定には使わない',
    },
    v3: {
      atavism: v3Atavism,
      bigAtavism: v3BigAtavism,
      bigMutation: v3BigMutation,
      tolerancePt,
      pass: v3Pass,
    },
    // V-2c は未実行なら判定に含めない（別実行で確認する運用・正典 §13.2）
    pass:
      v1Pass &&
      v2aPass &&
      v2bPass &&
      v2dTraits.every((t) => t.pass) &&
      v2fPass &&
      v2ePass &&
      v3Pass &&
      (!v2c.evaluated || v2c.pass),
  };

  return {
    options: opts,
    balanceDigest: {
      genetics: balance.genetics,
      founders,
      dominantWeight: balance.DOMINANT_WEIGHT,
      regressionRate: balance.REGRESSION_RATE,
      traitMutation: balance.traitMutation,
      pedigreeDepth: balance.PEDIGREE_DEPTH,
      mareLifetimeFoals: balance.MARE_LIFETIME_FOALS,
      stallionBaseCoverings: balance.STALLION_BASE_COVERINGS,
      minBreedingAgeYears: opts.maturityYears,
    },
    founderCohort,
    cohorts,
    verification,
    longHorizon,
    finalPopulation: opts.retainFinalPopulation ? finalFoals : null,
    totals: {
      matings: totalMatings,
      foals: totalMatings,
      unbredMares: totalUnbred,
      horsesCreated: horseCounter,
    },
  };
}
