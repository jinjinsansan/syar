/**
 * STAR race-engine 型定義
 *
 * 正典 STAR_SPEC_v2.0.md §8（レースシミュレーション）に準拠。
 * 憲法 §0.1: 他社製品由来の語をコード内に使わない。
 * 憲法 §1-4: 乱数は注入する（このパッケージも `Math.random()` を呼ばない）。
 */

import type { AbilityKey, HorseId, SkillGene, Strategy } from '@star/sim-engine';
import type { OvalSpec } from './lane.js';

// ---------------------------------------------------------------------------
// レース条件
// ---------------------------------------------------------------------------

/** 馬場（正典 §5.2 surface_aptitude に対応） */
export type Surface = 'turf' | 'dirt';

/** 馬場状態（正典 §5.2 condition_aptitude に対応） */
/**
 * 馬場状態（正典 §5.2）。**良/稍重/重/不良の4段**。
 *
 * ★P0 では3段（soft が「重〜不良」を兼ねる）だったが、D-015 で `heavy_aptitude` が
 *   単一値になった以上、潰す理由がない。**この形質が最も強く効くのは最悪の馬場**なので、
 *   不良を落とすと発現幅が構造的に狭まり、D-015 の目的（道悪巧者を配合で狙える）が薄まる。
 */
export type TrackCondition = 'good' | 'yielding' | 'soft' | 'bad';

export const TRACK_CONDITIONS: readonly TrackCondition[] = ['good', 'yielding', 'soft', 'bad'];

/**
 * コース形態。枠順補正（§8.3 gateCoef）の向きを決める。
 *
 * ⚠️ 正典 §8.3 は「距離とコース形態で内外の有利不利」とだけ述べ、形態の分類も式も
 *    定めていない。ここは開発側の解釈（報告書 §7 に全件列挙）。
 */
export type CourseShape = 'straight' | 'oval';

/** 距離帯（正典 §8.2 の5段階） */
export type DistanceBand = 'sprint' | 'mile' | 'intermediate' | 'long' | 'extended';

export interface RaceConditions {
  /** レース識別子。Provably Fair の final_seed 導出に使う（§8.6） */
  raceId: string;
  distance: number;
  surface: Surface;
  trackCondition: TrackCondition;
  courseShape: CourseShape;
  /**
   * ★**その競馬場の走路の形**（1周・直線・幅）。★距離ロス（D-065 / D-071）が これで変わります。
   *
   * ⚠️ ★`courseShape`（`'straight' | 'oval'`）とは**別のもの**です。
   *    ★あちらは「コーナーが在るか」、★こちらは「そのコーナーがどれだけ深いか」。
   *
   * ★**省略すると `DEFAULT_OVAL`**（1周2000m・直線400m・幅20m）。
   *   ★渡さないレースは**いままでと 1 ビットも変わりません**。
   *
   * ⚠️ ★**ここは着順に効く経路です**（憲法 3・D-071）。
   *    ★描画層にも同じ形を渡すこと。★`apps/cli/test/venue-course.test.ts` が
   *    ★エンジン（`ovalSegments` / `laneExtraM`）と描画層（`ovalCourse` / `laneExtraMeters`）を
   *    ★10 場ぶん突き合わせています。★片方だけ変えると落ちます。
   */
  course?: OvalSpec;
  /** 基準斤量からの増減を各馬が持つため、レース側は基準値のみ持つ */
  baseWeightKg: number;
}

// ---------------------------------------------------------------------------
// 出走馬
// ---------------------------------------------------------------------------

/**
 * レース判定に必要な1頭ぶんの入力。
 *
 * ★`HorseRecord` をそのまま受け取らない理由:
 *   レースは「現在値(stats)・調子・疲労・斤量・枠順・年齢」というレース当日の状態に依存し、
 *   これらは §7 の育成ループ（P3）が持つ。race-engine を `HorseRecord` に結び付けると
 *   育成が入るまでレース単体の検証ができない。**入力を平坦な構造体に切ることで、
 *   モンテカルロ（K-5）が育成なしで回せる**。変換は `toEntrant()`（entrant.ts）が担う。
 */
export interface RaceEntrant {
  horseId: HorseId;
  /** 現在値（正典 §8.2 の base はこれを使う。potential ではない） */
  stats: Record<AbilityKey, number>;
  surfaceAptitude: Record<Surface, number>;
  distanceCenter: number;
  distanceRange: number;
  strategyAptitude: Record<Strategy, number>;
  /**
   * 道悪適性 0〜100（正典 §5.2・D-015）。**genotype から遺伝する**。
   * 良馬場は全馬 1.0 なので、効くのは稍重・重・不良のみ。
   */
  heavyAptitude: number;
  /** この馬が選択した脚質（プレイヤーの意思決定。§8.4） */
  strategy: Strategy;
  /** 調子 1〜5（正典 §8b.2 が `(condition - 3) * 4` と書くので中央値3） */
  condition: number;
  /** 疲労 0〜100（正典 §8.3 `1 - fatigue/500`） */
  fatigue: number;
  /** 斤量 kg */
  weightKg: number;
  /** 枠順 1〜18 */
  gate: number;
  /** 年齢（歳）。正典 §8.3 は 2歳0.88 → 4歳1.00 → 5歳末0.96 */
  age: number;
  /** 保有スキル遺伝子（最大3・§5.3） */
  skillGenes: readonly SkillGene[];
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------

/** 展開（正典 §8.4） */
export type Pace = 'high' | 'middle' | 'slow';

/** 1頭ぶんのスコア内訳。検証・不正調査・デバッグのために全係数を残す（§8.6） */
export interface ScoreBreakdown {
  base: number;
  distanceAptitudeCoef: number;
  surfaceCoef: number;
  trackConditionCoef: number;
  strategyCoef: number;
  conditionCoef: number;
  fatigueCoef: number;
  weightCoef: number;
  gateCoef: number;
  ageCoef: number;
  skillCoef: number;
  /**
   * ★**距離ロス**（D-065 / D-071）。内を通れば 1 より大きく、外を回れば小さい。
   *   `1 − 余計に走った距離 ÷ レース距離`。★**`w` はエンジンがシードから引く**
   *   （結果に効くものは、シードから結果を作る鎖の中に無ければならない）。
   */
  laneCoef: number;
  /** 全補正適用後・乱数適用前 */
  score: number;
  /** 発動したスキル */
  firedSkills: SkillGene[];
}

export interface RaceResultEntry {
  horseId: HorseId;
  /** 1着 = 1 */
  finishPosition: number;
  breakdown: ScoreBreakdown;
  /** 乱数倍率 `1 + gaussian(0, K)`（§8.7） */
  randomMult: number;
  /** 介入倍率（§8b）。介入なしは 1 */
  interventionMult: number;
  finalScore: number;
  /**
   * ★**余計に走った距離 [m]**（内を通れば負）。
   *   ⚠️ ★描画層はこれを**読むだけ**で、自分では引きません（D-071）。
   */
  laneExtraM: number;
  /** 1着との着差（秒） */
  timeGapSec: number;
  /** 走破タイム（秒） */
  timeSec: number;
  /** 着差ラベル（前の馬との差。1着は空文字） */
  marginLabel: string;
}

export interface RaceResult {
  raceId: string;
  conditions: RaceConditions;
  pace: Pace;
  /** 逃げ宣言頭数（§8.4） */
  nigeCount: number;
  /** 着順（1着から） */
  order: RaceResultEntry[];
  /** 1着の走破タイムの基準（§8.7 baseTime） */
  baseTimeSec: number;
  /**
   * ハードキャップ外の `interventionMult` が渡された記録（O-3）。
   * 通常は空。空でなければバグかマクロの兆候なので、呼び出し側は監視に流すこと（§8b.7/§8b.8）。
   */
  capViolations: { horseId: string; received: number; applied: number }[];
}
