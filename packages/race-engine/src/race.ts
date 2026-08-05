/**
 * レース判定本体（正典 §8.2〜§8.7）
 *
 * 方針（§8.1）: 「実力スコア＋乱数」でソートして着順を決める。物理シミュレーションは行わない。
 *
 * 決定論（憲法 §1-4 / 正典 §8.6）:
 *   - 乱数は `Rng` を注入。`Math.random()` を呼ばない
 *   - 乱数の消費経路は「馬ごとに独立したサブストリーム」に分ける（`deriveRng`）。
 *     ★理由: 1頭のスキル数が変わっても他馬の乱数がずれない。共有ストリームだと
 *     出走馬を1頭差し替えただけで**全馬の結果が変わり**、リプレイ・不正調査で
 *     「何が効いたのか」を切り分けられなくなる（K-2 の系列独立性の要求と同根）。
 */

import { deriveRng, type Rng } from '@star/sim-engine';
import { MARGIN_LABELS, type RaceBalance } from './balance.js';
import { baseScore, decidePace, deterministicCoefs } from './coefficients.js';
import { resolveSkills, type SkillContext } from './skills.js';
import type {
  Pace,
  RaceConditions,
  RaceEntrant,
  RaceResult,
  RaceResultEntry,
  ScoreBreakdown,
  Surface,
  TrackCondition,
} from './types.js';

/** 乱数サブストリームの用途ID。混ざらないよう1か所で管理する（K-2 の系列独立性） */
export const RNG_STREAM = {
  /** スキル発動判定（馬ごと） */
  SKILL: 1,
  /** 着順を決める最終乱数（馬ごと） */
  FINAL: 2,
} as const;

export interface ResolveRaceParams {
  conditions: RaceConditions;
  entrants: readonly RaceEntrant[];
  /** マスターシード。§8.6 の final_seed をそのまま渡す想定 */
  seed: number;
  balance: RaceBalance;
  /**
   * 介入倍率（§8b）。`horseId → interventionMult`。
   * 与えられない馬は 1（介入なし）。K-3 が生成する。
   */
  interventionMults?: ReadonlyMap<string, number>;
}

/** §8.7 baseTime（I-SPEED-MODEL） */
export function averageSpeedMps(
  distance: number,
  surface: Surface,
  trackCondition: TrackCondition,
  balance: RaceBalance,
): number {
  const decay = 1 - (distance / 1000) * balance.SPEED_DISTANCE_DECAY_PER_1000M;
  return (
    balance.BASE_SPEED_MPS *
    balance.SPEED_SURFACE_MULT[surface] *
    balance.SPEED_CONDITION_MULT[trackCondition] *
    decay
  );
}

/** 着差ラベル（正典 §8.7・I-MARGIN-LABELS） */
export function marginLabel(gapSec: number): string {
  for (const entry of MARGIN_LABELS) {
    if (gapSec <= entry.maxGapSec) return entry.label;
  }
  throw new Error(`marginLabel: ラベルを決定できない (${gapSec})`);
}

/** 逃げ宣言頭数からペースを決める（§8.4） */
export function paceOf(entrants: readonly RaceEntrant[], balance: RaceBalance): {
  pace: Pace;
  nigeCount: number;
} {
  const nigeCount = entrants.filter((e) => e.strategy === 'nige').length;
  return { pace: decidePace(nigeCount, balance), nigeCount };
}

export function resolveRace(params: ResolveRaceParams): RaceResult {
  const { conditions, entrants, seed, balance } = params;
  if (entrants.length === 0) {
    throw new Error('resolveRace: 出走馬が0頭');
  }
  const ids = new Set(entrants.map((e) => e.horseId));
  if (ids.size !== entrants.length) {
    throw new Error('resolveRace: horseId が重複している（着順の同定ができない）');
  }

  const { pace, nigeCount } = paceOf(entrants, balance);
  const fieldSize = entrants.length;

  const scored = entrants.map((entrant, index) => {
    const skillCtx: SkillContext = {
      distance: conditions.distance,
      surface: conditions.surface,
      trackCondition: conditions.trackCondition,
      strategy: entrant.strategy,
      gate: entrant.gate,
      iq: entrant.stats.iq,
    };
    // ★馬ごとに独立したサブストリーム。index を使うので入力順に依存する点に注意
    //   （出走表の順序はレースの一部＝枠順と対応するため、順序込みで再現するのが正しい）
    const skillRng: Rng = deriveRng(seed, RNG_STREAM.SKILL, index);
    const skills = resolveSkills(entrant.skillGenes, skillCtx, skillRng, balance);

    const coefs = deterministicCoefs(
      entrant,
      {
        distance: conditions.distance,
        surface: conditions.surface,
        trackCondition: conditions.trackCondition,
        courseShape: conditions.courseShape,
        baseWeightKg: conditions.baseWeightKg,
        fieldSize,
        pace,
      },
      balance,
    );

    // 雨得意は trackConditionCoef を「上書き」する（正典 §8.5）
    const trackCoef = skills.trackConditionOverride ?? coefs.trackConditionCoef;
    // 内枠強者は gateCoef に +5%（正典 §8.5）
    const gate = coefs.gateCoef * skills.gateCoefMult;
    // 長距離砲は base の ST 寄与を +15%（正典 §8.5）
    const base = baseScore(entrant.stats, conditions.distance, skills.stayerBonus);

    const breakdown: ScoreBreakdown = {
      base,
      distanceAptitudeCoef: coefs.distanceAptitudeCoef,
      surfaceCoef: coefs.surfaceCoef,
      trackConditionCoef: trackCoef,
      strategyCoef: coefs.strategyCoef,
      conditionCoef: coefs.conditionCoef,
      fatigueCoef: coefs.fatigueCoef,
      weightCoef: coefs.weightCoef,
      gateCoef: gate,
      ageCoef: coefs.ageCoef,
      skillCoef: skills.skillCoef,
      score: 0,
      firedSkills: skills.firedSkills,
    };
    breakdown.score =
      base *
      breakdown.distanceAptitudeCoef *
      breakdown.surfaceCoef *
      breakdown.trackConditionCoef *
      breakdown.strategyCoef *
      breakdown.conditionCoef *
      breakdown.fatigueCoef *
      breakdown.weightCoef *
      breakdown.gateCoef *
      breakdown.ageCoef *
      breakdown.skillCoef;

    // §8.7: finalScore = score * (1 + gaussian(0, K)) * interventionMult
    const finalRng: Rng = deriveRng(seed, RNG_STREAM.FINAL, index);
    const randomMult = 1 + finalRng.gaussian(0, balance.RACE_RANDOM_K);
    const interventionMult = params.interventionMults?.get(entrant.horseId) ?? 1;
    // ★負のスコアは着順の意味を壊す（乱数が -1 を下回ると符号が反転する）。
    //   K=0.12 なら 8.3σ 相当で実質起きないが、K を上げて較正する運用があるため塞いでおく。
    const finalScore = Math.max(0, breakdown.score * randomMult * interventionMult);

    return { entrant, breakdown, randomMult, interventionMult, finalScore };
  });

  // 着順 = finalScore 降順。同値は入力順（＝枠順）で安定させる
  const ranked = scored
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => (b.finalScore - a.finalScore) || (a.index - b.index));

  const winner = ranked[0];
  if (winner === undefined) throw new Error('resolveRace: 着順の生成に失敗');

  const speed = averageSpeedMps(
    conditions.distance,
    conditions.surface,
    conditions.trackCondition,
    balance,
  );
  const baseTimeSec = conditions.distance / speed;

  const order: RaceResultEntry[] = ranked.map((row, i) => {
    // §8.7: timeGap_i = (finalScore_1 - finalScore_i) / finalScore_1 * baseTime * 0.55
    const timeGapSec =
      winner.finalScore > 0
        ? ((winner.finalScore - row.finalScore) / winner.finalScore) *
          baseTimeSec *
          balance.TIME_GAP_FACTOR
        : 0;
    const prev = i === 0 ? null : ranked[i - 1];
    const prevGap =
      prev === undefined || prev === null
        ? 0
        : ((winner.finalScore - prev.finalScore) / (winner.finalScore || 1)) *
          baseTimeSec *
          balance.TIME_GAP_FACTOR;
    return {
      horseId: row.entrant.horseId,
      finishPosition: i + 1,
      breakdown: row.breakdown,
      randomMult: row.randomMult,
      interventionMult: row.interventionMult,
      finalScore: row.finalScore,
      timeGapSec,
      timeSec: baseTimeSec + timeGapSec,
      marginLabel: i === 0 ? '' : marginLabel(timeGapSec - prevGap),
    };
  });

  return { raceId: conditions.raceId, conditions, pace, nigeCount, order, baseTimeSec };
}
