import { describe, expect, it } from 'vitest';
import { raceGaitPhase, scaledHorseLift } from '../src/race-motion.js';

describe('gate gait continuity', () => {
  it('keeps all twelve horses on the held frame immediately across the start', () => {
    for (let gate = 1; gate <= 12; gate++) {
      expect(raceGaitPhase(0, gate, 7)).toBe(3.5 / 8);
      expect(Math.floor(raceGaitPhase(0.00001, gate, 7) * 16)).toBe(7);
    }
  });
  it('advances without reversing while individual phases separate, for short and long strides', () => {
    for (const stride of [2.5, 3.818, 7, 12]) {
      for (let gate = 1; gate <= 12; gate++) {
        let previous = raceGaitPhase(0, gate, stride);
        for (let i = 1; i <= 2000; i++) {
          const phase = raceGaitPhase(i * stride / 1000, gate, stride);
          const step = (phase - previous + 1) % 1;
          expect(step).toBeGreaterThan(0);
          expect(step).toBeLessThan(0.002);
          previous = phase;
        }
        expect(raceGaitPhase(stride * 2, gate, stride)).toBeCloseTo(raceGaitPhase(stride * 3, gate, stride));
      }
    }
  });
});

describe('flight adjustment', () => {
  it('preserves anchor height while grounding or doubling the flight component', () => {
    expect(scaledHorseLift(150, 120, 0)).toBe(120);
    expect(scaledHorseLift(150, 120)).toBe(150);
    expect(scaledHorseLift(150, 120, 2)).toBe(180);
    expect(scaledHorseLift(120, 120, 2)).toBe(120);
  });
});
