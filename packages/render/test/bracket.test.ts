/**
 * ★枠番の割り方
 *
 * 【★この検査が守るもの】
 *   ・**8頭以下は1頭ずつ**
 *   ・★**9頭以上は、余りを外枠から**多くする（内枠が薄い）
 *   ・全馬がどこかの枠に入り、**枠は必ず 1〜8**
 */
import { describe, it, expect } from 'vitest';
import { bracketOf, frameRoleOf, FRAME_LABELS } from '../src/index.js';

/** 頭数ぶんの枠割りを並べる */
const spread = (n: number): number[][] => {
  const out: number[][] = Array.from({ length: 8 }, () => []);
  for (let g = 1; g <= n; g++) out[bracketOf(g, n) - 1]!.push(g);
  return out;
};

describe('★枠番', () => {
  it('★8頭以下は 1頭ずつ 1枠から', () => {
    for (let n = 1; n <= 8; n++) {
      for (let g = 1; g <= n; g++) expect(bracketOf(g, n)).toBe(g);
    }
  });

  it('★★12頭立て（業界共通の割り方）', () => {
    expect(spread(12)).toEqual([[1], [2], [3], [4], [5, 6], [7, 8], [9, 10], [11, 12]]);
  });

  it('★★18頭立て — 余りは外枠から', () => {
    expect(spread(18)).toEqual([
      [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14, 15], [16, 17, 18],
    ]);
  });

  it('★9頭立ては 8枠だけが2頭', () => {
    expect(spread(9)).toEqual([[1], [2], [3], [4], [5], [6], [7], [8, 9]]);
  });

  it('★16頭立ては全枠2頭ずつ', () => {
    expect(spread(16)).toEqual([
      [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
    ]);
  });

  it('★どの頭数でも、全馬がちょうど1つの枠に入り、枠は1〜8', () => {
    for (let n = 1; n <= 18; n++) {
      const s = spread(n);
      expect(s.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      for (let g = 1; g <= n; g++) {
        const b = bracketOf(g, n);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(8);
      }
      // ★馬番が増えれば枠番は減らない
      for (let g = 2; g <= n; g++) expect(bracketOf(g, n)).toBeGreaterThanOrEqual(bracketOf(g - 1, n));
    }
  });

  it('★★内枠より外枠のほうが頭数が多い（少なくならない）', () => {
    for (let n = 9; n <= 18; n++) {
      const s = spread(n).map((x) => x.length);
      for (let i = 1; i < 8; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    }
  });

  it('★色は 8色だけ（18頭でも増えない）', () => {
    const roles = new Set(Array.from({ length: 18 }, (_, i) => frameRoleOf(i + 1, 18)));
    expect(roles.size).toBe(8);
    expect(FRAME_LABELS).toHaveLength(8);
  });

  it('★おかしな入力では止まる（黙って通さない）', () => {
    expect(() => bracketOf(0, 12)).toThrow();
    expect(() => bracketOf(13, 12)).toThrow();
    expect(() => bracketOf(1.5, 12)).toThrow();
  });
});
