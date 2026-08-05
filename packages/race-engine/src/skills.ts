/**
 * 発動型スキル（正典 §8.5）
 *
 * 発動率 = 40% + IQ/2000。発動判定にのみ乱数を使う。
 *
 * ★2つの解釈がここに集中している（balance.ts の INTERPRETATIONS に登録済み）:
 *   - I-SKILL-SEGMENT: 「直線区間スコア +12%」を全体スコアへ**距離シェアで按分**する。
 *     §8.1 が区間シミュレーションを禁じているため区間そのものが存在しない。
 *   - I-SKILL-POSITION: 「6番手以下」「先頭」という位置条件を**脚質で代理**する。
 *     位置取りは §8.1 により着順確定後の逆生成なので、判定時点には存在しない。
 */

import type { Rng, SkillGene } from '@star/sim-engine';
import { SKILLS, type RaceBalance } from './balance.js';
import type { Surface, TrackCondition } from './types.js';
import type { Strategy } from '@star/sim-engine';

export interface SkillContext {
  distance: number;
  surface: Surface;
  trackCondition: TrackCondition;
  strategy: Strategy;
  gate: number;
  iq: number;
}

export interface SkillOutcome {
  /** skillCoef に掛ける倍率（発動が無ければ 1） */
  skillCoef: number;
  /** trackConditionCoef の上書き（雨得意）。上書きが無ければ null */
  trackConditionOverride: number | null;
  /** gateCoef への加算倍率（内枠強者）。無ければ 1 */
  gateCoefMult: number;
  /** base の ST 寄与増分（長距離砲）。無ければ 0 */
  stayerBonus: number;
  firedSkills: SkillGene[];
}

/** 発動率（正典 §8.5: 40% + IQ/2000） */
export function fireRate(iq: number, balance: RaceBalance): number {
  return balance.SKILL_FIRE_BASE + iq / balance.SKILL_FIRE_IQ_DIV;
}

/**
 * スキルの**前提条件**（正典 §8.5「発動条件」列）。
 * 条件を満たさないスキルは乱数を消費しない — 消費するとレースごとに消費数が変わり、
 * 「同じ seed なら同じレース」（§8.6）を保ちにくくなるため。
 */
export function isEligible(gene: SkillGene, ctx: SkillContext, balance: RaceBalance): boolean {
  switch (gene) {
    // 直線・6番手以下 → 差し/追込を代理変数にする（I-SKILL-POSITION）
    case 'G_SPURT':
      return ctx.strategy === 'sashi' || ctx.strategy === 'oikomi';
    // 直線・先頭 → 逃げを代理変数にする（I-SKILL-POSITION）
    case 'G_HOLD':
      return ctx.strategy === 'nige';
    // スタート（出遅れ無効化）。出遅れモデルは P1 に無いため効果0で発動だけ記録する
    case 'G_GATE':
      return true;
    // 馬場が良以外
    case 'G_MUD':
      return ctx.trackCondition !== 'good';
    // 枠1〜4
    case 'G_INNER':
      return ctx.gate <= balance.INNER_SKILL_MAX_GATE;
    // 2400m以上
    case 'G_STAYER':
      return ctx.distance >= balance.STAYER_SKILL_DISTANCE;
    default:
      return false;
  }
}

/**
 * 保有スキルの発動判定と効果の集計。
 *
 * ★乱数の消費順は `skillGenes` の並び順に依存する。呼び出し側は並びを安定させること
 *   （`resolveRace` は入力順のまま渡す。並べ替えると同一 seed で結果が変わる）。
 */
export function resolveSkills(
  skillGenes: readonly SkillGene[],
  ctx: SkillContext,
  rng: Rng,
  balance: RaceBalance,
): SkillOutcome {
  const rate = fireRate(ctx.iq, balance);
  const outcome: SkillOutcome = {
    skillCoef: 1,
    trackConditionOverride: null,
    gateCoefMult: 1,
    stayerBonus: 0,
    firedSkills: [],
  };

  /** 直線が全体距離に占める割合（I-SKILL-SEGMENT） */
  const straightShare = Math.min(1, balance.STRAIGHT_METERS / ctx.distance);

  for (const gene of skillGenes) {
    const spec = SKILLS.find((s) => s.gene === gene);
    if (spec === undefined) continue;
    if (!isEligible(gene, ctx, balance)) continue;
    if (!rng.bool(rate)) continue;

    outcome.firedSkills.push(gene);

    switch (spec.scope) {
      case 'straight':
        // 区間効果を距離シェアで按分して全体へ畳み込む
        outcome.skillCoef *= 1 + spec.magnitude * straightShare;
        break;
      case 'whole':
        outcome.skillCoef *= 1 + spec.magnitude;
        break;
      case 'special':
        switch (gene) {
          case 'G_MUD':
            outcome.trackConditionOverride = balance.MUD_SKILL_COEF;
            break;
          case 'G_INNER':
            outcome.gateCoefMult *= 1 + spec.magnitude;
            break;
          case 'G_STAYER':
            outcome.stayerBonus += balance.STAYER_ST_BONUS;
            break;
          case 'G_GATE':
            // 出遅れモデルは P1 に無い（§8.5「出遅れ無効化」）。発動記録のみ
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }

  return outcome;
}
