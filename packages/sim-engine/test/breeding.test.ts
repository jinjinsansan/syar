/**
 * 配合エンジンのユニットテスト — 指示書 §3.5
 *   1. 決定論（同一シード → 同一の子）
 *   3. potential 上限（いかなる補正の組み合わせでも上限を超えない）
 *   4. 近交弱勢（F > 0.25 で虚弱フラグが約25%）
 *   5. 境界（生涯8産・年間種付上限）
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, TRAIT_BOUNDS } from '../src/balance.js';
import { applyMatingCounters, breed, canMate, stallionCoveringLimit } from '../src/breeding.js';
import { calcInbreedCoefficient } from '../src/inbreeding.js';
import { nicksKey, type NicksTable } from '../src/nicks.js';
import { ABILITY_KEYS, NUMERIC_TRAITS, getAllelePair } from '../src/types.js';
import { Herd } from './helpers.js';

const BALANCE = DEFAULT_BALANCE;
const NO_NICKS: NicksTable = new Map();
const YEAR = 10;

/** 6歳以上（= 繁殖可能年齢）になるよう生年を調整した無関係な1組 */
function unrelatedPair(ability = 500) {
  const herd = new Herd();
  const opts = { ability, birthYear: 0 };
  const sire = herd.add('S', 'male', null, null, opts);
  const dam = herd.add('D', 'female', null, null, opts);
  return { herd, sire, dam };
}

describe('決定論（指示書 §3.5-1）', () => {
  it('同一シード・同一両親なら完全に同じ仔が生まれる', () => {
    const { herd, sire, dam } = unrelatedPair();
    const params = {
      id: 'FOAL',
      sire,
      dam,
      seed: 123456,
      generation: 1,
      birthYear: YEAR,
      lookup: herd.lookup,
      balance: BALANCE,
      nicks: NO_NICKS,
    };
    const a = breed(params);
    const b = breed(params);
    expect(JSON.stringify(b.genotype)).toBe(JSON.stringify(a.genotype));
    expect(b.potential).toEqual(a.potential);
    expect(b.sex).toBe(a.sex);
    expect(b.growth).toBe(a.growth);
    expect(b.unlockRate).toBe(a.unlockRate);
  });

  it('シードが違えば違う仔が生まれる（同一配合でも毎回違う馬・正典 §6.2）', () => {
    const { herd, sire, dam } = unrelatedPair();
    const base = {
      id: 'FOAL',
      sire,
      dam,
      generation: 1,
      birthYear: YEAR,
      lookup: herd.lookup,
      balance: BALANCE,
      nicks: NO_NICKS,
    };
    const a = breed({ ...base, seed: 1 });
    const b = breed({ ...base, seed: 2 });
    expect(JSON.stringify(b.genotype)).not.toBe(JSON.stringify(a.genotype));
  });
});

describe('上限（指示書 §3.5-3）', () => {
  it('全アレル最大・高F・ニックス最大でも potential とアレルが上限を超えない', () => {
    // 全兄妹交配（F = 0.25）で両親のアレルを全形質とも上限値にし、
    // さらにニックス 1.15 を掛けても上限を超えないことを確認する
    const herd = new Herd();
    const a = herd.add('A', 'male', null, null, { ability: 1000, birthYear: 0 });
    const b = herd.add('B', 'female', null, null, { ability: 1000, birthYear: 0 });
    const brother = herd.add('BRO', 'male', a, b, { ability: 1000, birthYear: 0 });
    const sister = herd.add('SIS', 'female', a, b, { ability: 1000, birthYear: 0 });
    for (const h of [a, b, brother, sister]) {
      for (const key of NUMERIC_TRAITS) {
        const bounds = TRAIT_BOUNDS[key];
        const pair = getAllelePair(h.genotype, key);
        pair.a1 = bounds.max;
        pair.a2 = bounds.max;
      }
    }
    const nicks: NicksTable = new Map([[nicksKey(brother.sireLine, sister.sireLine), 1.15]]);

    for (let seed = 0; seed < 200; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire: brother,
        dam: sister,
        seed,
        generation: 2,
        birthYear: YEAR,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks,
      });
      expect(foal.nicksMultiplier).toBe(1.15);
      expect(foal.inbreedCoeff).toBeGreaterThan(0.2);
      for (const key of ABILITY_KEYS) {
        expect(foal.potential[key]).toBeLessThanOrEqual(TRAIT_BOUNDS[key].max);
        expect(foal.stats[key]).toBeLessThanOrEqual(foal.potential[key]);
      }
      for (const key of NUMERIC_TRAITS) {
        const bounds = TRAIT_BOUNDS[key];
        const pair = getAllelePair(foal.genotype, key);
        expect(pair.a1).toBeGreaterThanOrEqual(bounds.min);
        expect(pair.a1).toBeLessThanOrEqual(bounds.max);
        expect(pair.a2).toBeGreaterThanOrEqual(bounds.min);
        expect(pair.a2).toBeLessThanOrEqual(bounds.max);
      }
      expect(foal.temper).toBeLessThanOrEqual(TRAIT_BOUNDS['temper'].max);
      expect(foal.durability).toBeGreaterThanOrEqual(0);
    }
  });

  it('現在値が素質値を超えることは絶対にない（正典 §7.3）', () => {
    const { herd, sire, dam } = unrelatedPair(800);
    for (let seed = 0; seed < 300; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire,
        dam,
        seed,
        generation: 1,
        birthYear: YEAR,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks: NO_NICKS,
      });
      expect(foal.unlockRate).toBeGreaterThanOrEqual(BALANCE.genetics.INITIAL_UNLOCK_MIN);
      expect(foal.unlockRate).toBeLessThanOrEqual(BALANCE.genetics.INITIAL_UNLOCK_MAX);
      for (const key of ABILITY_KEYS) {
        expect(foal.stats[key]).toBeLessThanOrEqual(foal.potential[key]);
      }
    }
  });
});

describe('近交弱勢（指示書 §3.5-4 / 正典 §6.5）', () => {
  it('F > 0.25 のとき虚弱フラグが約25%発生する', () => {
    // C（全兄妹の兄）× E（その C と妹 D の仔）の配合。
    //   共通祖先 C: n1=0, n2=1        → (1/2)^2            = 0.25
    //   共通祖先 A: 父側1代・母側2代  → (1/2)^4            = 0.0625
    //   共通祖先 B: 同上              → (1/2)^4            = 0.0625
    //   F = 0.375 > 0.25（閾値超え）
    const herd = new Herd();
    const a = herd.add('A', 'male', null, null, { birthYear: 0 });
    const b = herd.add('B', 'female', null, null, { birthYear: 0 });
    const c = herd.add('C', 'male', a, b, { birthYear: 0 });
    const d = herd.add('D', 'female', a, b, { birthYear: 0 });
    const e = herd.add('E', 'female', c, d, { birthYear: 0, inbreedCoeff: 0.25 });

    expect(calcInbreedCoefficient(c, e, herd.lookup, 5).F).toBeCloseTo(0.375, 12);

    const trials = 3000;
    let frail = 0;
    for (let seed = 0; seed < trials; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire: c,
        dam: e,
        seed,
        generation: 3,
        birthYear: YEAR,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks: NO_NICKS,
      });
      if (foal.frail) frail++;
    }
    const rate = frail / trials;
    // 二項分布の標準誤差は sqrt(0.25*0.75/3000) ≒ 0.79pt。±3pt なら十分に安全
    expect(rate).toBeGreaterThan(0.22);
    expect(rate).toBeLessThan(0.28);
  });

  it('F <= 0.25 では虚弱フラグは発生しない', () => {
    const herd = new Herd();
    const a = herd.add('A', 'male', null, null, { birthYear: 0 });
    const b = herd.add('B', 'female', null, null, { birthYear: 0 });
    const brother = herd.add('BRO', 'male', a, b, { birthYear: 0 });
    const sister = herd.add('SIS', 'female', a, b, { birthYear: 0 });
    expect(calcInbreedCoefficient(brother, sister, herd.lookup, 5).F).toBeCloseTo(0.25, 12);

    for (let seed = 0; seed < 500; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire: brother,
        dam: sister,
        seed,
        generation: 2,
        birthYear: YEAR,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks: NO_NICKS,
      });
      expect(foal.frail).toBe(false);
    }
  });

  it('インブリードの代償が正典 §6.5 の式どおりに効く', () => {
    const herd = new Herd();
    const a = herd.add('A', 'male', null, null, { birthYear: 0 });
    const b = herd.add('B', 'female', null, null, { birthYear: 0 });
    const brother = herd.add('BRO', 'male', a, b, { birthYear: 0 });
    const sister = herd.add('SIS', 'female', a, b, { birthYear: 0 });

    const foal = breed({
      id: 'F',
      sire: brother,
      dam: sister,
      seed: 99,
      generation: 2,
      birthYear: YEAR,
      lookup: herd.lookup,
      balance: BALANCE,
      nicks: NO_NICKS,
    });
    // injuryRateMult = 1 + F * 2.0
    expect(foal.injuryRateMult).toBeCloseTo(1 + 0.25 * 2.0, 12);
    // 気性は F * 120 ぶん荒くなる方向（両親 temper=50 なので 50 + 30 = 80 付近）
    expect(foal.temper).toBeGreaterThan(60);
  });
});

describe('生産上限（指示書 §3.5-5 / 正典 §6.7）', () => {
  it('繁殖牝馬は生涯8産を超えられない', () => {
    const { sire, dam } = unrelatedPair();
    for (let i = 0; i < BALANCE.MARE_LIFETIME_FOALS; i++) {
      dam.bredThisYear = false;
      sire.coveringsThisYear = 0;
      expect(canMate(sire, dam, BALANCE, YEAR + i).ok).toBe(true);
      applyMatingCounters(sire, dam);
    }
    dam.bredThisYear = false;
    sire.coveringsThisYear = 0;
    expect(dam.foalCount).toBe(8);
    const check = canMate(sire, dam, BALANCE, YEAR + 9);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('dam_lifetime_foals_exceeded');
  });

  it('繁殖牝馬は同一年に2回受胎できない', () => {
    const { sire, dam } = unrelatedPair();
    applyMatingCounters(sire, dam);
    const check = canMate(sire, dam, BALANCE, YEAR);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('dam_already_bred_this_year');
  });

  it('種牡馬の年間種付上限は 20 + G1勝利数 × 10', () => {
    const { herd, sire } = unrelatedPair();
    expect(stallionCoveringLimit(sire, BALANCE)).toBe(20);
    sire.g1Wins = 3;
    expect(stallionCoveringLimit(sire, BALANCE)).toBe(50);

    sire.g1Wins = 0;
    for (let i = 0; i < 20; i++) {
      const mare = herd.add(`M${i}`, 'female', null, null, { birthYear: 0 });
      expect(canMate(sire, mare, BALANCE, YEAR).ok).toBe(true);
      applyMatingCounters(sire, mare);
    }
    const extra = herd.add('M_EXTRA', 'female', null, null, { birthYear: 0 });
    const check = canMate(sire, extra, BALANCE, YEAR);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('sire_coverings_exceeded');
  });

  it('性別・年齢・同一個体のチェック', () => {
    const herd = new Herd();
    const male = herd.add('M', 'male', null, null, { birthYear: 0 });
    const female = herd.add('F', 'female', null, null, { birthYear: 0 });
    const youngFemale = herd.add('YF', 'female', null, null, { birthYear: YEAR - 1 });

    expect(canMate(male, male, BALANCE, YEAR).reason).toBe('same_horse');
    expect(canMate(female, male, BALANCE, YEAR).reason).toBe('sire_not_male');
    expect(canMate(male, male, BALANCE, YEAR).ok).toBe(false);
    expect(canMate(male, youngFemale, BALANCE, YEAR).reason).toBe('dam_too_young');
    expect(canMate(male, female, BALANCE, YEAR).ok).toBe(true);
  });

  it('交配不可の組み合わせで breed() は例外を投げる', () => {
    const { herd, sire, dam } = unrelatedPair();
    dam.bredThisYear = true;
    expect(() =>
      breed({
        id: 'F',
        sire,
        dam,
        seed: 1,
        generation: 1,
        birthYear: YEAR,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks: NO_NICKS,
      }),
    ).toThrow(/交配不可/);
  });
});
