/**
 * ★**先天個性・後天特性の層**（★第 4 便・2026-09-16・正典 **D-109**）
 *
 * 【★見ている壊れ方】
 *   ① ★**素質（`potential`）を見て個性が付く**（★§5.5 の非公開が漏れる・D-108 ③ と同じ「入力の形」）
 *   ② ★**乱数・時刻を読む**（★憲法 4・D-061「新しい乱数を引かない」）
 *   ③ ★**返す順が呼ぶたびに変わる**（★物語の行・画面の並びが揺れる）
 *   ④ ★境目のすぐ外で付いてしまう／すぐ内で付かない（★R-2 の両側）
 *   ⑤ ★**効果が 0 でなくなる**（★この便の約束が破れる）
 *
 * ⚠️ ★**「着順に効かない」ことの本体は `resolveRace` を回す対照**（`apps/cli/test/trait-no-effect.test.ts`）です。
 *    ★ここは層そのものの検査で、★定数が 0 なだけを合格の根拠にしていません。
 */
import { describe, it, expect } from 'vitest';
import {
  INNATE_TRAITS, LEARNED_TRAITS, TRAIT_LABEL, TRAIT_EFFECT, traitEffectOf,
  INNATE_THRESHOLDS, LEARNED_STEPS, LONG_DISTANCE_M,
  innateTraitsOf, learnedTraitsOf, careerInputOf, traitsOf, learnedTraitsGained,
  type InnateInput,
} from '../src/index.js';

/** ★どの個性も付かない馬（★境目の下） */
const plain: InnateInput = { heavyAptitude: 50, temper: 50, gt: 500, iq: 500 };

describe('★先天個性（D-109）', () => {
  it('① ★素質を渡す口が無い（★入力は発現した値だけ）', () => {
    /** ★`InnateInput` のキーがこの 4 つであること。★`potential`・`stats` を足した日にここが落ちる */
    const keys = Object.keys(plain).sort();
    expect(keys).toEqual(['gt', 'heavyAptitude', 'iq', 'temper']);
    /** ★関数は 1 引数（★乱数・時刻を受け取る口が無い・憲法 4） */
    expect(innateTraitsOf.length).toBe(1);
  });

  it('④ ★境目の両側で切り替わる（★R-2）', () => {
    expect(innateTraitsOf({ ...plain, heavyAptitude: INNATE_THRESHOLDS.mud - 1 })).toEqual([]);
    expect(innateTraitsOf({ ...plain, heavyAptitude: INNATE_THRESHOLDS.mud })).toEqual(['mud']);
    expect(innateTraitsOf({ ...plain, gt: INNATE_THRESHOLDS.competitive - 1 })).toEqual([]);
    expect(innateTraitsOf({ ...plain, gt: INNATE_THRESHOLDS.competitive })).toEqual(['competitive']);
    expect(innateTraitsOf({ ...plain, temper: INNATE_THRESHOLDS.delicate - 1 })).toEqual([]);
    expect(innateTraitsOf({ ...plain, temper: INNATE_THRESHOLDS.delicate })).toEqual(['delicate']);
    expect(innateTraitsOf({ ...plain, iq: INNATE_THRESHOLDS.quickStart - 1 })).toEqual([]);
    expect(innateTraitsOf({ ...plain, iq: INNATE_THRESHOLDS.quickStart })).toEqual(['quick-start']);
  });

  it('③ ★返す順は名簿の順（★呼ぶ順・入力の順に依らない）', () => {
    const all = innateTraitsOf({ heavyAptitude: 100, temper: 100, gt: 1000, iq: 1000 });
    expect(all).toEqual(INNATE_TRAITS);
    /** ★何度呼んでも同じ（★決定論） */
    expect(innateTraitsOf({ heavyAptitude: 100, temper: 100, gt: 1000, iq: 1000 })).toEqual(all);
  });
});

describe('★後天特性（D-109 ②・レース結果から決定論で導く）', () => {
  const run = (distanceM: number, graded: boolean, jockeyId: string) => ({ distanceM, graded, jockeyId });

  it('★出走の履歴から数える（★長距離・重賞・同じ騎手）', () => {
    const c = careerInputOf([
      run(1200, false, 'j-a'),
      run(LONG_DISTANCE_M, false, 'j-a'),
      run(LONG_DISTANCE_M + 400, true, 'j-b'),
      run(LONG_DISTANCE_M - 1, true, 'j-a'),
    ]);
    expect(c.longRuns).toBe(2);
    expect(c.gradedRuns).toBe(2);
    /** ★いちばん多い騎手の回数（★合計ではない） */
    expect(c.topJockeyRides).toBe(3);
  });

  it('④ ★回数の境目の両側（★R-2）', () => {
    const at = (n: number) => learnedTraitsOf({ longRuns: n, gradedRuns: 0, topJockeyRides: 0 });
    expect(at(LEARNED_STEPS.longDistance - 1)).toEqual([]);
    expect(at(LEARNED_STEPS.longDistance)).toEqual(['long-distance']);
    const big = (n: number) => learnedTraitsOf({ longRuns: 0, gradedRuns: n, topJockeyRides: 0 });
    expect(big(LEARNED_STEPS.bigStage - 1)).toEqual([]);
    expect(big(LEARNED_STEPS.bigStage)).toEqual(['big-stage']);
    const bond = (n: number) => learnedTraitsOf({ longRuns: 0, gradedRuns: 0, topJockeyRides: n });
    expect(bond(LEARNED_STEPS.bonded - 1)).toEqual([]);
    expect(bond(LEARNED_STEPS.bonded)).toEqual(['bonded']);
  });

  it('★新しく身についたぶんだけを返す（★物語の行が二重にならない・§18 LR-7）', () => {
    const before = { longRuns: 2, gradedRuns: 3, topJockeyRides: 5 };
    const after = { longRuns: 3, gradedRuns: 3, topJockeyRides: 5 };
    /** ★重賞と名コンビは「前から持っていた」ので出さない */
    expect(learnedTraitsGained(before, after)).toEqual(['long-distance']);
    expect(learnedTraitsGained(after, after)).toEqual([]);
  });

  it('② ★乱数・時刻を読む口が無い（★憲法 4・D-061）', () => {
    expect(learnedTraitsOf.length).toBe(1);
    expect(careerInputOf.length).toBe(1);
    /** ★同じ入力なら何度でも同じ */
    const c = careerInputOf([run(2400, true, 'j-a'), run(2400, true, 'j-a')]);
    expect(careerInputOf([run(2400, true, 'j-a'), run(2400, true, 'j-a')])).toEqual(c);
  });
});

describe('★この便の約束', () => {
  it('⑤ ★どの特性も着順への効果が 0', () => {
    expect(TRAIT_EFFECT).toBe(0);
    for (const t of [...INNATE_TRAITS, ...LEARNED_TRAITS]) {
      expect(traitEffectOf(t), TRAIT_LABEL[t]).toBe(0);
    }
  });

  it('★名前は 7 つぶん揃っていて、空が無い（★§0.1・実在の人名・団体名を入れない）', () => {
    const all = [...INNATE_TRAITS, ...LEARNED_TRAITS];
    expect(all.length).toBe(7);
    expect(new Set(all).size).toBe(7);
    for (const t of all) expect(TRAIT_LABEL[t].length).toBeGreaterThan(0);
  });

  it('★まとめて引くと先天 → 後天の順', () => {
    const got = traitsOf(
      { heavyAptitude: 100, temper: 100, gt: 1000, iq: 1000 },
      { longRuns: 9, gradedRuns: 9, topJockeyRides: 9 },
    );
    expect(got).toEqual([...INNATE_TRAITS, ...LEARNED_TRAITS]);
  });
});
