import { describe, expect, it } from 'vitest';
import { trafficPositionModel } from '../src/traffic-motion.js';
import type { PositionModel } from '../src/scene.js';
import { buildAuditRace } from '../../../tools/lib/race-audit-build.mjs';
import { readableRaceRates, timeWarpFor } from '../src/time-warp.js';

describe('traffic replay steering', () => {
  const source: PositionModel = {
    raceSec: 20, distanceMeter: 320, straightMeters: 80,
    at: (t) => [
      { gate: 1, meters: Math.max(0, t - 1) * 16, w: 2 + Math.min(1, Math.max(0, t - 1) / 8) * 2, staminaRatio: 1 },
      { gate: 2, meters: Math.max(0, t - 1) * 16.2, w: 4 - Math.min(1, Math.max(0, t - 1) / 8) * 2, staminaRatio: 1 },
    ],
  };
  it('holds the gate, prevents crossing occupied paths, and caps sideways speed', () => {
    const model = trafficPositionModel(source, 20);
    expect(model.at(0.5)).toEqual(source.at(0.5));
    let previous = model.at(1);
    for (let t = 1.05; t < 18; t += 0.05) {
      const current = model.at(t);
      expect(current[1]!.w! - current[0]!.w!).toBeGreaterThanOrEqual(1.299);
      current.forEach((h, i) => {
        expect(Math.abs(h.w! - previous[i]!.w!) / 0.05).toBeLessThanOrEqual(0.65001);
        expect(h.meters).toBe(source.at(t)[i]!.meters);
      });
      previous = current;
    }
  });
  it('is independent of seeking direction and rendering frequency', () => {
    const model = trafficPositionModel(source, 20);
    const at = model.at(10);
    model.at(19); model.at(3); model.at(0);
    expect(model.at(10)).toEqual(at);
    expect(trafficPositionModel(source, 20).at(10)).toEqual(at);
  });
  it('keeps lanes after each finish instead of squeezing stopped horses onto the rail', () => {
    // This real field previously merged gates 1 and 3 after they crossed the line.
    const race = buildAuditRace({ seed: 99 });
    const finish = race.model.at(race.model.raceSec);
    const a = finish.find(h => h.gate === 1)!;
    const b = finish.find(h => h.gate === 3)!;
    expect(Math.abs(a.w! - b.w!)).toBeGreaterThan(1.2);
    for (const boundary of race.boundaries) {
      const w = race.model.at(boundary.finishSec).find(h => h.gate === boundary.gate)!.w!;
      expect(finish.find(h => h.gate === boundary.gate)!.w!).toBeCloseTo(w, 6);
    }
  });
  it('keeps the display clock at or below double speed through the spurt', () => {
    const knots = { startSec: 0, startRealSec: 4, spurtSec: 60, straightSec: 85, goalSec: 85, finishSec: 105 };
    const warp = timeWarpFor(knots, readableRaceRates(knots, 30));
    /**
     * ⚠️ ★**道中は 2 倍を超えます**（★2026-09-12・オーナー指示「1600m で 30 秒」）。
     *    ★上限は局面ごとに分かれました（道中 8 倍 ／ 勝負所・直線 2 倍）。
     *    ★この検定が見るのは名前どおり ★**勝負所から先**です。
     * ⚠️ ★送りは段で切り替わらず ★**なだらかに**変わるので、★道中 8 倍から勝負所 2 倍へ
     *    ★降りきるのに ★**1.04 秒**かかります（★実測・8.81 秒で 4.96 倍 → 9.85 秒で 2 倍以下）。
     *    ★その繋ぎは除いて測ります。★除く幅を広げると検定が緩むので、★実測の値に
     *    ★0.5 秒だけ足した ★**1.6 秒**に固定します。
     */
    const SPURT_BLEND_SEC = 1.6;
    const fromSpurt = warp.displaySecAt(knots.spurtSec) + SPURT_BLEND_SEC;
    for (let d = 0; d < warp.displaySec - 0.01; d += 0.1) {
      const rate = (warp.raceSecAt(d + 0.01) - warp.raceSecAt(d)) / 0.01;
      expect(rate).toBeGreaterThan(0);
      if (d < fromSpurt) continue;
      expect(rate, `勝負所から先の ${d.toFixed(1)} 秒`).toBeLessThanOrEqual(2.001);
    }
    expect(warp.raceSecAt(warp.displaySec)).toBeCloseTo(105, 8);
  });
});
