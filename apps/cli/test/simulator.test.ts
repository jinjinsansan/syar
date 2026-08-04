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

  it('V-2a は最終20世代の傾きを %/世代 で測る', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v2a = result.verification.v2a;
    expect(v2a.windowGenerations).toBe(Math.min(20, SMALL.generations));
    expect(v2a.targetAbsMax).toBe(0.5);
    // 判定は絶対値（急落も「平坦」ではないため）
    expect(v2a.pass).toBe(Math.abs(v2a.slopePctPerGeneration) < 0.5);
  });

  it('V-2b は集団平均能力 ÷ アレル上限（1000）', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v2b = result.verification.v2b;
    const last = result.cohorts[result.cohorts.length - 1];
    expect(v2b.alleleMax).toBe(1000);
    expect(v2b.meanAbilityPerKey).toBeCloseTo((last?.meanAbilityTotal ?? 0) / 5, 1);
    expect(v2b.ceilingRatio).toBeCloseTo(v2b.meanAbilityPerKey / 1000, 4);
  });

  it('V-2c は --long-horizon 未指定なら未評価で、総合判定に含めない', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    expect(result.verification.v2c.evaluated).toBe(false);
    expect(result.longHorizon).toBeNull();
  });

  it('V-2c を指定すると長期シミュを別途回して判定に含める', () => {
    const result = runSimulation(
      { ...SMALL, seed: 42, longHorizonGenerations: 24 },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    expect(result.verification.v2c.evaluated).toBe(true);
    expect(result.verification.v2c.generations).toBe(24);
    expect(result.longHorizon).not.toBeNull();
    expect(result.longHorizon?.cohorts).toHaveLength(24);
    // 長期側は入れ子で回さない（再帰は1段だけ）
    expect(result.longHorizon?.longHorizon).toBeNull();
  });

  it('旧基準（+50%）は参考値として残るが判定には使わない', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    expect(result.verification.legacyRatio.ratio).toBeTypeOf('number');
    // legacyRatio に pass フィールドが無いこと自体が「判定に使わない」ことの担保
    expect(result.verification.legacyRatio).not.toHaveProperty('pass');
  });

  it('V-2d は能力5種を除く全形質を自動で監視対象にする', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const keys = result.verification.v2d.traits.map((t) => t.key).sort();
    // NUMERIC_TRAITS から能力5種を除いた6形質。形質を足せば自動で増える
    expect(keys).toEqual(
      [
        'durability',
        'temper',
        'surface.turf',
        'surface.dirt',
        'distance_center',
        'distance_range',
      ].sort(),
    );
    // 能力5種は判定対象外だが参考値として必ず併記する
    expect(result.verification.v2d.abilityReference.map((t) => t.key).sort()).toEqual(
      ['sp', 'st', 'pw', 'gt', 'iq'].sort(),
    );
    expect(result.verification.v2d.targetAbsMax).toBe(0.1);
  });

  it('V-2d の乖離は創始世代との比で測る', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const last = result.cohorts[result.cohorts.length - 1];
    for (const t of result.verification.v2d.traits) {
      expect(t.founderMean).toBe(result.founderCohort.traitMeans[t.key]);
      expect(t.finalMean).toBe(last?.traitMeans[t.key]);
      expect(t.pass).toBe(Math.abs(t.deviation) <= 0.1);
    }
  });

  it('V-2d: 丈夫さが創始水準(650)を保つ（D-009 の回帰テスト）', () => {
    const result = runSimulation(
      { ...SMALL, seed: 42, generations: 24 },
      DEFAULT_BALANCE,
      FOUNDERS,
      NICKS_GEN,
    );
    const durability = result.verification.v2d.traits.find((t) => t.key === 'durability');
    expect(durability).toBeDefined();
    // 回帰中心が値域45%(=450)だった頃はここが -30% 付近まで落ちていた
    expect(Math.abs(durability?.deviation ?? 1)).toBeLessThan(0.1);
    expect(durability?.finalMean ?? 0).toBeGreaterThan(600);
  });

  it('V-2e は distance_center の集団SDを創始比で判定する', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v2e = result.verification.v2e;
    const last = result.cohorts[result.cohorts.length - 1];
    expect(v2e.founderSd).toBe(result.founderCohort.distanceCenter.sd);
    expect(v2e.finalSd).toBe(last?.distanceCenter.sd);
    expect(v2e.target).toEqual([0.8, 1.4]);
    expect(v2e.pass).toBe(v2e.ratio >= 0.8 && v2e.ratio <= 1.4);
  });

  it('総合判定に V-2d と V-2e が含まれている', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v = result.verification;
    const expected =
      v.v1.pass && v.v2a.pass && v.v2b.pass && v.v2d.pass && v.v2e.pass && v.v3.pass;
    expect(v.pass).toBe(expected);
  });

  it('距離適性の分布を毎世代記録している（F-3 の検証材料）', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    for (const cohort of result.cohorts) {
      expect(cohort.distanceCenter.sd).toBeGreaterThan(0);
      expect(cohort.distanceCenter.mean).toBeGreaterThan(1000);
      expect(cohort.distanceCenter.mean).toBeLessThan(3600);
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
