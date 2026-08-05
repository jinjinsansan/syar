/**
 * O-7: クランプの非対称と NaN
 *
 * ★どちらも「実運用では起きない」値だが、**符号が反転しうる式・NaN を通す式を
 *   無防備に置かない**という方針の問題。`randomMult` 側には `Math.max(0,…)` の
 *   防御があるのに係数側に無いのは非対称で、次に読む人が「守られている」と誤解する。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RACE_BALANCE,
  conditionCoef,
  fatigueCoef,
  resolveRace,
  weightCoef,
} from '../src/index.js';
import { neutralEntrant, neutralField } from './helpers.js';

const B = DEFAULT_RACE_BALANCE;

describe('O-7 係数が負にならない（符号反転でスコアの意味が壊れない）', () => {
  it('fatigueCoef は 0 で下げ止まる', () => {
    expect(fatigueCoef(500, B)).toBe(0);
    expect(fatigueCoef(600, B)).toBe(0);
    expect(fatigueCoef(100000, B)).toBe(0);
    // 通常域は従来どおり
    expect(fatigueCoef(0, B)).toBe(1);
    expect(fatigueCoef(250, B)).toBeCloseTo(0.5, 10);
  });

  it('weightCoef は 0 で下げ止まる', () => {
    expect(weightCoef(55 + 125, 55, B)).toBe(0);
    expect(weightCoef(55 + 1000, 55, B)).toBe(0);
    expect(weightCoef(55, 55, B)).toBe(1);
  });

  it('★経路: 極端な疲労の馬がスコア反転で1着にならない', () => {
    const wreck = neutralEntrant('WRECK', { gate: 9, fatigue: 5000 });
    const entrants = [...neutralField(8), wreck];
    const r = resolveRace({ conditions: cond(), entrants, seed: 5, balance: B });
    const row = r.order.find((o) => o.horseId === 'WRECK');
    expect(row?.breakdown.fatigueCoef).toBe(0);
    expect(row?.finalScore).toBe(0);
    // 符号が反転していれば1着になる。最下位であること
    expect(row?.finishPosition).toBe(entrants.length);
  });
});

describe('O-7 NaN が係数を素通りしない', () => {
  it('conditionCoef は NaN を返さない', () => {
    expect(Number.isNaN(conditionCoef(Number.NaN, B))).toBe(false);
  });

  it('★経路: 調子が NaN の馬がいても着順が壊れない', () => {
    const broken = neutralEntrant('BROKEN', { gate: 9, condition: Number.NaN });
    const entrants = [...neutralField(8), broken];
    const r = resolveRace({ conditions: cond(), entrants, seed: 5, balance: B });
    for (const row of r.order) {
      expect(Number.isFinite(row.finalScore), `${row.horseId} の finalScore`).toBe(true);
      expect(Number.isFinite(row.breakdown.score), `${row.horseId} の score`).toBe(true);
    }
    // 着順が降順に並んでいる（NaN が混ざると比較が全て false になり入力順のままになる）
    for (let i = 1; i < r.order.length; i++) {
      expect(r.order[i - 1]?.finalScore).toBeGreaterThanOrEqual(r.order[i]?.finalScore ?? 0);
    }
  });

  it('★経路: 距離適性・斤量が NaN でも着順が壊れない', () => {
    const a = neutralEntrant('NAN_W', { gate: 9, weightKg: Number.NaN });
    const entrants = [...neutralField(6), a];
    const r = resolveRace({ conditions: cond(), entrants, seed: 9, balance: B });
    for (const row of r.order) {
      expect(Number.isFinite(row.finalScore), `${row.horseId}`).toBe(true);
    }
  });
});

function cond() {
  return {
    raceId: 'R-ROBUST-0001',
    distance: 2000,
    surface: 'turf' as const,
    trackCondition: 'good' as const,
    courseShape: 'oval' as const,
    baseWeightKg: 55,
  };
}
