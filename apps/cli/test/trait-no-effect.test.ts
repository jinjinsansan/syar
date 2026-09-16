/**
 * ★**先天個性・後天特性は着順に効かない**（★第 4 便の対照・2026-09-16・正典 **D-109 ①**）
 *
 * 【★なぜ「効果 0 の定数」だけでは足りないか】
 *   ★`TRAIT_EFFECT === 0` は ★**宣言**にすぎません。★誰かが別の経路（適性・調子・脚質など）で
 *   ★個性を着順に混ぜたら、★定数は 0 のままでも結果が動きます。
 *   → ★**実際に `resolveRace` を回して、1 ビットも変わらないこと**を見ます
 *     （★D-109 ①「定数が 0 なだけを根拠にしない」・`jockey-no-effect` と同じ形）。
 *
 * 【★この便の約束】★効かせるのは別の便です。★そのときは V-4・V-5・V-6・V-17 を取り直し、
 *   ★**繊細（馬群で力を出しにくい）なら V-18 ①②a②b**、★**泥巧者（道悪）なら V-2f** も取り直します（裁定 2-1）。
 */
import { describe, it, expect } from 'vitest';
import {
  innateTraitsOf, learnedTraitsOf, careerInputOf, traitsOf, TRAIT_EFFECT, traitEffectOf,
  INNATE_TRAITS, LEARNED_TRAITS,
} from '@star/sim-engine';
import { resolveRace, DEFAULT_RACE_BALANCE, type RaceConditions } from '@star/race-engine';
import { neutralEntrant } from '../../../packages/race-engine/test/helpers.js';

const STRATEGIES = ['nige', 'senko', 'sashi', 'oikomi'] as const;

/** ★個性が付く馬と付かない馬が混ざる馬群（★道悪適性・気性・根性・賢さを散らす） */
const field = (size: number) => Array.from({ length: size }, (_, i) => neutralEntrant(`H${i + 1}`, {
  gate: i + 1,
  strategy: STRATEGIES[i % STRATEGIES.length]!,
  stats: { sp: 430 + ((i * 41) % 150), st: 430 + ((i * 59) % 150), pw: 430 + ((i * 73) % 150), gt: 300 + ((i * 83) % 700), iq: 300 + ((i * 97) % 700) },
  heavyAptitude: 20 + ((i * 17) % 80),
  condition: 1 + (i % 5),
}));

/**
 * ★馬場は 4 段（`good` / `yielding` / `soft` / `bad`・§5.2）。
 * ★ここでは ★**良と不良**を取ります — ★道悪適性（＝泥巧者の入力）が ★**いちばん強く効くのが不良**だからです。
 */
const conditions = (distance: number, trackCondition: 'good' | 'bad'): RaceConditions => ({
  raceId: 'trait', distance, surface: 'turf', trackCondition, baseWeightKg: 55, courseShape: 'oval',
});

/** ★数は `toString()` で文字にして比べる（★1 ビットの違いも拾う） */
const bits = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : `n:${x.toString()}`) : x));

describe('★先天個性・後天特性は着順に効かない（D-109 ① の対照）', () => {
  it('★★個性を導いた前後で、着順・スコア・走破タイムが 1 ビットも変わらない', () => {
    let sawInnate = false;
    let sawLearned = false;
    for (const heads of [8, 18]) {
      for (const distance of [1200, 2400]) {
        for (const track of ['good', 'bad'] as const) {
          const entrants = field(heads);
          for (let s = 0; s < 6; s += 1) {
            const seed = 9091 + s * 7919;
            const base = resolveRace({ conditions: conditions(distance, track), entrants, seed, balance: DEFAULT_RACE_BALANCE });
            /**
             * ★1 頭ずつ個性を導き、★**その結果を持ったまま**同じレースを判定する。
             * ⚠️ ★`RaceEntrant` は個性を受け取りません（★型の上でも着順に入らない）。
             *    ★この検査は「受け取る口を足した日に、ここが落ちる」ための錨です。
             */
            for (const [i, e] of entrants.entries()) {
              const innate = innateTraitsOf({
                heavyAptitude: e.heavyAptitude, temper: (i * 13) % 100,
                gt: e.stats.gt, iq: e.stats.iq,
              });
              const career = careerInputOf(Array.from({ length: i % 7 }, (_, k) => ({
                distanceM: 1200 + k * 400, graded: k % 2 === 0, jockeyId: `j-${k % 2}`,
              })));
              const learned = learnedTraitsOf(career);
              if (innate.length > 0) sawInnate = true;
              if (learned.length > 0) sawLearned = true;
              for (const t of traitsOf(
                { heavyAptitude: e.heavyAptitude, temper: (i * 13) % 100, gt: e.stats.gt, iq: e.stats.iq },
                career,
              )) expect(traitEffectOf(t)).toBe(0);
            }
            const again = resolveRace({ conditions: conditions(distance, track), entrants, seed, balance: DEFAULT_RACE_BALANCE });
            expect(bits(again), `${heads}頭 ${distance}m ${track} シード${seed}`).toBe(bits(base));
          }
        }
      }
    }
    /** ★個性が 1 つも立っていないなら、この検査は何も守っていない（★R-3 の精神） */
    expect(sawInnate, '★先天個性が一度も立っていない').toBe(true);
    expect(sawLearned, '★後天特性が一度も立っていない').toBe(true);
  });

  it('★★出走馬の型に個性を入れる口が無い（★足した日にここが落ちる）', () => {
    const e = neutralEntrant('H1');
    const keys = Object.keys(e).sort();
    expect(keys).toEqual([
      'age', 'condition', 'distanceCenter', 'distanceRange', 'fatigue', 'gate',
      'heavyAptitude', 'horseId', 'skillGenes', 'stats', 'strategy', 'strategyAptitude',
      'surfaceAptitude', 'weightKg',
    ]);
  });

  it('★★効果はどの特性でも 0（★7 つぶん）', () => {
    expect(TRAIT_EFFECT).toBe(0);
    expect([...INNATE_TRAITS, ...LEARNED_TRAITS].map(traitEffectOf)).toEqual(new Array(7).fill(0));
  });
});
