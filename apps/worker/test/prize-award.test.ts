/**
 * §11.1 賞金。★PP の主な発行源（§9.3）なので、格の対応を間違えない。
 */
import { PRIZE_TABLE, prizeFor } from '@star/scheduler';
import { describe, expect, it } from 'vitest';
import { tierFromDb } from '../src/prize-award.js';

describe('★§11.1 class_rank と格の対応', () => {
  it('★DB の class_rank（1..6）が正しい格に対応する', () => {
    // ずれると「新馬に G1 の賞金」のような発行が起きる
    expect(tierFromDb(1, null)).toBe('maiden');
    expect(tierFromDb(2, null)).toBe('win1');
    expect(tierFromDb(3, null)).toBe('win2');
    expect(tierFromDb(4, null)).toBe('win3');
    expect(tierFromDb(5, null)).toBe('open');
  });

  it('★重賞は grade が優先される（class_rank 6 でも G1/G2/G3 を見る）', () => {
    expect(tierFromDb(6, 'G1')).toBe('G1');
    expect(tierFromDb(6, 'G2')).toBe('G2');
    expect(tierFromDb(6, 'G3')).toBe('G3');
    // grade が無ければ class_rank 6 は G3 扱い（番組表が壊れている場合の下限）
    expect(tierFromDb(6, null)).toBe('G3');
  });

  it('★未知の class_rank は例外（黙って最低額を配らない）', () => {
    expect(() => tierFromDb(0, null)).toThrow(/class_rank/);
    expect(() => tierFromDb(9, null)).toThrow(/class_rank/);
  });

  it('★対応表の全格が賞金テーブルに存在する（片方だけ増えていない）', () => {
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      const tier = tierFromDb(rank, null);
      expect(PRIZE_TABLE[tier], `class_rank ${rank}`).toBeDefined();
      expect(prizeFor(tier, 1)).toBeGreaterThan(0);
    }
  });

  it('★6着以下に賞金が出ない（配る範囲を広げない）', () => {
    for (const rank of [1, 3, 6]) {
      expect(prizeFor(tierFromDb(rank, null), 6)).toBe(0);
    }
  });
});
