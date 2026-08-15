/**
 * ★揺らぎの減衰（レビュー側裁定 2026-08-15）
 *
 * 【★この検査が守るもの】
 *   ・**残り距離とともにゼロへ減衰する**（終盤の画面が嘘をつかない）
 *   ・★**境界と着順は動かない**（D-059）
 *   ・★**既定は1か所**（判定と製品で別々に持たない）
 */
import { describe, it, expect } from 'vitest';
import { replayPositionModel, finalOrderOf, DEFAULT_JOSTLE, JOSTLE_FADE_M } from '../src/index.js';

const B = (gate: number, finish: number) => ({
  gate, startSec: 0, spurtSec: finish * 0.5, straightSec: finish * 0.75, finishSec: finish,
  strategy: 'senko' as const,
});
const boundaries = [B(1, 100), B(2, 100.4), B(3, 100.8), B(4, 101.2), B(5, 101.6), B(6, 102)];
const make = (jostle: number) => replayPositionModel({
  distanceMeter: 1600, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
  jostle, jostleSeed: 12345,
});

/** 揺らぎ有り／無しの位置の差 = その時点で入っている揺らぎの量 */
function deviationAt(sec: number): number {
  const on = make(DEFAULT_JOSTLE).at(sec);
  const off = make(0).at(sec);
  let m = 0;
  for (const h of on) {
    const o = off.find((x) => x.gate === h.gate);
    if (o) m = Math.max(m, Math.abs(h.meters - o.meters));
  }
  return m;
}

describe('★揺らぎの減衰', () => {
  it('★既定は1か所から出る', () => {
    expect(DEFAULT_JOSTLE).toBeGreaterThan(0);
    expect(JOSTLE_FADE_M).toBe(800);
  });

  /**
   * ⚠️ ★**その瞬間のずれ**で測ってはいけません。
   *    揺らぎは区間の中で 0 → 山 → 0 と動くので、**区間の途中では増えます**
   *    （実際、t=60 の 2.35 が t=70 で 6.02 になり、単調性の検査が落ちました）。
   * → ★**残り距離の帯ごとに「最大のずれ」**を見ます。
   */
  const maxDeviationIn = (fromLeft: number, toLeft: number): number => {
    let m = 0;
    for (let t = 0; t <= 102; t += 0.25) {
      const off = make(0).at(t);
      const left = 1600 - Math.max(...off.map((h) => h.meters));
      if (left > fromLeft || left <= toLeft) continue;
      m = Math.max(m, deviationAt(t));
    }
    return m;
  };

  it('★★残り距離の帯ごとに、揺らぎが小さくなっていく', () => {
    const a = maxDeviationIn(1600, 1000);
    const b = maxDeviationIn(1000, 500);
    const c = maxDeviationIn(500, 0);
    expect(a).toBeGreaterThan(1);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
    expect(c).toBeLessThan(a * 0.3);
  });

  it('★ゴール時点では揺らぎが完全に消える', () => {
    expect(deviationAt(102)).toBeLessThan(1e-6);
  });

  it('★★着順は揺らぎで動かない（D-059）', () => {
    const order0 = finalOrderOf(make(0));
    for (const j of [0.1, DEFAULT_JOSTLE, 0.5]) {
      expect(finalOrderOf(make(j))).toEqual(order0);
    }
  });

  it('★位置は前へしか進まない（速度が負にならない）', () => {
    const m = make(DEFAULT_JOSTLE);
    let prev = m.at(0).map((h) => h.meters);
    for (let t = 0.5; t <= 102; t += 0.5) {
      const now = m.at(t).map((h) => h.meters);
      now.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i]! - 1e-9));
      prev = now;
    }
  });
});
