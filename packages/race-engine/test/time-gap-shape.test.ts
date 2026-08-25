/**
 * ★**スコア差 → 着差の写像の形（`TIME_GAP_SHAPE_GAMMA`）**（正典 §8.7 / D-064）
 *
 * 【何を守るか】
 *   ① ★**既定（γ=1.0）は現行の式そのもの**。1 ビットも動かさない
 *   ② ★**着順は γ で変わらない**（写像は r について単調）
 *   ③ ★**レースごとの総差（1着-最下位）は γ で変わらない**（V-17② に触れない）
 *   ④ 着差ラベルは**確定した `timeGap` の隣接差**から出す（画面の差と食い違わせない）
 *
 * ⚠️ ★これは**表示と記録の写像**であって、着順・払戻には触れません。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RACE_BALANCE, resolveRace, type RaceConditions } from '../src/index.js';
import { neutralField } from './helpers.js';

const conditions: RaceConditions = {
  raceId: 'r-gamma', distance: 1600, surface: 'turf',
  trackCondition: 'good', courseShape: 'oval', baseWeightKg: 55,
};
const field = neutralField(12).map((e, i) => ({ ...e, gate: i + 1, weightKg: 54 + (i % 3) }));
const withGamma = (g: number) => ({ ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: g });
const run = (seed: number, gamma: number) =>
  resolveRace({ conditions, entrants: field, seed, balance: withGamma(gamma) });
const SEEDS = [42, 91, 140, 217, 333, 1024];

describe('着差の写像（γ）', () => {
  it('★既定は 1.0（現行の線形）', () => {
    expect(DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA).toBe(1);
  });

  it('★γ=1.0 は現行の式とビット一致する', () => {
    for (const seed of SEEDS) {
      const result = run(seed, 1.0);
      const s1 = result.order[0]!.finalScore;
      for (const row of result.order) {
        /** ★現行の式をここに写して突き合わせる（`===` は -0 と 0 を区別しないので `Object.is`） */
        const expected = s1 > 0
          ? ((s1 - row.finalScore) / s1) * result.baseTimeSec * DEFAULT_RACE_BALANCE.TIME_GAP_FACTOR
          : 0;
        expect(Object.is(row.timeGapSec, expected), `seed ${seed} / ${row.horseId}`).toBe(true);
        expect(Object.is(row.timeSec, result.baseTimeSec + expected)).toBe(true);
      }
    }
  });

  it('★γ を変えても着順は変わらない', () => {
    for (const seed of SEEDS) {
      const base = run(seed, 1.0).order.map((e) => e.horseId);
      for (const g of [1.3, 1.6, 2.2]) {
        expect(run(seed, g).order.map((e) => e.horseId), `seed ${seed} / γ ${g}`).toEqual(base);
      }
    }
  });

  it('★γ を変えても「1着-最下位」の総差は変わらない（V-17② に触れない）', () => {
    for (const seed of SEEDS) {
      const totalOf = (g: number) => {
        const o = run(seed, g).order;
        return o[o.length - 1]!.timeGapSec - o[0]!.timeGapSec;
      };
      const base = totalOf(1.0);
      for (const g of [1.3, 1.6, 2.2]) {
        expect(totalOf(g), `seed ${seed} / γ ${g}`).toBeCloseTo(base, 12);
      }
    }
  });

  it('★γ を上げると上位が締まる（効いていることの確認・R-14）', () => {
    /** ★「変えても何も起きない」なら、上の3つは何も守っていません */
    const gapOf = (g: number) => run(42, g).order[1]!.timeGapSec;
    expect(gapOf(1.3)).toBeLessThan(gapOf(1.0));
    expect(gapOf(1.6)).toBeLessThan(gapOf(1.3));
  });

  it('★着差ラベルは確定した timeGap の隣接差から出ている', () => {
    for (const g of [1.0, 1.6]) {
      const order = run(42, g).order;
      for (let i = 1; i < order.length; i += 1) {
        const diff = order[i]!.timeGapSec - order[i - 1]!.timeGapSec;
        // ★差が 0 でなければラベルも「同着」ではない。写像とラベルが同じ量を見ている
        if (diff > 0.03) expect(order[i]!.marginLabel, `γ ${g} / ${i + 1} 着`).not.toBe('同着');
      }
    }
  });
});
