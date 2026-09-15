/**
 * ★**凍結した走路の形 → レース条件**（★2026-09-15・指示書 VW §4-2・§5-4-6）
 *
 * 【★なぜここに置くか】
 *   ★凍結するオブジェクトを作るのは `@star/scheduler`（依存ゼロ）、★条件にするのは `@star/race-engine`。
 *   ★型は両方に同じ形で持っています（★層の向きを保つため）。★両方を引けるのは `apps/cli` だけなので、
 *   ★**2 か所の形が離れていないこと**をここで見ます（`venue-course.test.ts` と同じ作法）。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVAL, InvalidFrozenCourseError, conditionsFromFrozen, ovalSpecFromCornerRadii, parseFrozenCourse,
  type FrozenCourse,
} from '@star/race-engine';
import { VENUES, frozenCourseOf, type FrozenCourseRecord } from '@star/scheduler';
import { NICKS_GEN, deriveRng, type HorseRecord } from '@star/sim-engine';
import { generateRace, sortPoolByClass } from '../src/race-field.js';
import { runSimulation } from '../src/simulator.js';
import { resolveRuntimeConfig } from '../src/config.js';

const BASE = { raceId: 'r-1', distance: 1400, surface: 'dirt', trackCondition: 'soft' } as const;

describe('★凍結から条件を作る関数（§5-4-6）', () => {
  it('★10 場すべてで、凍結の値がそのままエンジンの走路になる', () => {
    for (const v of VENUES) {
      const f = frozenCourseOf(v.id);
      // ★型の上でも 2 か所の形が同じ（★どちらへも代入できる）
      const asEngine: FrozenCourse = f;
      const back: FrozenCourseRecord = parseFrozenCourse(asEngine);
      expect(back, '★検めた値は受け取ったオブジェクトそのもの（作り直さない）').toBe(f);
      const c = conditionsFromFrozen(f, BASE);
      expect(c.course, `★${v.name}`).toEqual({ lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM });
      expect(c.courseShape).toBe('oval');
      expect(c).toMatchObject({ ...BASE, baseWeightKg: 55 });
    }
  });

  it('★左回り・右回りの場を両方含み、回りはエンジンの条件を変えない（描画だけが使う）', () => {
    const turns = new Set(VENUES.map((v) => v.turn));
    expect([...turns].sort()).toEqual(['left', 'right']);
    for (const v of VENUES) {
      const f = frozenCourseOf(v.id);
      const flipped = { ...f, turn: f.turn === 'left' ? 'right' : 'left' } as const;
      expect(conditionsFromFrozen(flipped, BASE)).toEqual(conditionsFromFrozen(f, BASE));
    }
  });

  it('★cornerRadiiM は持っているときだけ運ぶ', () => {
    const spec = ovalSpecFromCornerRadii(400, [140, 150, 160, 170], 20);
    const withRadii: FrozenCourse = {
      v: 1, venueId: 'x', lapM: spec.lapM, homeStretchM: 400, widthM: 20,
      cornerRadiiM: [140, 150, 160, 170], turn: 'right', courseShape: 'oval',
    };
    expect(conditionsFromFrozen(withRadii, BASE).course?.cornerRadiiM).toEqual([140, 150, 160, 170]);
    const without = conditionsFromFrozen(frozenCourseOf('tenga'), BASE).course!;
    expect(Object.keys(without)).not.toContain('cornerRadiiM');
  });

  it('★凍結が無い（null）は DEFAULT_OVAL・oval（★0023 より前のレースが実際に確定されてきた形）', () => {
    const c = conditionsFromFrozen(null, BASE);
    expect(c.course).toBe(DEFAULT_OVAL);
    expect(c.courseShape).toBe('oval');
  });

  it('★直線の凍結は直線のまま（★Q-1 で入れる日のための形。本番の番組には出ない）', () => {
    const f = { ...frozenCourseOf('star-park'), courseShape: 'straight' } as const;
    expect(conditionsFromFrozen(f, BASE).courseShape).toBe('straight');
  });

  it('★不正な凍結は投げる（★黙って既定へ落とさない）', () => {
    const ok = frozenCourseOf('aone');
    const bad: unknown[] = [
      'oval', 42, [], { ...ok, v: 2 }, { ...ok, venueId: '' }, { ...ok, lapM: -1 },
      { ...ok, homeStretchM: ok.lapM / 2 }, { ...ok, turn: 'up' }, { ...ok, courseShape: 'figure8' },
      { ...ok, cornerRadiiM: [1, 2, 3] }, { ...ok, cornerRadiiM: [140, 150, 160, 170] }, { ...ok, slopeM: 3 },
      (() => { const { widthM: _w, ...rest } = ok; return rest; })(),
    ];
    for (const b of bad) {
      expect(() => parseFrozenCourse(b), JSON.stringify(b)).toThrow(InvalidFrozenCourseError);
      expect(() => conditionsFromFrozen(b as FrozenCourse, BASE), JSON.stringify(b)).toThrow(InvalidFrozenCourseError);
    }
  });
});

/**
 * ★**VW-1 検査 3 — 検証ハーネスの経路の乱数の並びが 1 ビットも変わらない**。
 *
 * ★直線の抽選は「引いてから捨てる」ので、★番組表を渡す経路と渡さない経路は
 *   ★**同じ距離・馬場なら同じ乱数を同じ数だけ消費します**。★それを出走表そのもので突き合わせます。
 * ★変更前後の出力の一致はハッシュでも取りました（報告書 VW-1）。★ここは恒久の検査です。
 */
describe('★VW-1 直線の抽選は本番の経路で引いてから捨てる', () => {
  const { balance, founders } = resolveRuntimeConfig();
  const POOL: readonly HorseRecord[] = sortPoolByClass(
    runSimulation(
      { seed: 42, generations: 12, population: 200, stallionPool: 60, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
      balance, founders, NICKS_GEN,
    ).finalPopulation ?? [],
  );

  it('★番組表あり／なしで出走表・馬場状態が同じ（★乱数の並びがずれていない）', () => {
    let straightDrawn = 0;
    for (let i = 0; i < 300; i += 1) {
      const legacy = generateRace(POOL, i, deriveRng(20260915, 61, i));
      if (legacy.conditions.courseShape === 'straight') straightDrawn += 1;
      for (const courseShape of ['oval', 'straight'] as const) {
        const prod = generateRace(POOL, i, deriveRng(20260915, 61, i), undefined, undefined, undefined, {
          programme: { surface: legacy.conditions.surface, distance: legacy.conditions.distance, courseShape },
        });
        expect(prod.entrants, `★race ${i}`).toEqual(legacy.entrants);
        expect(prod.conditions.trackCondition).toBe(legacy.conditions.trackCondition);
        // ★本番の経路の形は、渡した凍結の値そのもの（★抽選の結果を使わない）
        expect(prod.conditions.courseShape).toBe(courseShape);
      }
    }
    // ★直線の抽選が実際に起きている標本で確かめた（★空振りでない）
    expect(straightDrawn).toBeGreaterThan(0);
  });
});
