/**
 * K-4 実レース選抜のテスト
 *
 * ★R-1: 単体（`selectionScore`）だけでなく、**本番経路（`runSimulation`）から**
 *   「選抜が実際にレース結果で行われていること」を固定する。
 *   `selection: 'race'` を無視して proxy にフォールバックする改変が素通りしないようにする。
 */

import { NICKS_GEN } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../src/config.js';
import {
  CLASS_PRIZE_TOP_MULT,
  PRIZE_BY_POSITION,
  classPrizeMultiplier,
  emptyCareer,
  selectionScore,
} from '../src/racing-season.js';
import { runSimulation } from '../src/simulator.js';

describe('選抜スコア（K-4）', () => {
  it('出走していない馬はスコア0（走らずに種牡馬になる経路を作らない）', () => {
    for (const m of ['prize', 'winRate', 'composite'] as const) {
      expect(selectionScore(undefined, m), `${m}: undefined`).toBe(0);
      expect(selectionScore(emptyCareer(), m), `${m}: starts=0`).toBe(0);
    }
  });

  it('prize は累計獲得賞金そのもの', () => {
    expect(selectionScore({ starts: 3, wins: 1, top3: 2, prize: 165 }, 'prize')).toBe(165);
  });

  it('winRate は勝率、composite は賞金 × 複勝率', () => {
    const c = { starts: 4, wins: 1, top3: 2, prize: 200 };
    expect(selectionScore(c, 'winRate')).toBeCloseTo(0.25, 10);
    expect(selectionScore(c, 'composite')).toBeCloseTo(200 * 0.5, 10);
  });

  it('賞金表は上位に厚く5着まで（正典 §11 未執筆のプレースホルダ）', () => {
    expect(PRIZE_BY_POSITION).toEqual([100, 40, 25, 15, 10]);
    // 単調減少
    for (let i = 1; i < PRIZE_BY_POSITION.length; i++) {
      expect(PRIZE_BY_POSITION[i]).toBeLessThan(PRIZE_BY_POSITION[i - 1] ?? 0);
    }
  });

  it('クラス係数は最下級1倍〜最上級 CLASS_PRIZE_TOP_MULT 倍で単調増加（R-2 両端）', () => {
    expect(classPrizeMultiplier(0)).toBeCloseTo(1, 10);
    expect(classPrizeMultiplier(1)).toBeCloseTo(CLASS_PRIZE_TOP_MULT, 10);
    expect(classPrizeMultiplier(0.5)).toBeCloseTo(Math.sqrt(CLASS_PRIZE_TOP_MULT), 10);
    // 範囲外はクランプ（負の倍率や発散を作らない）
    expect(classPrizeMultiplier(-1)).toBeCloseTo(1, 10);
    expect(classPrizeMultiplier(2)).toBeCloseTo(CLASS_PRIZE_TOP_MULT, 10);
    // 単調
    let prev = 0;
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const v = classPrizeMultiplier(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('★経路: runSimulation が selection を実際に切り替えている（R-1）', () => {
  const { balance, founders } = resolveRuntimeConfig();
  const base = {
    seed: 42,
    generations: 12,
    population: 120,
    stallionPool: 36,
    v1Pairs: 1,
    v1Repeats: 5,
  };

  it('selection: race と proxy で結果が変わる（race が無視されていない）', () => {
    const proxy = runSimulation({ ...base, selection: 'proxy' }, balance, founders, NICKS_GEN);
    const race = runSimulation({ ...base, selection: 'race' }, balance, founders, NICKS_GEN);
    const proxyFinal = proxy.cohorts[proxy.cohorts.length - 1];
    const raceFinal = race.cohorts[race.cohorts.length - 1];
    expect(proxyFinal).toBeDefined();
    expect(raceFinal).toBeDefined();
    expect(raceFinal?.meanAbilityTotal).not.toBe(proxyFinal?.meanAbilityTotal);
  });

  it('選抜指標を変えると結果が変わる（selectionMetric が無視されていない）', () => {
    const prize = runSimulation(
      { ...base, selection: 'race', selectionMetric: 'prize' },
      balance,
      founders,
      NICKS_GEN,
    );
    const winRate = runSimulation(
      { ...base, selection: 'race', selectionMetric: 'winRate' },
      balance,
      founders,
      NICKS_GEN,
    );
    const a = prize.cohorts[prize.cohorts.length - 1]?.meanAbilityTotal;
    const b = winRate.cohorts[winRate.cohorts.length - 1]?.meanAbilityTotal;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(b).not.toBe(a);
  });

  it('既定は proxy（P0 のベースラインを勝手に変えない）', () => {
    const explicit = runSimulation({ ...base, selection: 'proxy' }, balance, founders, NICKS_GEN);
    const implicit = runSimulation(base, balance, founders, NICKS_GEN);
    expect(implicit.cohorts[implicit.cohorts.length - 1]?.meanAbilityTotal).toBe(
      explicit.cohorts[explicit.cohorts.length - 1]?.meanAbilityTotal,
    );
    expect(implicit.options.selection).toBe('proxy');
  });

  it('同じ seed・同じ選抜方式なら完全に再現する（決定論）', () => {
    const a = runSimulation({ ...base, selection: 'race' }, balance, founders, NICKS_GEN);
    const b = runSimulation({ ...base, selection: 'race' }, balance, founders, NICKS_GEN);
    expect(JSON.stringify(b.cohorts)).toBe(JSON.stringify(a.cohorts));
  });

  it('レース選抜でも能力は世代を追って上がる（選抜が機能している）', () => {
    const r = runSimulation(
      { ...base, generations: 30, selection: 'race' },
      balance,
      founders,
      NICKS_GEN,
    );
    const first = r.cohorts[0]?.meanAbilityTotal ?? 0;
    const last = r.cohorts[r.cohorts.length - 1]?.meanAbilityTotal ?? 0;
    expect(last).toBeGreaterThan(first);
  });
});
