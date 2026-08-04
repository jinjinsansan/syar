/**
 * 乱数と遺伝ロールのテスト
 * 憲法 §1-4: Math.random() / Date.now() を使わず、シード固定で完全再現できること。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, FOUNDERS } from '../src/balance.js';
import { createFounder } from '../src/founders.js';
import { Rng, deriveRng, deriveSeed } from '../src/rng.js';
import { sd as sampleSd } from './stat-helpers.js';

describe('Rng（xoshiro128**）', () => {
  it('同一シードなら同一の列を返す', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      expect(b.nextUint32()).toBe(a.nextUint32());
    }
  });

  it('異なるシードなら異なる列を返す', () => {
    const a = new Rng(42);
    const b = new Rng(43);
    const av = Array.from({ length: 50 }, () => a.nextUint32());
    const bv = Array.from({ length: 50 }, () => b.nextUint32());
    expect(bv).not.toEqual(av);
  });

  it('float() は [0,1) に収まる', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() は両端を含む範囲に収まり、両端も出現する', () => {
    const rng = new Rng(7);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 10000; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      if (v === 3) sawMin = true;
      if (v === 6) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });

  it('bool(p) の頻度が p に一致する', () => {
    const rng = new Rng(99);
    const n = 200000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (rng.bool(0.06)) hits++;
    expect(hits / n).toBeGreaterThan(0.055);
    expect(hits / n).toBeLessThan(0.065);
  });

  it('gaussian() の平均と標準偏差が指定どおり', () => {
    const rng = new Rng(2024);
    const values = Array.from({ length: 100000 }, () => rng.gaussian(450, 110));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(449);
    expect(mean).toBeLessThan(451);
    expect(sampleSd(values)).toBeGreaterThan(108);
    expect(sampleSd(values)).toBeLessThan(112);
  });

  it('deriveSeed は経路が違えば違う種を返し、同じ経路なら同じ種を返す', () => {
    expect(deriveSeed(42, 1, 2)).toBe(deriveSeed(42, 1, 2));
    expect(deriveSeed(42, 1, 2)).not.toBe(deriveSeed(42, 2, 1));
    expect(deriveSeed(42, 1, 2)).not.toBe(deriveSeed(43, 1, 2));
  });

  it('deriveRng は消費順に依存しない（サブストリームの独立性）', () => {
    const first = deriveRng(42, 5, 7).nextUint32();
    const noise = new Rng(1);
    for (let i = 0; i < 1000; i++) noise.nextUint32();
    const second = deriveRng(42, 5, 7).nextUint32();
    expect(second).toBe(first);
  });
});

describe('創始世代の生成（指示書 §3.3）', () => {
  it('全形質が指定された値域に収まる', () => {
    for (let i = 0; i < 300; i++) {
      const horse = createFounder({
        id: `H${i}`,
        sex: i % 2 === 0 ? 'male' : 'female',
        sireLine: 'LINE_A',
        birthYear: 0,
        rng: deriveRng(1, i),
        balance: DEFAULT_BALANCE,
        founders: FOUNDERS,
      });
      for (const key of ['sp', 'st', 'pw', 'gt', 'iq'] as const) {
        for (const allele of [horse.genotype[key].a1, horse.genotype[key].a2]) {
          expect(allele).toBeGreaterThanOrEqual(FOUNDERS.ABILITY_MIN);
          expect(allele).toBeLessThanOrEqual(FOUNDERS.ABILITY_MAX);
        }
      }
      for (const allele of [horse.genotype.temper.a1, horse.genotype.temper.a2]) {
        expect(allele).toBeGreaterThanOrEqual(FOUNDERS.TEMPER_MIN);
        expect(allele).toBeLessThanOrEqual(FOUNDERS.TEMPER_MAX);
      }
      expect(horse.genotype.skill_genes.length).toBeLessThanOrEqual(FOUNDERS.SKILL_GENE_COUNT[1]);
      expect(horse.sireId).toBeNull();
      expect(horse.inbreedCoeff).toBe(0);
      expect(horse.pedigreeCache.size).toBe(0);
    }
  });

  it('創始集団の能力アレルが設定した平均・標準偏差になる', () => {
    const alleles: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const horse = createFounder({
        id: `H${i}`,
        sex: 'male',
        sireLine: 'LINE_A',
        birthYear: 0,
        rng: deriveRng(5, i),
        balance: DEFAULT_BALANCE,
        founders: FOUNDERS,
      });
      alleles.push(horse.genotype.sp.a1, horse.genotype.sp.a2);
    }
    const mean = alleles.reduce((a, b) => a + b, 0) / alleles.length;
    expect(mean).toBeGreaterThan(FOUNDERS.ABILITY_MEAN - 10);
    expect(mean).toBeLessThan(FOUNDERS.ABILITY_MEAN + 10);
    // clamp(100..850) がかかるぶん、実測 SD は設定値よりわずかに小さくなる
    expect(sampleSd(alleles)).toBeGreaterThan(FOUNDERS.ABILITY_SD - 15);
    expect(sampleSd(alleles)).toBeLessThan(FOUNDERS.ABILITY_SD + 5);
  });
});
