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

import {
  RACE_STREAM, deriveRng, type Rng } from '@star/sim-engine';
import { MARGIN_LABELS, type RaceBalance } from './balance.js';
import { baseScore, decidePace, deterministicCoefs } from './coefficients.js';
import { resolveSkills, type SkillContext } from './skills.js';
import { laneExtraM } from './lane.js';
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
// ★用途IDは @star/sim-engine の集約表に一本化した（番号の重複を型で禁じるため）
export const RNG_STREAM = RACE_STREAM;

/**
 * `interventionMult` をハードキャップ内に収める（憲法 §1.5-1 / 正典 §8b.3・§13.1）。
 *
 * ★非有限値（NaN / Infinity）は**1 に倒す**。NaN を素通しすると `finalScore` が NaN になり、
 *   ソート比較がすべて false になって「着順が入力順のまま」という静かな破綻を生む（R-3）。
 */
export function clampInterventionMult(value: number, balance: RaceBalance): number {
  if (!Number.isFinite(value)) return 1;
  const cap = balance.INTERVENTION_CAP;
  const min = 1 - cap;
  const max = 1 + cap;
  return value < min ? min : value > max ? max : value;
}

/** キャップを超える `interventionMult` が渡された記録（§8b.7 マクロ検知・§8b.8 監視の入力） */
export interface CapViolation {
  horseId: string;
  received: number;
  applied: number;
}

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
  const capViolations: CapViolation[] = [];

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

    /**
     * ★**横位置 `w` と距離ロス**（D-071）。
     *   ⚠️ ★`deriveRng` のストリームを使いません。`w` は**レース共通のシードから**
     *      決定的に引きます（馬ごとの乱数消費数を変えないため。Provably Fair）。
     */
    const laneExtra = conditions.courseShape === 'oval'
      ? laneExtraM(entrant.gate, fieldSize, conditions.distance, seed)
      : 0;

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
      /**
       * ★**距離ロス**（D-065 / D-071）。`w` は**シードから引き**、脚質からは作らない（D-069）。
       *   ⚠️ ★**倍率を発明していません。** `1 − 余計に走った距離 ÷ レース距離` そのままです。
       *      1600m で 25m 余計に走れば 1.56% 遅い、という物理どおりの量。
       *   ★大きさは V-18 が縛ります（枠順と着順の相関 ≤ 0.10 かつ 内外差 4〜12馬身）。
       */
      laneCoef: 1 - laneExtra / conditions.distance,
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
      breakdown.skillCoef *
      breakdown.laneCoef;

    // §8.7: finalScore = score * (1 + gaussian(0, K)) * interventionMult
    const finalRng: Rng = deriveRng(seed, RNG_STREAM.FINAL, index);
    // ★案D: 混合分布。**bool を必ず1回消費する**ので、馬あたりの乱数消費数は
    //   分岐に関わらず一定（決定論と Provably Fair を壊さない）。
    const heavyTail = finalRng.bool(balance.TAIL_MIX_P);
    const spread = balance.RACE_RANDOM_K * (heavyTail ? balance.TAIL_MIX_M : 1);
    const randomMult = 1 + finalRng.gaussian(0, spread);
    // ★憲法 §1.5-1 のハードキャップ ±10% は、**サーバー権威のスコア確定点**（§8b.4）である
    //   ここで効かなければ意味がない。純関数 `resolveIntervention` の中だけで守っていたため、
    //   `interventionMults` に 100 を渡すとそのまま勝てた（O-3）。
    //   クランプは黙って行わず `capViolations` に記録する（不正の兆候かもしれないため）。
    const rawInterventionMult = params.interventionMults?.get(entrant.horseId) ?? 1;
    const interventionMult = clampInterventionMult(rawInterventionMult, balance);
    if (interventionMult !== rawInterventionMult) {
      capViolations.push({
        horseId: entrant.horseId,
        received: rawInterventionMult,
        applied: interventionMult,
      });
    }
    // ★負のスコアは着順の意味を壊す（乱数が -1 を下回ると符号が反転する・I-SCORE-FLOOR）。
    //   K=0.12 なら 8.3σ 相当で実質起きないが、K を上げて較正する運用があるため塞いでおく。
    const finalScore = Math.max(0, breakdown.score * randomMult * interventionMult);

    return { entrant, breakdown, randomMult, interventionMult, finalScore, laneExtra };
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

  /**
   * ★**スコア差 → 着差の写像**（正典 §8.7 / `TIME_GAP_SHAPE_GAMMA`）
   *
   *   現行（γ=1.0）は線形です。γ を上げると**レースごとの総差（1着-最下位）を保ったまま**、
   *   上位を締めて下位を伸ばします。総差が定義から不変なので V-17② は動かず、
   *   r について単調なので**着順は不変**です（着順は `finalScore` で既に確定しています）。
   *
   * ⚠️ ★**γ = 1.0 のときは現行の式をそのまま通します**（下の短絡）。
   *    代数的に同値でも `Math.pow` を通せば浮動小数の最下位ビットが動きうるためです。
   *    ★既定経路が 1 ビットも変わらないことを、実装で保証します（P0-fix5 と同じ規律）。
   */
  /** スコア差の比 `r_i = (S1 - Si)/S1`（現行と同じ量） */
  const ratioOf = (score: number): number =>
    winner.finalScore > 0 ? (winner.finalScore - score) / winner.finalScore : 0;
  /** ★現行の式そのもの。γ=1.0 はこれを通る */
  const linearGapOf = (score: number): number =>
    winner.finalScore > 0
      ? ((winner.finalScore - score) / winner.finalScore) *
        baseTimeSec *
        balance.TIME_GAP_FACTOR
      : 0;
  const lastRow = ranked[ranked.length - 1];
  const ratioLast = lastRow === undefined ? 0 : ratioOf(lastRow.finalScore);
  const gamma = balance.TIME_GAP_SHAPE_GAMMA;
  const gapOf = (score: number): number => {
    if (gamma === 1) return linearGapOf(score);          // ★短絡（既定経路は現行のまま）
    if (!(ratioLast > 0)) return 0;                      // 全馬同スコア: 現行と同じく全員 0 秒
    const total = ratioLast * baseTimeSec * balance.TIME_GAP_FACTOR;  // ★総差は現行と同一
    return total * Math.pow(ratioOf(score) / ratioLast, gamma);
  };
  /**
   * ★**着差ラベルは、確定した `timeGap` の隣接差から取ります**（I-4）。
   *   ⚠️ 以前は前の馬のスコアから**式を再計算**していました。写像を変えると
   *      画面に出る差とラベルが食い違います。**同じ写像から出すこと。**
   */
  const timeGaps = ranked.map((row) => gapOf(row.finalScore));

  const order: RaceResultEntry[] = ranked.map((row, i) => {
    const timeGapSec = timeGaps[i] ?? 0;
    const prevGap = i === 0 ? 0 : (timeGaps[i - 1] ?? 0);
    return {
      horseId: row.entrant.horseId,
      finishPosition: i + 1,
      breakdown: row.breakdown,
      randomMult: row.randomMult,
      interventionMult: row.interventionMult,
      finalScore: row.finalScore,
      laneExtraM: row.laneExtra,
      timeGapSec,
      timeSec: baseTimeSec + timeGapSec,
      // 着差ラベルは**前の馬との差**で出す（I-MARGIN-BASIS）
      marginLabel: i === 0 ? '' : marginLabel(timeGapSec - prevGap),
    };
  });

  return { raceId: conditions.raceId, conditions, pace, nigeCount, order, baseTimeSec, capViolations };
}
