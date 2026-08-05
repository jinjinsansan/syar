/**
 * STAR race-engine 型定義
 *
 * 正典 STAR_SPEC_v2.0.md §8（レースシミュレーション）に準拠。
 * 憲法 §0.1: 他社製品由来の語をコード内に使わない。
 * 憲法 §1-4: 乱数は注入する（このパッケージも `Math.random()` を呼ばない）。
 */

import type { AbilityKey, HorseId, SkillGene, Strategy } from '@star/sim-engine';

// ---------------------------------------------------------------------------
// レース条件
// ---------------------------------------------------------------------------

/** 馬場（正典 §5.2 surface_aptitude に対応） */
export type Surface = 'turf' | 'dirt';

/** 馬場状態（正典 §5.2 condition_aptitude に対応） */
export type TrackCondition = 'good' | 'yielding' | 'soft';

export const TRACK_CONDITIONS: readonly TrackCondition[] = ['good', 'yielding', 'soft'];

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
   * 馬場状態適性（正典 §5.2）。
   * ⚠️ **genotype スキーマ（§5.4）に `condition_aptitude` が無い**ため遺伝で決まらない（I-COND-APT-SOURCE）。
   *    P1 では入力として受け取り、既定は中立値を置く（QUESTIONS_P1 で照会中）。
   */
  conditionAptitude: Record<TrackCondition, number>;
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
}
