/**
 * ★**ゲーム内の「年」を 1 か所から引く**（★2026-09-20・裁定 Q-3）。
 *
 * 🔴 ★`birth_year` と `bred_this_year` が別々に「年」を計算していると、
 *   ★片方を直した日にもう片方が黙って古びます（★**D-052**）。
 */
import { describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR, gameMonthOf, gameYearOf, isGameYearStart } from '../src/birth-week.js';

describe('★ゲーム内の年', () => {
  it('★52 週で 1 年 進む', () => {
    expect(gameYearOf(0)).toBe(0);
    expect(gameYearOf(WEEKS_PER_YEAR - 1)).toBe(0);
    expect(gameYearOf(WEEKS_PER_YEAR)).toBe(1);
    expect(gameYearOf(5 * WEEKS_PER_YEAR + 7)).toBe(5);
  });

  it('★年の変わり目', () => {
    expect(isGameYearStart(0), '★最初の週も変わり目').toBe(true);
    expect(isGameYearStart(WEEKS_PER_YEAR)).toBe(true);
    expect(isGameYearStart(WEEKS_PER_YEAR + 1)).toBe(false);
  });

  /**
   * 🔴 ★**整数でない週を黙って受けない。**
   *   ★`Math.floor` は 51.9 を 0 にします。★呼ぶ側の間違いが、★年のずれになって出ます。
   */
  it('🔴 ★整数でない週は投げる（★黙って切り捨てない）', () => {
    expect(() => gameYearOf(51.9)).toThrow(/整数/);
    expect(() => gameYearOf(Number.NaN)).toThrow(/整数/);
  });

  /**
   * ⚠️ ★**負の週**（★基準より前）も定義しておきます。
   *   ★`Math.floor(-1/52) = -1` で、★「1 年 前」。★切り上げにしません。
   */
  it('★基準より前の週は、★1 つ前の年', () => {
    expect(gameYearOf(-1)).toBe(-1);
    expect(gameYearOf(-WEEKS_PER_YEAR)).toBe(-1);
  });
});

/** ★**ゲーム内の月**（★D-124・★見た目の季節だけに使う） */
describe('★ゲーム内の月（D-124）', () => {
  it('★年の第 1 週 = 1 月・★最後の週 = 12 月', () => {
    expect(gameMonthOf(0)).toBe(1);
    expect(gameMonthOf(WEEKS_PER_YEAR - 1)).toBe(12);
    expect(gameMonthOf(WEEKS_PER_YEAR), '★翌年の第 1 週は また 1 月').toBe(1);
  });

  it('★1 年で 1〜12 を ★欠けず・戻らずに 1 度ずつ通る', () => {
    const months = Array.from({ length: WEEKS_PER_YEAR }, (_, w) => gameMonthOf(3 * WEEKS_PER_YEAR + w));
    expect(new Set(months).size).toBe(12);
    for (let i = 1; i < months.length; i += 1) expect(months[i]!).toBeGreaterThanOrEqual(months[i - 1]!);
    /** ★1 か月は 4〜5 週（★52 ÷ 12） */
    for (let m = 1; m <= 12; m += 1) {
      const n = months.filter((x) => x === m).length;
      expect(n, `★${m} 月が ${n} 週`).toBeGreaterThanOrEqual(4);
      expect(n, `★${m} 月が ${n} 週`).toBeLessThanOrEqual(5);
    }
  });

  it('★基準より前の週も 1〜12 に入る', () => {
    expect(gameMonthOf(-1)).toBe(12);
    expect(gameMonthOf(-WEEKS_PER_YEAR)).toBe(1);
  });

  it('★整数でない週は ★年と同じく投げる', () => {
    expect(() => gameMonthOf(1.5)).toThrow();
  });
});
