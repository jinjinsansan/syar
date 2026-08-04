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

  /**
   * 【J-2】V-2d の物差し切替（`basis`）を**本番経路**で固定する。
   *
   * I-2b で「創始平均0の形質は創始SD基準へ切替、両方0なら pass:false」と決めたが、
   * それを固定するテストが1本も無かった（I-3 で受け入れた「経路を固定せよ」がそのまま当てはまる）。
   * 3分岐とも `runSimulation()` を通して確認する。
   */
  describe('V-2d の物差し切替（basis・J-2）', () => {
    it('通常の形質は ratio（創始平均比）で判定する', () => {
      const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
      for (const t of result.verification.v2d.traits) {
        expect(t.basis).toBe('ratio');
        // deviation は小数4桁に丸めて出力している
        expect(t.deviation).toBeCloseTo(t.finalMean / t.founderMean - 1, 4);
      }
    });

    it('創始平均が0でSDがある形質は sd（創始SD単位の差）へ切り替わる', () => {
      // 芝/ダート適性の創始分布を [-50, 50] にすると平均0・SD>0 になる
      const founders = { ...FOUNDERS, SURFACE_RANGE: [-50, 50] as const };
      const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, founders, NICKS_GEN);
      const turf = result.verification.v2d.traits.find((t) => t.key === 'surface.turf');
      expect(turf).toBeDefined();
      expect(Math.abs(turf?.founderMean ?? 99)).toBeLessThan(2); // ほぼ0
      expect(turf?.basis).toBe('sd');
      // 創始SDを単位とした差なので有限値であること（比率だとゼロ割で壊れる）
      expect(Number.isFinite(turf?.deviation ?? Number.NaN)).toBe(true);
    });

    it('創始平均もSDも0の形質は判定不能として必ず FAIL する', () => {
      // 芝/ダート適性の創始分布を [0, 0] にすると平均もSDも0（変異幅も0になり凍結する）
      const founders = { ...FOUNDERS, SURFACE_RANGE: [0, 0] as const };
      const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, founders, NICKS_GEN);
      const turf = result.verification.v2d.traits.find((t) => t.key === 'surface.turf');
      expect(turf).toBeDefined();
      expect(turf?.founderMean).toBe(0);
      expect(turf?.basis).toBe('none');
      // ★「乖離0だから PASS」で静かに素通りさせない
      expect(turf?.pass).toBe(false);
      expect(result.verification.v2d.pass).toBe(false);
      expect(result.verification.pass).toBe(false);
    });
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

  it('V-2e は非能力形質すべての集団SDを創始比で判定する（D-012 で一般化）', () => {
    const result = runSimulation({ ...SMALL, seed: 42 }, DEFAULT_BALANCE, FOUNDERS, NICKS_GEN);
    const v2e = result.verification.v2e;
    const last = result.cohorts[result.cohorts.length - 1];

    // 距離だけでなく V-2d と同じ6形質を見る（芝適性の収縮を見逃した反省）
    expect(v2e.traits.map((t) => t.key).sort()).toEqual(
      [
        'durability',
        'temper',
        'surface.turf',
        'surface.dirt',
        'distance_center',
        'distance_range',
      ].sort(),
    );
    expect(v2e.target).toEqual([0.8, 1.4]);
    for (const t of v2e.traits) {
      expect(t.founderSd).toBe(result.founderCohort.traitSds[t.key]);
      expect(t.finalSd).toBe(last?.traitSds[t.key]);
      expect(t.pass).toBe(t.ratio >= 0.8 && t.ratio <= 1.4);
    }
    expect(v2e.pass).toBe(v2e.traits.every((t) => t.pass));
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
