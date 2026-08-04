/**
 * STAR sim-engine 型定義
 *
 * 正典 STAR_SPEC_v2.0.md §5（馬のパラメータ）§6（遺伝・配合）に準拠。
 * 憲法 §0.1 / 指示書 §1-1: 他社製品由来の語をコード内に使わない。
 */

// ---------------------------------------------------------------------------
// 基本型
// ---------------------------------------------------------------------------

/** 基礎能力5種（正典 §5.1・各 0〜1000） */
export type AbilityKey = 'sp' | 'st' | 'pw' | 'gt' | 'iq';

export const ABILITY_KEYS: readonly AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];

/** 脚質（正典 §5.2） */
export type Strategy = 'nige' | 'senko' | 'sashi' | 'oikomi';

export const STRATEGIES: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];

/** 成長型（正典 §5.3） */
export type GrowthType = 'early' | 'normal' | 'late' | 'late_bloomer';

export const GROWTH_TYPES: readonly GrowthType[] = ['early', 'normal', 'late', 'late_bloomer'];

export type Sex = 'male' | 'female';

/** スキル遺伝子（正典 §5.4 skill_genes / §8.5 の発動型スキルに対応） */
export type SkillGene = string;

/** 血統ライン識別子（父系 / 母父系）。創始世代に LINE_A..LINE_T を割当（指示書 §3.3） */
export type LineId = string;

export type HorseId = string;

// ---------------------------------------------------------------------------
// genotype（正典 §5.4 に完全準拠）
// ---------------------------------------------------------------------------

export interface AllelePair {
  a1: number;
  a2: number;
}

export interface CategoricalAllelePair<T extends string> {
  a1: T;
  a2: T;
}

export interface Genotype {
  sp: AllelePair;
  st: AllelePair;
  pw: AllelePair;
  gt: AllelePair;
  iq: AllelePair;
  surface: { turf: AllelePair; dirt: AllelePair };
  distance_center: AllelePair;
  distance_range: AllelePair;
  strategy_bias: CategoricalAllelePair<Strategy>;
  growth: CategoricalAllelePair<GrowthType>;
  temper: AllelePair;
  durability: AllelePair;
  skill_genes: SkillGene[];
}

/**
 * 数値形質のキー一覧。アレル継承・隔世遺伝・突然変異はこの11形質に対して回る。
 * （strategy_bias / growth はカテゴリ形質、skill_genes は集合形質なので別扱い）
 */
export const NUMERIC_TRAITS = [
  'sp',
  'st',
  'pw',
  'gt',
  'iq',
  'surface.turf',
  'surface.dirt',
  'distance_center',
  'distance_range',
  'temper',
  'durability',
] as const;

export type NumericTraitKey = (typeof NUMERIC_TRAITS)[number];

/** genotype から数値形質のアレル対を取り出す（any を使わずに型安全に分岐） */
export function getAllelePair(g: Genotype, key: NumericTraitKey): AllelePair {
  switch (key) {
    case 'sp':
      return g.sp;
    case 'st':
      return g.st;
    case 'pw':
      return g.pw;
    case 'gt':
      return g.gt;
    case 'iq':
      return g.iq;
    case 'surface.turf':
      return g.surface.turf;
    case 'surface.dirt':
      return g.surface.dirt;
    case 'distance_center':
      return g.distance_center;
    case 'distance_range':
      return g.distance_range;
    case 'temper':
      return g.temper;
    case 'durability':
      return g.durability;
  }
}

/** genotype に数値形質のアレル対を書き戻す */
export function setAllelePair(g: Genotype, key: NumericTraitKey, pair: AllelePair): void {
  switch (key) {
    case 'sp':
      g.sp = pair;
      return;
    case 'st':
      g.st = pair;
      return;
    case 'pw':
      g.pw = pair;
      return;
    case 'gt':
      g.gt = pair;
      return;
    case 'iq':
      g.iq = pair;
      return;
    case 'surface.turf':
      g.surface.turf = pair;
      return;
    case 'surface.dirt':
      g.surface.dirt = pair;
      return;
    case 'distance_center':
      g.distance_center = pair;
      return;
    case 'distance_range':
      g.distance_range = pair;
      return;
    case 'temper':
      g.temper = pair;
      return;
    case 'durability':
      g.durability = pair;
      return;
  }
}

export function cloneGenotype(g: Genotype): Genotype {
  return {
    sp: { ...g.sp },
    st: { ...g.st },
    pw: { ...g.pw },
    gt: { ...g.gt },
    iq: { ...g.iq },
    surface: { turf: { ...g.surface.turf }, dirt: { ...g.surface.dirt } },
    distance_center: { ...g.distance_center },
    distance_range: { ...g.distance_range },
    strategy_bias: { ...g.strategy_bias },
    growth: { ...g.growth },
    temper: { ...g.temper },
    durability: { ...g.durability },
    skill_genes: g.skill_genes.slice(),
  };
}

// ---------------------------------------------------------------------------
// 血統キャッシュ（正典 §6.5 pedigree_cache）
// ---------------------------------------------------------------------------

/**
 * 祖先ID → その祖先へ至る経路の「代数」の配列。
 * 同一祖先へ複数経路があれば複数要素を持つ（例: 3×4 クロスなら [2, 3]）。
 * 共通祖先の有無を O(1) で判定するための索引として使う。
 */
export type PedigreeCache = ReadonlyMap<HorseId, readonly number[]>;

// ---------------------------------------------------------------------------
// 馬レコード
// ---------------------------------------------------------------------------

/** 配合1件の監査記録（正典 §6.1-11: rng_seed とともに記録） */
export interface BreedingRecord {
  sireId: HorseId;
  damId: HorseId;
  rngSeed: number;
  inbreedCoeff: number;
  /** 近交係数へ最も寄与した共通祖先（血の濃縮 §6.5 の参照先） */
  topCommonAncestorId: HorseId | null;
  nicksMultiplier: number;
  /** 隔世遺伝が発動した形質 */
  atavismTraits: NumericTraitKey[];
  /** 大物覚醒が発動した形質 */
  bigAtavismTraits: NumericTraitKey[];
  /** 大突然変異が発動した形質 */
  bigMutationTraits: NumericTraitKey[];
  /** 隔世遺伝ロールを実行できた回数（祖父母が存在する形質数） */
  atavismEligibleRolls: number;
  /** 大物覚醒ロールを実行できた回数（5代以内に祖先が存在する形質数） */
  bigAtavismEligibleRolls: number;
  /** 突然変異ロール回数（= 数値形質数 × 2アレル） */
  mutationRolls: number;
  frail: boolean;
}

export interface HorseRecord {
  id: HorseId;
  sex: Sex;
  /** 創始世代を 0 とする世代番号 */
  generation: number;
  /** シミュレータ内の生年（年 = 1世代） */
  birthYear: number;

  sireId: HorseId | null;
  damId: HorseId | null;
  /** 父系ライン（父から継承） */
  sireLine: LineId;
  /** 母父系ライン（母の父系ラインを継承。創始世代は null） */
  damSireLine: LineId | null;

  genotype: Genotype;

  /** 素質値（正典 §2: 遺伝で決まる各能力の上限。プレイヤー非公開） */
  potential: Record<AbilityKey, number>;
  /** 現在値（デビュー時の初期 stats = potential × 素質開放率） */
  stats: Record<AbilityKey, number>;
  /** 初期素質開放率（正典 §6.1-8: 0.28〜0.35） */
  unlockRate: number;

  // 発現形質（正典 §5.2 / §5.3）
  surfaceAptitude: { turf: number; dirt: number };
  distanceCenter: number;
  distanceRange: number;
  strategyAptitude: Record<Strategy, number>;
  growth: GrowthType;
  temper: number;
  durability: number;
  /** 故障率倍率（正典 §6.5: インブリード由来。§7.5 で使用予定） */
  injuryRateMult: number;
  /** 近交弱勢の虚弱フラグ（正典 §6.5） */
  frail: boolean;
  skillGenes: SkillGene[];

  /** 近交係数 F（正典 §6.5） */
  inbreedCoeff: number;
  /** 適用されたニックス倍率（正典 §6.6） */
  nicksMultiplier: number;

  pedigreeCache: PedigreeCache;

  // 繁殖管理（正典 §6.7）
  /** 産駒数（繁殖牝馬: 生涯8産まで） */
  foalCount: number;
  /** 当年の種付け回数（種牡馬: 年間 20 + G1勝利数×10 まで） */
  coveringsThisYear: number;
  /** 当年に受胎済みか（繁殖牝馬: 年1回のみ） */
  bredThisYear: boolean;
  /** G1 勝利数。P0 ではレース未実装のため常に 0（正典 §6.7 の種付上限式で使用） */
  g1Wins: number;

  breedingRecord: BreedingRecord | null;
}

/** 祖先参照用のルックアップ（DB / メモリのどちらでも差し替えられるよう注入する） */
export type HorseLookup = (id: HorseId) => HorseRecord | undefined;
