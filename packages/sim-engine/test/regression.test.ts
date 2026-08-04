/**
 * 平均回帰と形質別の変異上書き — 正典 §6.4（D-008）/ §5.2（P0-fix F-3）
 *
 * 平均回帰は正典 §13.3 が明記する「血統インフレの唯一の実効的な抑制機構」なので、
 * 既定で有効であること自体をテストで固定する（うっかり 0 に戻す変更を検知するため）。
 */

import { describe, expect, it } from 'vitest';
import { BALANCE, DEFAULT_BALANCE } from '../src/balance.js';
import { breed } from '../src/breeding.js';
import { resolveMutation } from '../src/genetics.js';
import type { NicksTable } from '../src/nicks.js';
import { Herd } from './helpers.js';

const NO_NICKS: NicksTable = new Map();

describe('正典 §13.1 の定数（D-008 反映）', () => {
  it('平均回帰が既定で有効になっている', () => {
    expect(BALANCE.REGRESSION_RATE).toBe(0.2);
    expect(DEFAULT_BALANCE.REGRESSION_RATE).toBe(0.2);
  });

  it('回帰で削られる分散を補償する MUTATION_SD になっている', () => {
    expect(BALANCE.MUTATION_SD).toBe(90);
    expect(DEFAULT_BALANCE.genetics.MUTATION_SD).toBe(90);
  });

  it('回帰先は値域の45%（0〜1000形質なら450）', () => {
    expect(DEFAULT_BALANCE.REGRESSION_CENTER_RATIO).toBe(0.45);
  });

  it('素質発現は2アレルの相加平均（0.5超は系統的な上げ要因になる）', () => {
    expect(DEFAULT_BALANCE.DOMINANT_WEIGHT).toBe(0.5);
  });
});

describe('平均回帰の挙動（正典 §6.4）', () => {
  it('品種中心より上のアレルは下へ、下のアレルは上へ引かれる', () => {
    // 変異ノイズを止めて回帰項だけを見る
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 0,
      },
    };
    const herd = new Herd();

    // 両親とも 900（品種中心 450 より上）→ 子は 900 - (900-450)*0.2 = 810
    const highSire = herd.add('HS', 'male', null, null, { ability: 900, birthYear: 0 });
    const highDam = herd.add('HD', 'female', null, null, { ability: 900, birthYear: 0 });
    const highFoal = breed({
      id: 'HF',
      sire: highSire,
      dam: highDam,
      seed: 1,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(highFoal.genotype.sp.a1).toBe(810);
    expect(highFoal.genotype.sp.a2).toBe(810);

    // 両親とも 200（品種中心より下）→ 子は 200 + (450-200)*0.2 = 250
    const lowSire = herd.add('LS', 'male', null, null, { ability: 200, birthYear: 0 });
    const lowDam = herd.add('LD', 'female', null, null, { ability: 200, birthYear: 0 });
    const lowFoal = breed({
      id: 'LF',
      sire: lowSire,
      dam: lowDam,
      seed: 1,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(lowFoal.genotype.sp.a1).toBe(250);
    expect(lowFoal.genotype.sp.a2).toBe(250);
  });

  it('品種中心ちょうどのアレルは動かない（平衡点）', () => {
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 0,
      },
    };
    const herd = new Herd();
    const sire = herd.add('S', 'male', null, null, { ability: 450, birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { ability: 450, birthYear: 0 });
    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 5,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(foal.genotype.sp.a1).toBe(450);
    expect(foal.potential.sp).toBe(450);
  });
});

describe('形質別の変異上書き（正典 §5.2 の警告・P0-fix F-3）', () => {
  it('能力5種は値域比スケールのまま（0〜1000 なので係数1）', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'sp');
    expect(m.sd).toBe(DEFAULT_BALANCE.genetics.MUTATION_SD);
    expect(m.clamp).toBe(DEFAULT_BALANCE.MUTATION_CLAMP);
    expect(m.regressionRate).toBe(DEFAULT_BALANCE.REGRESSION_RATE);
  });

  it('0〜100 の形質は値域比で 1/10 に縮尺される', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'surface.turf');
    expect(m.sd).toBeCloseTo(DEFAULT_BALANCE.genetics.MUTATION_SD / 10, 10);
    expect(m.clamp).toBeCloseTo(DEFAULT_BALANCE.MUTATION_CLAMP / 10, 10);
  });

  it('距離系は値域比ではなく絶対値の上書きが効く', () => {
    const center = resolveMutation(DEFAULT_BALANCE, 'distance_center');
    const override = DEFAULT_BALANCE.traitMutation['distance_center'];
    expect(override).toBeDefined();
    expect(center.sd).toBe(override?.sd);
    // 値域比スケール（2.6倍）が適用されていないこと = 拡散の原因を断てている
    expect(center.sd).toBeLessThan(DEFAULT_BALANCE.genetics.MUTATION_SD * 2.6);
    expect(center.regressionRate).toBe(override?.regressionRate);
  });

  it('距離系の大突然変異SDは通常変異との比（180/90）を保つ', () => {
    const center = resolveMutation(DEFAULT_BALANCE, 'distance_center');
    const ratio = DEFAULT_BALANCE.genetics.BIG_MUTATION_SD / DEFAULT_BALANCE.genetics.MUTATION_SD;
    expect(center.bigSd).toBeCloseTo(center.sd * ratio, 10);
  });
});
