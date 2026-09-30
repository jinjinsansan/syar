/**
 * ★**④ 種牡馬の偏り（軽い版）**（★裁定 `REVIEW_GRADED_CALENDAR_50_20260930.md` §12-2 (c)）。
 *   ★G1 が偏りに効く経路は ★種付の上限（20 ＋ G1 × 10）だけ。★その経路が数に届くことを見る。
 */
import { describe, it, expect } from 'vitest';
import { createFounder, deriveRng, DEFAULT_BALANCE, FOUNDERS, stallionCoveringLimit, type HorseId } from '@star/sim-engine';
import { sireConcentrationOf } from '../src/market-price-distribution.js';

const horse = (i: number, sex: 'male' | 'female') => createFounder({
  id: `h${i}` as HorseId, sex, sireLine: `L${i % 12}` as never, birthYear: 0,
  rng: deriveRng(3, i), balance: DEFAULT_BALANCE, founders: FOUNDERS,
});

describe('★④ 種牡馬の偏り', () => {
  const males = Array.from({ length: 50 }, (_, i) => horse(i, 'male'));
  const females = Array.from({ length: 300 }, (_, i) => horse(1000 + i, 'female'));
  const total = (h: (typeof males)[number]) => Object.values(h.potential).reduce((a, b) => a + b, 0);
  const best = [...males].sort((a, b) => total(b) - total(a))[0]!;
  const run = (g1Of: (id: string) => number) => sireConcentrationOf([
    ...males.map((rec) => ({ rec, g1Wins: g1Of(rec.id) })),
    ...females.map((rec) => ({ rec, g1Wins: 0 })),
  ]);

  it('🔴 G1 なしなら 上位 5 頭は 基礎の上限 × 5／素質の一番上が G1 を 3 勝すると 上限の分だけ 増える', () => {
    const base = run(() => 0);
    expect(base.foals, '★分母').toBe(300);
    expect(base.top5Foals).toBe(5 * stallionCoveringLimit({ g1Wins: 0 }, DEFAULT_BALANCE));
    expect(base.g1SireFoals).toBe(0);
    expect(base.bestG1SireRank).toBeNull();
    const withG1 = run((id) => (id === best.id ? 3 : 0));
    expect(withG1.top5Foals - base.top5Foals).toBe(3 * DEFAULT_BALANCE.STALLION_COVERINGS_PER_G1);
    expect(withG1.bestG1SireRank).toBe(1);
    expect(withG1.g1SireFoals).toBe(stallionCoveringLimit({ g1Wins: 3 }, DEFAULT_BALANCE));
  });

  it('★対照: 素質の順で下の方の馬が G1 を勝っても 仔が回らなければ 上位 5 頭は変わらない', () => {
    const worst = [...males].sort((a, b) => total(a) - total(b))[0]!;
    const r = run((id) => (id === worst.id ? 3 : 0));
    expect(r.bestG1SireRank).toBe(50);
    expect(r.top5Foals).toBe(run(() => 0).top5Foals);
  });
});
