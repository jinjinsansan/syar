import { describe, expect, it } from 'vitest';
import { buildGroundPhaseTable, type GroundPhaseSample } from '../src/visual-scroll.js';

/**
 * ★芝の板の送りの表（★2026-10-03・3 者会議の結論 A・オーナー「最後の直線で 芝が一瞬遅くなって戻る」）。
 *   ★送り ＝ 刻みごとの「進んだ距離 × その刻みの px/m」の和。★px/m が変わっても 画面の速さは 本当の速さ × px/m に沿う。
 */
const STEP = 0.05;
const mk = (n: number, speed: number, ppm: (i: number) => number, base = 1500): GroundPhaseSample[] =>
  Array.from({ length: n }, (_, i) => ({ displaySec: i * STEP, scrollM: base + i * STEP * speed, pxPerM: ppm(i) }));
const speeds = (s: readonly GroundPhaseSample[]): number[] => {
  const t = buildGroundPhaseTable(s);
  return s.slice(1).map((x, i) => (t.at(x.displaySec) - t.at(s[i]!.displaySec)) / STEP);
};

describe('★芝の板の送りの表', () => {
  it('🔴 ★px/m が 1% ずつ変わっても 画面の速さは 本当の速さ × px/m（★対照: 進行距離 × px/m は 約 1,500 倍で動く）', () => {
    const s = mk(80, 16, (i) => 40 * (1 + 0.01 * Math.sin(i / 5)));
    const v = speeds(s);
    for (let i = 0; i < v.length; i += 1) expect(v[i]!).toBeCloseTo(16 * (s[i]!.pxPerM + s[i + 1]!.pxPerM) / 2, 6);
    const legacy = s.slice(1).map((x, i) => (x.scrollM * x.pxPerM - s[i]!.scrollM * s[i]!.pxPerM) / STEP);
    /** ★対照: ★これまでの送りは 速さの幅が 表の 10 倍超（★逆にも流れる） */
    expect(Math.max(...legacy) - Math.min(...legacy)).toBeGreaterThan(10 * (Math.max(...v) - Math.min(...v)));
    expect(Math.min(...legacy)).toBeLessThan(0);
    expect(Math.max(...v) / Math.min(...v)).toBeLessThan(1.05);
  });

  it('★カメラの切り替わり（★進行距離が 1 刻みで 2m 超 跳ぶ）は 前の刻みの進みで つなぐ', () => {
    const s = mk(40, 16, () => 40).map((x, i) => (i >= 20 ? { ...x, scrollM: x.scrollM + 30 } : x));
    const v = speeds(s);
    expect(Math.max(...v)).toBeCloseTo(16 * 40, 6);
  });

  it('★決定論: 同じ表から同じ値・★範囲の外は 端の値', () => {
    const s = mk(10, 16, () => 40);
    const t = buildGroundPhaseTable(s);
    expect(t.at(0.123)).toBe(buildGroundPhaseTable(s).at(0.123));
    expect(t.at(-5)).toBe(t.at(0));
    expect(t.at(99)).toBe(t.at(s[9]!.displaySec));
  });
});
