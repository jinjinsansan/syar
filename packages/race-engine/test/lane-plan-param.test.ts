/**
 * ★**作り済みの距離ロスの下ごしらえを `resolveRace` に渡す**（★ES 便 ES-6・2026-09-16・回答 `REVIEW_ENGINE_LANE_SPEED_ES5_ANSWER_20260916.md` §2-1 検査 3）
 *
 * 【★見ている壊れ方】
 *   ① ★渡した場合と省いた場合で ★結果がわずかでも変わること（★同じ関数で同じ値を作るだけなので 1 ビットも同じはず）
 *   ② ★**別のレースの下ごしらえ**（距離・走路の形が違う・直線のレース）で ★黙って計算してしまうこと（R-27）
 */
import { describe, it, expect } from 'vitest';
import { frozenCourseOf } from '@star/scheduler';
import {
  resolveRace, lanePlanForRace, lanePlanOf, conditionsFromFrozen, DEFAULT_RACE_BALANCE, DEFAULT_OVAL,
  type RaceConditions, type RaceResult,
} from '../src/index.js';
import { fingerprintField, UNEVEN_RADII_SPEC } from './lane-fingerprint.cases.js';

const base = (distance: number) => ({ raceId: 'plan', distance, surface: 'turf' as const, trackCondition: 'good' as const });
const venue = (id: string, distance: number): RaceConditions => conditionsFromFrozen(frozenCourseOf(id), base(distance));
const uneven = (distance: number): RaceConditions => ({ ...base(distance), baseWeightKg: 55, courseShape: 'oval', course: UNEVEN_RADII_SPEC });
const straight = (distance: number): RaceConditions => ({ ...base(distance), baseWeightKg: 55, courseShape: 'straight' });

/** ★数は `toString()` で文字にして比べる（★1 ビットの違いも拾う） */
const bits = (r: RaceResult): string => JSON.stringify(r, (_k, v: unknown) =>
  (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : `n:${v.toString()}`) : v));

describe('★作り済みの下ごしらえ（ES-6）', () => {
  it('★渡しても省いても、結果は 1 ビットも同じ（大河原 1200m・10 場のいくつか・既定・半径 4 つ違い × 8・18 頭）', () => {
    const conds = [venue('ookawara', 1200), venue('ookawara', 3000), venue('star-park', 1600), conditionsFromFrozen(null, base(2000)), uneven(1400)];
    for (const c of conds) {
      const plan = lanePlanForRace(c);
      expect(plan, `${c.distance}m の下ごしらえ`).toBeDefined();
      for (const heads of [8, 18]) {
        const entrants = fingerprintField(heads);
        for (let s = 0; s < 10; s += 1) {
          const seed = 31 + s * 7_919;
          const without = resolveRace({ conditions: c, entrants, seed, balance: DEFAULT_RACE_BALANCE });
          const withPlan = resolveRace({ conditions: c, entrants, seed, balance: DEFAULT_RACE_BALANCE, lanePlan: plan });
          expect(bits(withPlan), `${JSON.stringify(c.course)} ${c.distance}m ${heads}頭 シード${seed}`).toBe(bits(without));
        }
      }
    }
  });

  it('★値が同じなら別のオブジェクトの走路でも受け取る（★凍結から作り直した条件でも使える）', () => {
    const c = venue('ookawara', 1800);
    const plan = lanePlanOf(1800, { ...c.course! });
    expect(() => resolveRace({ conditions: c, entrants: fingerprintField(8), seed: 1, balance: DEFAULT_RACE_BALANCE, lanePlan: plan })).not.toThrow();
    /** ★`course` の無いレースは `DEFAULT_OVAL` と比べる */
    const d = conditionsFromFrozen(null, base(1600));
    expect(() => resolveRace({ conditions: d, entrants: fingerprintField(8), seed: 1, balance: DEFAULT_RACE_BALANCE, lanePlan: lanePlanOf(1600, DEFAULT_OVAL) })).not.toThrow();
  });

  it('検査 3: ★下ごしらえとレースの条件が食い違うと投げる', () => {
    const entrants = fingerprintField(8);
    const run = (conditions: RaceConditions, plan: ReturnType<typeof lanePlanOf>) =>
      () => resolveRace({ conditions, entrants, seed: 5, balance: DEFAULT_RACE_BALANCE, lanePlan: plan });
    const ook = venue('ookawara', 1200);
    const spec = ook.course!;
    const cases: readonly [string, () => unknown][] = [
      ['距離が違う', run(ook, lanePlanOf(1400, spec))],
      ['幅が違う', run(ook, lanePlanOf(1200, { ...spec, widthM: spec.widthM + 1 }))],
      ['1 周が違う', run(ook, lanePlanOf(1200, DEFAULT_OVAL))],
      ['直線の長さが違う', run(venue('star-park', 1600), lanePlanOf(1600, { ...DEFAULT_OVAL, homeStretchM: DEFAULT_OVAL.homeStretchM + 20, lapM: DEFAULT_OVAL.lapM + 40 }))],
      ['コーナーの半径の有無が違う', run(uneven(1600), lanePlanOf(1600, { lapM: UNEVEN_RADII_SPEC.lapM, homeStretchM: UNEVEN_RADII_SPEC.homeStretchM, widthM: UNEVEN_RADII_SPEC.widthM }))],
      ['直線のレースに渡す', run(straight(1200), lanePlanOf(1200, DEFAULT_OVAL))],
    ];
    for (const [label, fn] of cases) expect(fn, label).toThrow(/下ごしらえ/);
  });
});
