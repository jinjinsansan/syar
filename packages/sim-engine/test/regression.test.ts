/**
 * 平均回帰と形質別の変異上書き — 正典 §6.4（D-008）/ §5.2（P0-fix F-3）
 *
 * 平均回帰は正典 §13.3 が明記する「血統インフレの唯一の実効的な抑制機構」なので、
 * 既定で有効であること自体をテストで固定する（うっかり 0 に戻す変更を検知するため）。
 */

import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  DEFAULT_BALANCE,
  FOUNDERS,
  MUTATION_CLAMP_RATIO,
  buildTraitMutation,
  clampTruncationFactor,
} from '../src/balance.js';
import { breed } from '../src/breeding.js';
import { mutateAllele, resolveMutation } from '../src/genetics.js';
import type { NicksTable } from '../src/nicks.js';
import { NUMERIC_TRAITS } from '../src/types.js';
import { Herd } from './helpers.js';

const NO_NICKS: NicksTable = new Map();

/**
 * 変異ノイズを**全形質で**止めた balance（回帰項だけを観察するため）。
 *
 * ⚠️ `genetics.MUTATION_SD = 0` だけでは非能力形質は止まらない。D-012 以降、
 *    非能力形質は `traitMutation[key].sd` に絶対値を持つため、共通の MUTATION_SD を
 *    0 にしても効かない。この落とし穴を踏んだので、意図を関数名で明示しておく。
 */
function silenceMutation(base: typeof DEFAULT_BALANCE = DEFAULT_BALANCE): typeof DEFAULT_BALANCE {
  const traitMutation: Record<string, unknown> = {};
  for (const key of NUMERIC_TRAITS) {
    traitMutation[key] = { ...base.traitMutation[key], sd: 0, clamp: 0 };
  }
  return {
    ...base,
    genetics: {
      ...base.genetics,
      MUTATION_SD: 0,
      BIG_MUTATION_SD: 0,
      BIG_MUTATION_RATE: 0,
      ATAVISM_RATE: 0,
      BIG_ATAVISM_RATE: 0,
    },
    traitMutation: traitMutation as typeof base.traitMutation,
  };
}

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

  it('丈夫さ: sd 66 / clamp 109 / 回帰 0.20 / 中心 650（★値域45%の450ではない）', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'durability');
    expect(m.center).toBe(650);
    expect(m.regressionRate).toBe(0.2);
    // 値域比スケール（=90）ではなく 創始アレルSD 100 × √0.36 ÷ 0.9156 から導出（D-012/D-013）
    expect(m.sd).toBe(66);
    expect(m.clamp).toBe(109);
  });

  it('気性: sd 10 / clamp 16 / 中心 50', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'temper');
    expect(m.center).toBe(50);
    expect(m.sd).toBe(10);
    expect(m.clamp).toBe(16);
  });

  it('芝/ダート適性: sd 13 / clamp 22 / 中心 55（★値域45%の45ではない）', () => {
    for (const key of ['surface.turf', 'surface.dirt'] as const) {
      const m = resolveMutation(DEFAULT_BALANCE, key);
      expect(m.center).toBe(55);
      expect(m.sd).toBe(13);
      expect(m.clamp).toBe(22);
    }
  });

  it('clamp 切断補正の係数がリテラル固定されている（D-013）', () => {
    // clamp/sd 比 1.6667 での実効SD係数。比を変えたら再計算が必要
    expect(BALANCE.CLAMP_TRUNCATION_FACTOR).toBe(0.9156);
    expect(MUTATION_CLAMP_RATIO).toBeCloseTo(150 / 90, 10);
  });

  it('非能力形質の sd はすべて創始アレルSDから導出される（D-012/D-013）', () => {
    // 値域比スケールのままだと芝適性は平衡SDが 0.71倍に収縮、丈夫さは 1.41倍に拡大していた
    const built = buildTraitMutation(FOUNDERS, 0.2);
    const g = Math.sqrt(2 * 0.2 - 0.2 * 0.2); // = 0.6
    const f = clampTruncationFactor(MUTATION_CLAMP_RATIO);
    expect(built.durability.sd).toBe(Math.round((FOUNDERS.DURABILITY_SD * g) / f));
    expect(built.temper.sd).toBe(Math.round((FOUNDERS.TEMPER_SD * g) / f));
    expect(built['surface.turf'].sd).toBe(Math.round(((90 - 20) / Math.sqrt(12)) * g / f));
    // 能力5種だけは例外（V-1 から較正するため上書きしない）
    expect(built.sp.sd).toBeUndefined();
  });

  it('sd は創始定義の SD に追随する（I-5・center と同じ担保）', () => {
    // FOUNDERS.*_SD を変えたら導出 sd も変わること。
    // center 側（D-009）には同等のテストがあったが sd 側には無かった
    const wider = buildTraitMutation({
      ...FOUNDERS,
      DURABILITY_SD: 200,
      TEMPER_SD: 30,
      SURFACE_RANGE: [0, 140],
      DISTANCE_CENTER_RANGE: [0, 3600],
    });
    const g = Math.sqrt(2 * 0.2 - 0.2 * 0.2);
    const f = clampTruncationFactor(MUTATION_CLAMP_RATIO);
    expect(wider.durability.sd).toBe(Math.round((200 * g) / f));
    expect(wider.temper.sd).toBe(Math.round((30 * g) / f));
    expect(wider['surface.turf'].sd).toBe(Math.round((140 / Math.sqrt(12)) * g / f));
    expect(wider.distance_center.sd).toBe(Math.round((3600 / Math.sqrt(12)) * g / f));
    // 創始SDを2倍にしたら sd もほぼ2倍（丸めで ±1 の差は許容）
    const base = buildTraitMutation(FOUNDERS).durability.sd ?? 0;
    expect(Math.abs((wider.durability.sd ?? 0) - base * 2)).toBeLessThanOrEqual(1);
  });

  it('distance_center: sd 341 / clamp 568 / 回帰 0.20（共通） / 中心 2100', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'distance_center');
    expect(m.sd).toBe(341);
    expect(m.clamp).toBe(568);
    expect(m.regressionRate).toBe(0.2);
    expect(m.center).toBe(2100);
  });

  it('distance_range: sd 114 / clamp 189 / 回帰 0.20（共通） / 中心 700', () => {
    const m = resolveMutation(DEFAULT_BALANCE, 'distance_range');
    expect(m.sd).toBe(114);
    expect(m.clamp).toBe(189);
    expect(m.regressionRate).toBe(0.2);
    expect(m.center).toBe(700);
  });

  it('距離系の sd は回帰率から導出され、両者がずれない', () => {
    // 平衡SD = sd / sqrt(2r - r²) を創始水準に保つため sd は r に従属する。
    // r を変えたら sd も自動で追随すること（定数が別々に固まって壊れるのを防ぐ）
    const alleleSd = (1000 - 400) / Math.sqrt(12); // distance_range の創始アレルSD
    const f = clampTruncationFactor(MUTATION_CLAMP_RATIO);
    for (const r of [0.05, 0.1, 0.2]) {
      const built = buildTraitMutation(FOUNDERS, r);
      expect(built.distance_range.sd).toBe(Math.round((alleleSd * Math.sqrt(2 * r - r * r)) / f));
    }
    expect(buildTraitMutation(FOUNDERS, 0.2).distance_center.sd).toBe(341);
  });

  it('距離系の大突然変異SDは通常変異との比（180/90 = 2倍）を保つ', () => {
    expect(resolveMutation(DEFAULT_BALANCE, 'distance_center').bigSd).toBe(682);
    expect(resolveMutation(DEFAULT_BALANCE, 'distance_range').bigSd).toBe(228);
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

/**
 * 変異＋回帰の**式の形そのもの**を固定する（正典 §6.4・D-012）。
 *
 * ⚠️ このテスト群が無かったために、clamp の位置を取り違えたまま P0-fix2 を通してしまった。
 *    既存の回帰テストはすべて `MUTATION_SD = 0` で走っており、その条件では
 *    `clamp(N) − 回帰項` と `clamp(N − 回帰項)` が同値になるため、
 *    式を入れ替えても全件 PASS してしまう（レビュー側監査で判明）。
 *    ノイズを引数で注入できる純関数にして、**両形式が異なる値になる入力**で固定する。
 */
describe('変異＋回帰の式（正典 §6.4・D-012）', () => {
  const mutation = {
    sd: 90,
    bigSd: 180,
    clamp: 150,
    regressionRate: 0.2,
    center: 450,
  };

  it('clamp は変異ノイズのみにかかる（合計にかけてはいけない）', () => {
    // アレル値900・中心450 → 引き戻し = 450 × 0.2 = 90
    // ノイズ +200 は clamp 幅150 で切られる
    //   正: 900 + clamp(200)=150 − 90 = 960
    //   誤（合計にclamp）: 900 + clamp(200 − 90 = 110) = 1010
    expect(mutateAllele(900, 200, mutation, false)).toBe(960);

    //   正: 900 + clamp(-300)=-150 − 90 = 660
    //   誤（合計にclamp）: 900 + clamp(-300 − 90 = -390) = -150 → 750
    expect(mutateAllele(900, -300, mutation, false)).toBe(660);
  });

  it('引き戻し量は clamp で頭打ちにならない（極端なアレルほど強く引く）', () => {
    // ノイズ0 のとき、引き戻しはそのまま効く
    expect(mutateAllele(900, 0, mutation, false)).toBe(810); // −90.0
    expect(mutateAllele(1000, 0, mutation, false)).toBe(890); // −110.0
    // 合計に clamp する式だと −76.5 / −90.6 に弱まってしまう
  });

  it('ノイズが clamp 内なら両形式は同値（＝ここだけ見ても式は固定できない）', () => {
    // MUTATION_SD=0 の回帰テストがすべてこの領域にいたため、式の誤りを検出できなかった
    expect(mutateAllele(900, 50, mutation, false)).toBe(860);
    expect(mutateAllele(900, 0, mutation, false)).toBe(810);
  });

  it('大突然変異には通常の clamp 幅を適用しない（値域clampのみ）', () => {
    // ノイズ +400 は切られない: 900 + 400 − 90 = 1210（値域clampは呼び出し側）
    expect(mutateAllele(900, 400, mutation, true)).toBe(1210);
  });

  it('回帰率0 なら引き戻しは起きない', () => {
    expect(mutateAllele(900, 50, { ...mutation, regressionRate: 0 }, false)).toBe(950);
  });

  it('品種中心ちょうどならノイズだけが効く', () => {
    expect(mutateAllele(450, 30, mutation, false)).toBe(480);
  });
});

/**
 * 【I-3】clamp の式を**本番経路**でも固定する。
 *
 * 前便で `mutateAllele()` を純関数化して式を固定したが、固定できていたのは
 * **純関数の内部だけ**だった。レビュー側の監査で「純関数はそのままに、呼び出し側
 * （`inheritGenotype`）へ旧「合計 clamp」形をインラインで書き戻す」と82件すべて PASS
 * することが確認された。単体を固定することと経路を固定することは別物である。
 *
 * ここでは `breed()` を通した**観測可能な境界**で式を判別する。
 * 両親のアレルを 900（品種中心450・回帰0.2 → 引き戻し −90）に固定し、
 * 変異ノイズは N(0,90) を ±150 で clamp する条件にすると:
 *
 *   正しい式  child = 900 + clamp(X, ±150) − 90        → 値域 [660, 960]
 *   誤った式  child = 900 + clamp(X − 90, ±150)        → 値域 [750, 1050]
 *
 * **上限960超**と**下限750未満**のどちらも、片方の式でしか起こり得ない。
 */
describe('clamp の式が本番経路（breed 経由）でも固定されていること（I-3）', () => {
  const CENTER = 450;
  const PARENT_ALLELE = 900;
  const PULL = (PARENT_ALLELE - CENTER) * 0.2; // = 90
  const CLAMP = 150;

  function breedMany(count: number): number[] {
    // 隔世遺伝・大物覚醒・大突然変異を止め、通常変異と回帰だけが効く条件にする
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 0,
        BIG_MUTATION_RATE: 0,
      },
    };
    const herd = new Herd();
    const sire = herd.add('S', 'male', null, null, { birthYear: 0 });
    const dam = herd.add('D', 'female', null, null, { birthYear: 0 });
    for (const h of [sire, dam]) {
      h.genotype.sp = { a1: PARENT_ALLELE, a2: PARENT_ALLELE };
    }
    const out: number[] = [];
    for (let seed = 0; seed < count; seed++) {
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
      out.push(foal.genotype.sp.a1, foal.genotype.sp.a2);
    }
    return out;
  }

  const alleles = breedMany(400);

  it('観測値が正しい式の値域 [660, 960] に収まる', () => {
    const lo = PARENT_ALLELE - CLAMP - PULL; // 660
    const hi = PARENT_ALLELE + CLAMP - PULL; // 960
    expect(Math.min(...alleles)).toBeGreaterThanOrEqual(lo);
    // ★誤った式なら最大 1050 まで出る。ここで確実に落ちる
    expect(Math.max(...alleles)).toBeLessThanOrEqual(hi);
  });

  it('誤った式では到達できない下限（750未満）が実際に観測される', () => {
    // 合計に clamp をかける式では child は 750 を下回れない
    expect(Math.min(...alleles)).toBeLessThan(750);
  });

  it('引き戻しの分だけ分布全体が下にずれている（中心が親より低い）', () => {
    const avg = alleles.reduce((a, b) => a + b, 0) / alleles.length;
    // 正: 900 − 90 = 810 付近 / 誤: clamp が引き戻しを削るので 810 より高く出る
    expect(avg).toBeGreaterThan(795);
    expect(avg).toBeLessThan(825);
  });
});

describe('大物覚醒の適用範囲（正典 §6.3・D-011）', () => {
  it('対象は能力5種のみ', () => {
    expect([...DEFAULT_BALANCE.BIG_ATAVISM_TRAITS].sort()).toEqual(
      ['sp', 'st', 'pw', 'gt', 'iq'].sort(),
    );
  });

  it('非能力形質では発動しない（発動率100%でも記録されない）', () => {
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        BIG_MUTATION_RATE: 0,
        ATAVISM_RATE: 0,
        BIG_ATAVISM_RATE: 1, // 必ず当たる設定
      },
    };
    const herd = new Herd();
    const opts = { birthYear: 0 };
    const ss = herd.add('SS', 'male', null, null, { ...opts, ability: 900 });
    const sdm = herd.add('SD', 'female', null, null, opts);
    const ds = herd.add('DS', 'male', null, null, opts);
    const dd = herd.add('DD', 'female', null, null, opts);
    const sire = herd.add('S', 'male', ss, sdm, opts);
    const dam = herd.add('D', 'female', ds, dd, opts);

    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 7,
      generation: 2,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    const fired = foal.breedingRecord?.bigAtavismTraits ?? [];
    expect(fired.length).toBeGreaterThan(0); // 能力5種では発動している
    for (const key of fired) {
      expect(['sp', 'st', 'pw', 'gt', 'iq']).toContain(key);
    }
    // 非能力形質は1つも含まれない
    expect(fired).not.toContain('temper');
    expect(fired).not.toContain('durability');
    expect(fired).not.toContain('distance_range');
    expect(fired).not.toContain('surface.turf');
  });

  it('通常の隔世遺伝（6%）は全形質に適用したまま', () => {
    const balance = {
      ...DEFAULT_BALANCE,
      genetics: {
        ...DEFAULT_BALANCE.genetics,
        MUTATION_SD: 0,
        BIG_MUTATION_SD: 0,
        BIG_MUTATION_RATE: 0,
        ATAVISM_RATE: 1, // 必ず当たる設定
        BIG_ATAVISM_RATE: 0,
      },
    };
    const herd = new Herd();
    const opts = { birthYear: 0 };
    const ss = herd.add('SS', 'male', null, null, opts);
    const sdm = herd.add('SD', 'female', null, null, opts);
    const ds = herd.add('DS', 'male', null, null, opts);
    const dd = herd.add('DD', 'female', null, null, opts);
    const sire = herd.add('S', 'male', ss, sdm, opts);
    const dam = herd.add('D', 'female', ds, dd, opts);

    const foal = breed({
      id: 'F',
      sire,
      dam,
      seed: 7,
      generation: 2,
      birthYear: 10,
      lookup: herd.lookup,
      balance,
      nicks: NO_NICKS,
    });
    // 11形質すべてで隔世遺伝のロールが当たっている
    expect(foal.breedingRecord?.atavismTraits.length).toBe(NUMERIC_TRAITS.length);
  });
});

describe('回帰中心の誤りが再発しないこと（D-009 の回帰テスト）', () => {
  it('丈夫さは 650 へ引き戻される（450 ではない）', () => {
    // 変異を止めて回帰項だけを見る。創始水準 650 の馬は動かないのが正しい。
    // 値域45%（=450）を中心にしていた頃は 650 → 610 と毎世代下がっていた。
    const balance = silenceMutation();
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
    const balance = silenceMutation();
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
