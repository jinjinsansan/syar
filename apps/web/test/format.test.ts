/**
 * §12.7 ポイントの見せ方。★憲法 §0.2 が UI に課す制約を測る。
 */
import { describe, expect, it } from 'vitest';
import * as fmt from '../src/lib/format.js';
import { formatEntryPoints, formatOdds, formatPrizePoints, formatRaceTitle } from '../src/lib/format.js';

describe('★§12.7 憲法 §0.2 が UI に課すもの', () => {
  it('★EP と PP を合算する関数が存在しない（総資産的な表示を作らない）', () => {
    // 作れてしまうと、いつか使われます。**関数が無いこと**が担保です。
    for (const n of Object.keys(fmt).map((k) => k.toLowerCase())) {
      expect(n, `合算を思わせる名前: ${n}`).not.toMatch(/total|sum|balance|asset/);
    }
  });

  it('★EP の表示に「購入」を想起させる語が無い', () => {
    const s = formatEntryPoints(12345);
    expect(s).toBe('12,345 EP');
    expect(s).not.toMatch(/購入|チャージ|課金|円/);
  });

  it('★PP の表示に「換金」を想起させる語が無い', () => {
    const s = formatPrizePoints(9876);
    expect(s).toBe('9,876 PP');
    expect(s).not.toMatch(/換金|現金|円|価値/);
  });
});

describe('§9.4 / §12 表示', () => {
  it('★上限に達したオッズは明示する（§9.4）', () => {
    expect(formatOdds(500, true)).toBe('500.0（上限）');
    expect(formatOdds(3.2, false)).toBe('3.2');
  });

  it('★クラスは「格」で見せる（D-020・§12.3）', () => {
    expect(formatRaceTitle(1, null)).toBe('新馬・未勝利');
    expect(formatRaceTitle(6, 'G1')).toBe('G1');
    expect(formatRaceTitle(5, null)).toBe('オープン');
  });
});
