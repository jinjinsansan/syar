/**
 * 遺伝ロールの発生率テスト — 正典 §6.3 / §6.4（V-3 の単体版）
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { breed } from '../src/breeding.js';
import { expressNumeric } from '../src/genetics.js';
import type { NicksTable } from '../src/nicks.js';
import { Herd } from './helpers.js';

const BALANCE = DEFAULT_BALANCE;
const NO_NICKS: NicksTable = new Map();

/** 祖父母まで揃った配合（隔世遺伝・大物覚醒のロールが有効になる） */
function pedigreedPair() {
  const herd = new Herd();
  const opts = { birthYear: 0 };
  const ss = herd.add('SS', 'male', null, null, { ...opts, ability: 700 });
  const sd = herd.add('SD', 'female', null, null, { ...opts, ability: 300 });
  const ds = herd.add('DS', 'male', null, null, { ...opts, ability: 650 });
  const dd = herd.add('DD', 'female', null, null, { ...opts, ability: 350 });
  const sire = herd.add('S', 'male', ss, sd, opts);
  const dam = herd.add('D', 'female', ds, dd, opts);
  return { herd, sire, dam };
}

describe('隔世遺伝・突然変異の発生率（正典 §6.3 / §6.4）', () => {
  it('設定値どおりの発生率になる（±0.5pt・正典 §13.2 V-3）', () => {
    const { herd, sire, dam } = pedigreedPair();
    let atavismHits = 0;
    let atavismRolls = 0;
    let bigAtavismHits = 0;
    let bigAtavismRolls = 0;
    let bigMutationHits = 0;
    let bigMutationRolls = 0;

    const trials = 4000;
    for (let seed = 0; seed < trials; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire,
        dam,
        seed,
        generation: 2,
        birthYear: 10,
        lookup: herd.lookup,
        balance: BALANCE,
        nicks: NO_NICKS,
      });
      const rec = foal.breedingRecord;
      if (rec === null) throw new Error('breedingRecord が無い');
      atavismHits += rec.atavismTraits.length;
      atavismRolls += rec.atavismEligibleRolls;
      bigAtavismHits += rec.bigAtavismTraits.length;
      bigAtavismRolls += rec.bigAtavismEligibleRolls;
      bigMutationHits += rec.bigMutationTraits.length;
      bigMutationRolls += rec.mutationRolls / 2; // 大突然変異は形質単位のロール
    }

    expect(atavismRolls).toBeGreaterThan(0);
    expect(Math.abs(atavismHits / atavismRolls - BALANCE.genetics.ATAVISM_RATE)).toBeLessThan(0.005);
    expect(
      Math.abs(bigAtavismHits / bigAtavismRolls - BALANCE.genetics.BIG_ATAVISM_RATE),
    ).toBeLessThan(0.005);
    expect(
      Math.abs(bigMutationHits / bigMutationRolls - BALANCE.genetics.BIG_MUTATION_RATE),
    ).toBeLessThan(0.005);
  });

  it('祖父母がいない配合では隔世遺伝のロール自体が発生しない', () => {
    const herd = new Herd();
    const sire = herd.add('S', 'male', null, null, { birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { birthYear: 0 });
    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 1,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance: BALANCE,
      nicks: NO_NICKS,
    });
    expect(foal.breedingRecord?.atavismEligibleRolls).toBe(0);
    expect(foal.breedingRecord?.atavismTraits).toEqual([]);
  });

  it('突然変異・隔世遺伝を止めると子のアレルは必ず両親のどちらかの値になる（§6.2 の確認）', () => {
    const balance = {
      ...BALANCE,
      genetics: {
        ...BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 0,
      },
    };
    const herd = new Herd();
    const sire = herd.add('S', 'male', null, null, { ability: 700, birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { ability: 300, birthYear: 0 });

    for (let seed = 0; seed < 100; seed++) {
      const foal = breed({
        id: `F${seed}`,
        sire,
        dam,
        seed,
        generation: 1,
        birthYear: 10,
        lookup: herd.lookup,
        balance,
        nicks: NO_NICKS,
      });
      // 父の2アレルはどちらも 700、母は 300（helpers の makeGenotype）
      expect(foal.genotype.sp.a1).toBe(700);
      expect(foal.genotype.sp.a2).toBe(300);
      // 相加的発現（DOMINANT_WEIGHT = 0.5）なので素質値は 500
      expect(foal.potential.sp).toBe(500);
    }
  });
});

describe('大物覚醒（正典 §6.3）', () => {
  it('5代以内で最も高いアレル値を持つ祖先の値が低い方のアレルに入る', () => {
    // 大物覚醒を必ず発動させ、他のロールは止める。
    // 祖父 SS が 900 を持つので、子の低い方のアレルは 900 になるはず。
    const balance = {
      ...BALANCE,
      genetics: {
        ...BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 1,
      },
    };
    const herd = new Herd();
    const opts = { birthYear: 0 };
    const ss = herd.add('SS', 'male', null, null, { ...opts, ability: 900 });
    const sdm = herd.add('SD', 'female', null, null, { ...opts, ability: 400 });
    const ds = herd.add('DS', 'male', null, null, { ...opts, ability: 400 });
    const dd = herd.add('DD', 'female', null, null, { ...opts, ability: 400 });
    const sire = herd.add('S', 'male', ss, sdm, { ...opts, ability: 400 });
    const dam = herd.add('D', 'female', ds, dd, { ...opts, ability: 400 });

    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 3,
      generation: 2,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(Math.max(foal.genotype.sp.a1, foal.genotype.sp.a2)).toBe(900);
    expect(foal.breedingRecord?.bigAtavismTraits).toContain('sp');
  });
});

describe('アレルの発現（P0 で定義した規則）', () => {
  it('DOMINANT_WEIGHT = 0.5 は2アレルの平均', () => {
    expect(expressNumeric({ a1: 600, a2: 400 }, 0.5)).toBe(500);
  });

  it('DOMINANT_WEIGHT を上げると高い方のアレルに寄る', () => {
    expect(expressNumeric({ a1: 600, a2: 400 }, 1)).toBe(600);
    expect(expressNumeric({ a1: 400, a2: 600 }, 0.75)).toBe(550);
  });
});
