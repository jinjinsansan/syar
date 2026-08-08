/**
 * §9 馬券の精算。★PP の発行に直結するので、間違った払戻をしないことを測る。
 *
 * DB を使わず、`settle`（純関数）に渡る値の変換だけを確かめます。
 * SQL 側は tools/verify-economy.mjs が実 DB で確かめています。
 */
import { describe, expect, it } from 'vitest';
import { ep, hitMultiplicity, settle, type RaceOutcome } from '@star/betting';

/** payout.ts が組む outcome と同じ形（着順 → 馬番の配列） */
const outcomeOf = (finished: { gate: number; finishPosition: number }[]): RaceOutcome => ({
  order: [...finished].sort((a, b) => a.finishPosition - b.finishPosition).map((f) => f.gate),
  fieldSize: finished.length,
});

describe('★§9 精算に渡す着順の組み立て', () => {
  it('★finish_pos の順に並べ替える（DB の取得順に依存しない）', () => {
    // DB から順不同で返っても、着順どおりに並ばなければ的中判定が壊れる
    const shuffled = [
      { gate: 7, finishPosition: 3 },
      { gate: 2, finishPosition: 1 },
      { gate: 5, finishPosition: 2 },
    ];
    expect(outcomeOf(shuffled).order).toEqual([2, 5, 7]);
  });

  it('★並べ替えを忘れると的中判定が変わる（この検査の存在意義）', () => {
    const finished = [
      { gate: 7, finishPosition: 3 },
      { gate: 2, finishPosition: 1 },
      { gate: 5, finishPosition: 2 },
    ];
    const correct = outcomeOf(finished);
    const wrong: RaceOutcome = { order: finished.map((f) => f.gate), fieldSize: 3 };
    expect(hitMultiplicity({ kind: 'win', horses: [2] }, correct)).toBe(1);
    expect(hitMultiplicity({ kind: 'win', horses: [2] }, wrong)).toBe(0);
  });

  it('fieldSize が複勝圏に効く（§9.1: 7頭以下は2着まで）', () => {
    const seven = outcomeOf(Array.from({ length: 7 }, (_, i) => ({ gate: i + 1, finishPosition: i + 1 })));
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, seven)).toBe(0);
    const eight = outcomeOf(Array.from({ length: 8 }, (_, i) => ({ gate: i + 1, finishPosition: i + 1 })));
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, eight)).toBe(1);
  });
});

describe('★§9 払戻額', () => {
  const o = outcomeOf([
    { gate: 3, finishPosition: 1 },
    { gate: 1, finishPosition: 2 },
    { gate: 9, finishPosition: 3 },
  ]);

  it('的中は購入時オッズで払う', () => {
    const s = settle({ selection: { kind: 'win', horses: [3] }, stake: ep(1000), oddsAtPurchase: 4.2 }, o);
    expect(s.hit).toBe(true);
    expect(s.payout).toBe(4200);
  });

  it('★外れは 0 で、返還も発生しない（取消とは別）', () => {
    const s = settle({ selection: { kind: 'win', horses: [1] }, stake: ep(1000), oddsAtPurchase: 4.2 }, o);
    expect(s.payout).toBe(0);
    expect(s.refund).toBe(0);
    expect(s.refunded).toBe(false);
  });

  it('★払戻は購入額×オッズを超えない（丸めで PP を過大発行しない）', () => {
    for (const odds of [1.1, 3.33, 7.77, 99.99]) {
      const s = settle({ selection: { kind: 'win', horses: [3] }, stake: ep(700), oddsAtPurchase: odds }, o);
      expect(s.payout).toBeLessThanOrEqual(700 * odds);
    }
  });
});
