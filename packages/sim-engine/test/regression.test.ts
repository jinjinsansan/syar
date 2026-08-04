/**
 * 平均回帰と形質別の変異上書き — 正典 §6.4（D-008）/ §5.2（P0-fix F-3）
 *
 * 平均回帰は正典 §13.3 が明記する「血統インフレの唯一の実効的な抑制機構」なので、
 * 既定で有効であること自体をテストで固定する（うっかり 0 に戻す変更を検知するため）。
 */

import { describe, expect, it } from 'vitest';
import { BALANCE, DEFAULT_BALANCE, FOUNDERS, buildTraitMutation } from '../src/balance.js';
import { breed } from '../src/breeding.js';
import { resolveMutation } from '../src/genetics.js';
import type { NicksTable } from '../src/nicks.js';
import { NUMERIC_TRAITS } from '../src/types.js';
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

  it('REGRESSION_CENTER_RATIO は役目を終えフォールバック専用（D-009）', () => {
    // 値は残すが、全形質に center が定義されているのでこの経路には落ちない
    expect(DEFAULT_BALANCE.REGRESSION_CENTER_RATIO).toBe(0.45);
    for (const key of NUMERIC_TRAITS) {
      expect(DEFAULT_BALANCE.traitMutation[key]?.center).toBeTypeOf('number');
    }
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

/**
 * 形質別パラメータは**リテラルで固定**する（正典 §6.4 の表・§13.1）。
 *
 * 定数を読んで定数と比べるトートロジーにしてはいけない。平衡は定数に敏感で、
 * 例えば距離の回帰率を 0.01→0.02 にするだけで集団SDが創始の 0.86倍まで縮む。
 */
describe('形質別の変異・回帰パラメータ（正典 §6.4 の表・D-009）', () => {
  it('能力5種: sd 90 / clamp 150 / 回帰 0.20 / 中心 450', () => {
    for (const key of ['sp', 'st', 'pw', 'gt', 'iq'] as const) {
      const m = resolveMutation(DEFAULT_BALANCE, key);
      expect(m.sd).toBe(90);
      expect(m.clamp).toBe(150);
      expect(m.regressionRate).toBe(0.2);
      expect(m.center).toBe(450);
    }
  });

  it('丈夫さ: 値域比スケール / 回帰 0.20 / 中心 650（★値域45%の450ではない）', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'durability');
    expect(m.center).toBe(650);
    expect(m.regressionRate).toBe(0.2);
    expect(m.sd).toBe(90); // 値域 0〜1000 なので係数1
    expect(m.clamp).toBe(150);
  });

  it('気性: 中心 50 / 値域比で 1/10 に縮尺', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'temper');
    expect(m.center).toBe(50);
    expect(m.sd).toBeCloseTo(9, 10);
    expect(m.clamp).toBeCloseTo(15, 10);
  });

  it('芝/ダート適性: 中心 55（★値域45%の45ではない）', () => {
    expect(resolveMutation(DEFAULT_BALANCE, 'surface.turf').center).toBe(55);
    expect(resolveMutation(DEFAULT_BALANCE, 'surface.dirt').center).toBe(55);
  });

  it('distance_center: sd 312 / clamp 520 / 回帰 0.20（共通） / 中心 2100', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'distance_center');
    expect(m.sd).toBe(312);
    expect(m.clamp).toBe(520);
    expect(m.regressionRate).toBe(0.2);
    expect(m.center).toBe(2100);
  });

  it('distance_range: sd 104 / clamp 173 / 回帰 0.20（共通） / 中心 700', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'distance_range');
    expect(m.sd).toBe(104);
    expect(m.clamp).toBe(173);
    expect(m.regressionRate).toBe(0.2);
    expect(m.center).toBe(700);
  });

  it('距離系の sd は回帰率から導出され、両者がずれない', () => {
    // 平衡SD = sd / sqrt(2r - r²) を創始水準に保つため sd は r に従属する。
    // r を変えたら sd も自動で追随すること（定数が別々に固まって壊れるのを防ぐ）
    const alleleSd = (1000 - 400) / Math.sqrt(12); // distance_range の創始アレルSD
    for (const r of [0.05, 0.1, 0.2]) {
      const built = buildTraitMutation(FOUNDERS, r);
      expect(built.distance_range.sd).toBe(Math.round(alleleSd * Math.sqrt(2 * r - r * r)));
    }
    expect(buildTraitMutation(FOUNDERS, 0.2).distance_center.sd).toBe(312);
  });

  it('距離系の大突然変異SDは通常変異との比（180/90 = 2倍）を保つ', () => {
    expect(resolveMutation(DEFAULT_BALANCE, 'distance_center').bigSd).toBe(624);
    expect(resolveMutation(DEFAULT_BALANCE, 'distance_range').bigSd).toBe(208);
  });

  it('MUTATION_SD=0 でも NaN を返さない（ゼロ除算の防御）', () => {
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: { ...DEFAULT_BALANCE.genetics, MUTATION_SD: 0 },
    };
    for (const key of NUMERIC_TRAITS) {
      const m = resolveMutation(balance, key);
      expect(Number.isFinite(m.sd)).toBe(true);
      expect(Number.isFinite(m.bigSd)).toBe(true);
      expect(Number.isFinite(m.center)).toBe(true);
    }
  });

  it('回帰中心は創始定義から導出されており、両者がずれない', () => {
    // FOUNDERS を変えたら回帰中心も自動で追随すること（D-009 の再発防止）
    const shifted = buildTraitMutation({ ...FOUNDERS, DURABILITY_MEAN: 700, TEMPER_MEAN: 40 });
    expect(shifted.durability.center).toBe(700);
    expect(shifted.temper.center).toBe(40);
    // 既定は正典 §6.4 の表と一致
    const base = buildTraitMutation(FOUNDERS);
    expect(base.durability.center).toBe(650);
    expect(base.temper.center).toBe(50);
    expect(base['surface.turf'].center).toBe(55);
    expect(base.distance_center.center).toBe(2100);
    expect(base.distance_range.center).toBe(700);
    expect(base.sp.center).toBe(450);
  });

  it('全数値形質に回帰中心が定義されている（フォールバックに落ちない）', () => {
    for (const key of NUMERIC_TRAITS) {
      expect(DEFAULT_BALANCE.traitMutation[key]?.center).toBeTypeOf('number');
    }
  });
});

describe('回帰中心の誤りが再発しないこと（D-009 の回帰テスト）', () => {
  it('丈夫さは 650 へ引き戻される（450 ではない）', () => {
    // 変異を止めて回帰項だけを見る。創始水準 650 の馬は動かないのが正しい。
    // 値域45%（=450）を中心にしていた頃は 650 → 610 と毎世代下がっていた。
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
    const sire = herd.add('S', 'male', null, null, { birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { birthYear: 0 });
    // helpers の既定 durability は 600 なので 650 に揃える
    for (const h of [sire, dam]) {
      h.genotype.durability = { a1: 650, a2: 650 };
    }
    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 11,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(foal.genotype.durability.a1).toBe(650);
    expect(foal.genotype.durability.a2).toBe(650);
  });

  it('気性50・適性55・距離2100/700 も創始水準で不動', () => {
    // 距離系は絶対値 sd を持つので、共通の MUTATION_SD を 0 にしても止まらない。
    // 上書き側も 0 にして回帰項だけを見る
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        BIG_MUTATION_RATE: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 0,
      },
      traitMutation: {
        ...DEFAULT_BALANCE.traitMutation,
        distance_center: { center: 2100, sd: 0, clamp: 0 },
        distance_range: { center: 700, sd: 0, clamp: 0 },
      },
    };
    const herd = new Herd();
    const sire = herd.add('S', 'male', null, null, { birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { birthYear: 0 });
    for (const h of [sire, dam]) {
      h.genotype.temper = { a1: 50, a2: 50 };
      h.genotype.surface = { turf: { a1: 55, a2: 55 }, dirt: { a1: 55, a2: 55 } };
      h.genotype.distance_center = { a1: 2100, a2: 2100 };
      h.genotype.distance_range = { a1: 700, a2: 700 };
    }
    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 12,
      generation: 1,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    expect(foal.genotype.temper.a1).toBe(50);
    expect(foal.genotype.surface.turf.a1).toBe(55);
    expect(foal.genotype.surface.dirt.a1).toBe(55);
    expect(foal.genotype.distance_center.a1).toBe(2100);
    expect(foal.genotype.distance_range.a1).toBe(700);
  });
});
