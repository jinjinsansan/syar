/**
 * ★**ゲーム内の「年」を 1 か所から引く**（★2026-09-20・裁定 Q-3）。
 *
 * 🔴 ★`birth_year` と `bred_this_year` が別々に「年」を計算していると、
 *   ★片方を直した日にもう片方が黙って古びます（★**D-052**）。
 */
import { describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR, gameYearOf, isGameYearStart } from '../src/birth-week.js';

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
