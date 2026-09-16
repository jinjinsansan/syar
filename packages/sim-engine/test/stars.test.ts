/**
 * ★**素質を★で見せる**（★GB-4・2026-09-16・正典 §5.5・§12.4・D-102 ⑥）
 *
 * 【★見ている壊れ方】
 *   ① ★★の算出が 2 か所に増え、★**購入の候補の帯（D-102 ③）と画面の★がずれる**
 *   ② ★★から素質の数値が復元できる（★段が細かすぎる・素質そのものを返す）
 *   ③ ★★が 1〜5 の外に出る
 */
import { describe, it, expect } from 'vitest';
import { starsOfPotential, starsOf, sameStarBand, STAR_MIN, STAR_MAX, STAR_STEP, STAR_THRESHOLDS } from '../src/index.js';

const pot = (mean: number) => ({ sp: mean, st: mean, pw: mean, gt: mean, iq: mean });

describe('★素質の★表示（GB-4）', () => {
  it('① ★1〜5 の範囲に収まり、0.5 刻み', () => {
    for (const mean of [0, 100, 300, 420, 500, 650, 800, 900, 1000]) {
      const s = starsOfPotential(pot(mean));
      expect(s, `平均 ${mean}`).toBeGreaterThanOrEqual(STAR_MIN);
      expect(s, `平均 ${mean}`).toBeLessThanOrEqual(STAR_MAX);
      expect(Math.round(s / STAR_STEP) * STAR_STEP, `平均 ${mean} の刻み`).toBeCloseTo(s, 10);
    }
  });

  it('② ★境目の両側で 1 段だけ動く（R-2）', () => {
    for (const t of STAR_THRESHOLDS) {
      const below = starsOfPotential(pot(t - 1));
      const at = starsOfPotential(pot(t));
      expect(at - below, `境目 ${t}`).toBeCloseTo(STAR_STEP, 10);
    }
  });

  it('③ ★単調（素質が高いほど★が下がらない）', () => {
    let prev = 0;
    for (let mean = 0; mean <= 1000; mean += 10) {
      const s = starsOfPotential(pot(mean));
      expect(s, `平均 ${mean}`).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('④ ★同じ★なら中身が違っても同じ帯（★D-102 ③ の「★表示が同じ帯」）', () => {
    /** ★平均は同じだが配分が違う 2 頭 */
    const a = { potential: { sp: 700, st: 500, pw: 600, gt: 600, iq: 600 } };
    const b = { potential: { sp: 600, st: 600, pw: 600, gt: 600, iq: 600 } };
    expect(starsOf(a)).toBe(starsOf(b));
    expect(sameStarBand(a, b)).toBe(true);
    /** ★帯が違えば false */
    const c = { potential: pot(900) };
    expect(sameStarBand(a, c)).toBe(false);
  });

  it('⑤ ★素質の数値を返さない（★返るのは★だけ・§5.5）', () => {
    const s = starsOf({ potential: pot(613) });
    expect(typeof s).toBe('number');
    /** ★★は 9 段しかないので、★1 つの値から素質（0〜1000）は復元できない */
    const distinct = new Set<number>();
    for (let mean = 0; mean <= 1000; mean += 1) distinct.add(starsOfPotential(pot(mean)));
    expect(distinct.size).toBeLessThanOrEqual(STAR_THRESHOLDS.length + 1);
    expect(distinct.size).toBeGreaterThan(1);
  });
});
