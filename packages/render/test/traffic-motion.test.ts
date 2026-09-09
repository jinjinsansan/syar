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
    for (let d = 0; d < warp.displaySec - 0.01; d += 0.1) {
      const rate = (warp.raceSecAt(d + 0.01) - warp.raceSecAt(d)) / 0.01;
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(2.001);
    }
    expect(warp.raceSecAt(warp.displaySec)).toBeCloseTo(105, 8);
  });
});
