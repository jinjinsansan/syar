/**
 * ★**素質の段（帯）**（★GB-4・2026-09-16 → ★**2026-09-18・D-114 で全面改訂**・正典 §5.5・§12.4・D-079）
 *
 * 【★見ている壊れ方】
 *   ① ★段の算出が 2 か所に増え、★**帯の定義が食い違う**（D-114 ①・D-052）
 *   ② ★段から素質の数値が復元できる（★段が細かすぎる・素質そのものを返す）
 *   ③ ★段が 0〜23 の外に出る
 *   ④ 🔴 ★**段が小数になる** — ★24 段では 1 段が目盛 4 ÷ 23 ≒ 0.174 で、
 *      ★**小数の等値で帯を比べると静かに外れます**（★旧 `starsOfPotential` の 0.5 刻みには無かった壊れ方）
 */
import { describe, it, expect } from 'vitest';
import {
  bandOfPotential, bandOf, sameBand, starScaleOfBand,
  STAR_STEPS, STAR_MIN, STAR_MAX, STAR_STEP, STAR_THRESHOLDS, STAR_BAND_FROM, STAR_BAND_WIDTH,
} from '../src/index.js';

const pot = (mean: number) => ({ sp: mean, st: mean, pw: mean, gt: mean, iq: mean });

describe('★素質の段（D-114）', () => {
  it('① ★24 段（★境目は 23 本・D-114 ①）', () => {
    expect(STAR_STEPS, '★段の数').toBe(24);
    expect(STAR_THRESHOLDS.length, '★境目の本数').toBe(STAR_STEPS - 1);
    /** ★境目は下端から一定幅（★`stars.ts` の註記の規則そのもの） */
    expect(STAR_THRESHOLDS[0]).toBe(STAR_BAND_FROM);
    for (let i = 1; i < STAR_THRESHOLDS.length; i += 1) {
      expect(STAR_THRESHOLDS[i]! - STAR_THRESHOLDS[i - 1]!, `境目 ${i}`).toBe(STAR_BAND_WIDTH);
    }
  });

  it('② 🔴 ★段は 0〜23 の整数（★小数を返さない）', () => {
    for (let mean = 0; mean <= 1200; mean += 7) {
      const b = bandOfPotential(pot(mean));
      expect(Number.isInteger(b), `平均 ${mean} で段が整数`).toBe(true);
      expect(b, `平均 ${mean}`).toBeGreaterThanOrEqual(0);
      expect(b, `平均 ${mean}`).toBeLessThanOrEqual(STAR_STEPS - 1);
    }
  });

  it('③ ★境目の両側でちょうど 1 段だけ動く（R-2）', () => {
    for (const t of STAR_THRESHOLDS) {
      expect(bandOfPotential(pot(t)) - bandOfPotential(pot(t - 1)), `境目 ${t}`).toBe(1);
    }
  });

  it('④ ★単調（素質が高いほど段が下がらない）', () => {
    let prev = -1;
    for (let mean = 0; mean <= 1000; mean += 10) {
      const b = bandOfPotential(pot(mean));
      expect(b, `平均 ${mean}`).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('⑤ ★同じ段なら中身が違っても同じ帯（★D-079 ②）', () => {
    /** ★平均は同じだが配分が違う 2 頭 */
    const a = { potential: { sp: 700, st: 500, pw: 600, gt: 600, iq: 600 } };
    const b = { potential: { sp: 600, st: 600, pw: 600, gt: 600, iq: 600 } };
    expect(bandOf(a)).toBe(bandOf(b));
    expect(sameBand(a, b)).toBe(true);
    /** ★帯が違えば false */
    expect(sameBand(a, { potential: pot(900) })).toBe(false);
  });

  it('⑥ ★素質の数値を返さない（★返るのは段だけ）', () => {
    const b = bandOf({ potential: pot(613) });
    expect(typeof b).toBe('number');
    /** ★段は 24 通りしかないので、★段 1 つから素質（0〜1000）は復元できない */
    const distinct = new Set<number>();
    for (let mean = 0; mean <= 1000; mean += 1) distinct.add(bandOfPotential(pot(mean)));
    expect(distinct.size).toBeLessThanOrEqual(STAR_STEPS);
    expect(distinct.size).toBeGreaterThan(1);
  });
});

/**
 * ★**目盛（1.0〜5.0）**。
 * 🔴 ★**T-11 で消える繋ぎ**です（★値付け 1 か所だけが読みます）。
 * ★ここで見ているのは ★**T-10 で価格の水準を動かしていないこと**です（★便の順 §6: T-10 は経済に効かせない）。
 */
describe('★段 → 目盛（T-11 までの繋ぎ）', () => {
  it('① ★目盛は 1.0〜5.0 に収まり、両端がちょうど STAR_MIN / STAR_MAX', () => {
    expect(starScaleOfBand(0)).toBe(STAR_MIN);
    expect(starScaleOfBand(STAR_STEPS - 1)).toBeCloseTo(STAR_MAX, 10);
    for (let b = 0; b < STAR_STEPS; b += 1) {
      const v = starScaleOfBand(b);
      expect(v, `段 ${b}`).toBeGreaterThanOrEqual(STAR_MIN);
      expect(v, `段 ${b}`).toBeLessThanOrEqual(STAR_MAX);
    }
  });

  it('② ★1 段ぶんの幅は STAR_STEP', () => {
    for (let b = 1; b < STAR_STEPS; b += 1) {
      expect(starScaleOfBand(b) - starScaleOfBand(b - 1), `段 ${b}`).toBeCloseTo(STAR_STEP, 10);
    }
  });

  it('🔴 ③ ★段の外を渡したら落ちる（★黙って丸めない）', () => {
    expect(() => starScaleOfBand(-1)).toThrow();
    expect(() => starScaleOfBand(STAR_STEPS)).toThrow();
    /** ★小数の段は「帯を小数で比べている」印なので、★通さない */
    expect(() => starScaleOfBand(3.5)).toThrow();
  });
});
