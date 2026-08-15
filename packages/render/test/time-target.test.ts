/**
 * ★距離ごとの時間配分（`RACE_PRESENTATION_BASICS.md` §4）
 *
 * 【★この検査が守るもの】
 *   ① ★**どの距離でも、目標の表示時間に収まる**（長距離が 80秒になっていた）
 *   ② ★**勝負所と直線の表示時間は、距離によらず一定**
 *      （★C-6 が成立する場所なので、長距離で縮めない）
 *   ③ ★**短距離は短い**（オーナー指示）
 *   ④ 道中の送りには上限がある（速すぎると何が起きたか読めない）
 */
import { describe, it, expect } from 'vitest';
import {
  timeWarpFor, ratesForTarget, targetDisplaySec,
  FIXED_SPURT_RATE, FIXED_STRAIGHT_RATE, type PhaseKnots,
} from '../src/index.js';

/** 距離 → だいたいの走破タイム（実測に近い値）で knots を作る */
function knotsOf(distanceMeter: number): PhaseKnots {
  const finish = distanceMeter / 15.6;             // 実測 1600m ≒ 103s に合わせる
  const perM = finish / distanceMeter;
  return {
    startSec: 0,
    spurtSec: (distanceMeter - 800) * perM,
    straightSec: (distanceMeter - 400) * perM,
    finishSec: finish,
  };
}
const displayOf = (d: number): number => {
  const k = knotsOf(d);
  return timeWarpFor(k, ratesForTarget(k, targetDisplaySec(d))).displaySec;
};

describe('★距離ごとの時間配分', () => {
  it('★★どの距離でも、目標の表示時間にほぼ収まる', () => {
    for (const d of [1200, 1400, 1600, 2000, 2400, 3000, 3600]) {
      const target = targetDisplaySec(d);
      const got = displayOf(d);
      expect(Math.abs(got - target)).toBeLessThan(1.5);
    }
  });

  it('★★短距離ほど短い（オーナー指示「短距離は短くてもいい」）', () => {
    const seq = [1200, 1600, 2000, 2400, 3000].map(displayOf);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThanOrEqual(seq[i - 1]! - 1e-6);
    expect(seq[0]!).toBeLessThan(40);
  });

  it('★★勝負所と直線の表示時間は、距離によらずほぼ一定（C-6 の場所）', () => {
    const tails = [1200, 1600, 2400, 3000].map((d) => {
      const k = knotsOf(d);
      const w = timeWarpFor(k, ratesForTarget(k, targetDisplaySec(d)));
      // 勝負所に入ってから終わりまでの**表示**時間
      return w.displaySec - w.displaySecAt(k.spurtSec);
    });
    const min = Math.min(...tails), max = Math.max(...tails);
    expect(max - min).toBeLessThan(1.0);
    // ★約23秒（§4 の設計値）
    expect(min).toBeGreaterThan(20);
    expect(max).toBeLessThan(26);
  });

  it('★★固定の配分だと長距離が長すぎた（対照）', () => {
    const k = knotsOf(3000);
    const fixed = timeWarpFor(k, { cruise: 2.7, spurt: 2.25, straight: 1.8 }).displaySec;
    expect(fixed).toBeGreaterThan(70);            // ★実測 80.5s の状態
    expect(displayOf(3000)).toBeLessThan(55);     // ★直った
  });

  it('★勝負所と直線の送りは固定値そのもの', () => {
    for (const d of [1200, 2000, 3000]) {
      const r = ratesForTarget(knotsOf(d), targetDisplaySec(d));
      expect(r.spurt).toBe(FIXED_SPURT_RATE);
      expect(r.straight).toBe(FIXED_STRAIGHT_RATE);
    }
  });

  it('★道中の送りには上限がある（速すぎると読めない）', () => {
    // ★目標がどれだけ短くても、道中は 8倍速までしか上げない
    const r = ratesForTarget(knotsOf(3000), 1);
    expect(r.cruise).toBeLessThanOrEqual(8);
    expect(r.cruise).toBeGreaterThanOrEqual(1);
  });

  it('★目標が「勝負所＋直線」より短くても、映像は作れる（止まらない）', () => {
    const k = knotsOf(2400);
    const w = timeWarpFor(k, ratesForTarget(k, 5));
    expect(Number.isFinite(w.displaySec)).toBe(true);
    expect(w.displaySec).toBeGreaterThan(0);
    // ★溢れたぶんは表示時間が延びる（勝負所を消さない）
    expect(w.displaySec).toBeGreaterThan(5);
  });

  it('★★目標は単調で、しかも段差がない（似た距離のレースが違う速さで流れない）', () => {
    const xs: number[] = [];
    for (let d = 1000; d <= 3200; d += 50) xs.push(d);
    const t = xs.map(targetDisplaySec);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
      // ★50m 進むごとの変化が 2秒未満（段になっていない）
      expect(t[i]! - t[i - 1]!).toBeLessThan(2);
    }
    expect(targetDisplaySec(1200)).toBeCloseTo(35, 6);
    expect(targetDisplaySec(1600)).toBeCloseTo(45, 6);
  });

  it('★★道中の送りにも段差がない（1400m と 1500m で跳ばない）', () => {
    const cruise = (d: number) => ratesForTarget(knotsOf(d), targetDisplaySec(d)).cruise;
    let prev = cruise(1000);
    for (let d = 1050; d <= 3000; d += 50) {
      const c = cruise(d);
      expect(Math.abs(c - prev)).toBeLessThan(0.35);
      prev = c;
    }
  });
});
