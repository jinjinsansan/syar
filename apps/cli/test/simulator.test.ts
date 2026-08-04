/**
 * シミュレータの決定論テスト — 指示書 §3.5-1
 *   「同一シード → 同一のシミュ結果（全出力バイト一致）」
 */

import { DEFAULT_BALANCE, FOUNDERS, NICKS_GEN } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/simulator.js';

const SMALL = { generations: 12, population: 40, stallionPool: 16, v1Pairs: 2, v1Repeats: 20 };

describe('シミュレータの決定論（指示書 §3.5-1）', () => {
  it('同一シードなら出力が完全に一致する（JSON バイト一致）', () => {
    const a = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const b = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('シードが違えば結果が変わる', () => {
    const a = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const b = runSimulation({ ...SMALL, seed: 43 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('祖先レコードの破棄（prune）は結果を変えない', () => {
    // prune は到達不能な祖先を捨てるだけの最適化。結果に影響してはいけない。
    const pruned = runSimulation(
      { ...SMALL, seed: 42, prune: true },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    const kept = runSimulation(
      { ...SMALL, seed: 42, prune: false },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    expect(JSON.stringify({ ...pruned, options: null })).toBe(
      JSON.stringify({ ...kept, options: null }),
    );
  });

  it('生産上限が世代ループ全体で守られている', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    for (const cohort of result.cohorts) {
      // 1年に生まれる産駒は繁殖牝馬プールの頭数を超えない（年1産）
      expect(cohort.foals).toBeLessThanOrEqual(cohort.marePool);
      // 種付け候補 × 年間上限 で賄えている
      expect(cohort.foals).toBeLessThanOrEqual(
        cohort.sireCandidates * DEFAULT_BALANCE.STALLION_BASE_COVERINGS,
      );
    }
  });

  it('V-3（発生率）は短いシミュでも設定値付近に収まる', () => {
    const result = runSimulation(
      { generations: 30, population: 120, stallionPool: 40, seed: 42, v1Pairs: 1, v1Repeats: 20 },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    expect(result.verification.v3.atavism.rolls).toBeGreaterThan(1000);
    expect(result.verification.v3.pass).toBe(true);
  });
});
