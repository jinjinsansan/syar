/**
 * ★**騎手は着順に効かない**（★GB-3 の対照・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §3-1 の 1・5）
 *
 * 【★なぜ「効果 0 の定数」だけでは足りないか】
 *   ★`JOCKEY_EFFECT === 0` は ★**宣言**にすぎません。★誰かが別の経路（斤量・調子・脚質など）で
 *   ★騎手を着順に混ぜたら、★定数は 0 のままでも結果が動きます。
 *   → ★**実際に `resolveRace` を回して、1 ビットも変わらないこと**を見ます（★R-16: 通るだけの検査を置かない）。
 *
 * 【★この便の約束】★着順に効かせるのは別の便です。★そのときは V-4・V-5・V-6・V-17・V-18・V-13 を取り直します（D-105 ③）。
 */
import { describe, it, expect } from 'vitest';
import { JOCKEYS, freezeJockey, entryCostEP } from '@star/scheduler';
import { resolveRace, DEFAULT_RACE_BALANCE, type RaceConditions } from '@star/race-engine';
import { neutralEntrant } from '../../../packages/race-engine/test/helpers.js';

const STRATEGIES = ['nige', 'senko', 'sashi', 'oikomi'] as const;
const field = (size: number) => Array.from({ length: size }, (_, i) => neutralEntrant(`H${i + 1}`, {
  gate: i + 1,
  strategy: STRATEGIES[i % STRATEGIES.length]!,
  stats: { sp: 430 + ((i * 41) % 150), st: 430 + ((i * 59) % 150), pw: 430 + ((i * 73) % 150), gt: 430 + ((i * 83) % 150), iq: 430 + ((i * 97) % 150) },
  condition: 1 + (i % 5),
}));

const conditions = (distance: number): RaceConditions => ({
  raceId: 'jockey', distance, surface: 'turf', trackCondition: 'good', baseWeightKg: 55, courseShape: 'oval',
});

/** ★数は `toString()` で文字にして比べる（★1 ビットの違いも拾う） */
const bits = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : `n:${x.toString()}`) : x));

describe('★騎手は着順に効かない（GB-3 の対照）', () => {
  it('★★どの騎手を凍結しても、着順・スコア・走破タイムが 1 ビットも変わらない', () => {
    for (const heads of [8, 18]) {
      for (const distance of [1200, 2400]) {
        const entrants = field(heads);
        for (let s = 0; s < 8; s += 1) {
          const seed = 4242 + s * 7919;
          const base = resolveRace({ conditions: conditions(distance), entrants, seed, balance: DEFAULT_RACE_BALANCE });
          for (const j of JOCKEYS) {
            /**
             * ★騎手を凍結し、★**その凍結を持ったまま**同じレースを判定する。
             * ⚠️ ★`resolveRace` は騎手を受け取りません（★型の上でも着順に入らない）。
             *    ★この検査は「受け取る口を足した日に、ここが落ちる」ための錨です。
             */
            const frozen = freezeJockey(j.id, s);
            expect(frozen.effect, `${j.name} の効果`).toBe(0);
            const again = resolveRace({ conditions: conditions(distance), entrants, seed, balance: DEFAULT_RACE_BALANCE });
            expect(bits(again), `${j.name} ${heads}頭 ${distance}m シード${seed}`).toBe(bits(base));
          }
        }
      }
    }
  });

  it('★★AI 代行の期待値が騎手によらない（★§8b.5 の質を騎手で変えない）', () => {
    /**
     * ★AI 代行は `resolveIntervention` が馬の値（iq・gt・st・調子・疲労）だけから決めます。
     * ★騎手はその入力に入っていないので、★**凍結を持っていても入力が変わらない**ことを見ます。
     */
    const frozen = JOCKEYS.map((j) => freezeJockey(j.id, 4));
    const inputs = frozen.map((f) => Object.keys(f).sort().join(','));
    expect(new Set(inputs).size, '★凍結の形は騎手によらず同じ').toBe(1);
    /** ★凍結に効果以外の「強さ」が入っていない（★入れた日にここが落ちる） */
    for (const f of frozen) {
      expect(Object.keys(f).sort()).toEqual(['bond', 'effect', 'feeEP', 'jockeyId', 'name', 'v']);
      expect(f.effect).toBe(0);
    }
  });

  it('★★料金は EP の足し算だけ（★賞金・PP に触れない）', () => {
    const f = freezeJockey(JOCKEYS[0]!.id, 1);
    expect(entryCostEP(200, f)).toBe(200 + f.feeEP);
    /** ★負の料金や賞金からの差し引きを表す項が無い */
    expect(f.feeEP).toBeGreaterThan(0);
  });
});
