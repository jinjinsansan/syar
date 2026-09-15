/**
 * ★**距離ロスの同じ和の分解**（★ES 便 ES-5・2026-09-16・回答 `REVIEW_ENGINE_LANE_SPEED_ES3_ANSWER_20260916.md` §4-2 検査 2〜4）
 *
 * 【★見ている壊れ方】
 *   ★分解の式（`laneExtraMOnPlan`）が ★ループの経路（`laneExtraMOnPlanLoop`・`884019c` と 1 ビットも同じ）から ★丸めより大きく離れること。
 *   ★とくに ★**前提が崩れる馬・形を分解の式で計算してしまう**こと（★端の clamp・引き込み線の無い形・legacy）。
 * 【★経路の見方】★`laneExtraPathOf`（★純粋関数・状態を持たない）で、★その馬が 'sum' と 'loop' のどちらを通るかを見ます。
 */
import { describe, it, expect } from 'vitest';
import { DISTANCE_MENU, VENUES, frozenCourseOf } from '@star/scheduler';
import {
  conditionsFromFrozen, laneAt, laneExtraMOnPlan, laneExtraMOnPlanLoop, laneExtraPathOf, lanePlanOf, laneSumPlanOf,
  LANE_MODEL, LANE_MODEL_LEGACY, LANE_REVEAL_FULL_RUN, DEFAULT_OVAL, type LaneRacePlan, type OvalSpec,
} from '../src/index.js';
import { UNEVEN_RADII_SPEC } from './lane-fingerprint.cases.js';

const TOL_M = 1e-9;
const SEEDS = 30;
const seedOf = (s: number) => 777 + s * 104_729;

const specOfVenue = (id: string): OvalSpec => {
  const cond = conditionsFromFrozen(frozenCourseOf(id), { raceId: 'sum', distance: 1600, surface: 'turf', trackCondition: 'good' });
  return cond.course ?? DEFAULT_OVAL;
};
const SHAPES: readonly { name: string; spec: OvalSpec }[] = [
  ...VENUES.map((v) => ({ name: v.id, spec: specOfVenue(v.id) })),
  { name: 'default-oval', spec: DEFAULT_OVAL },
  { name: 'uneven-radii', spec: UNEVEN_RADII_SPEC },
];

/** ★コーナーの刻みの中点で、★画面の経路 `laneAt` が端に止められているか（★式を検査に書き写さずに「実際に掛かる」を見る） */
function clampedSomewhere(plan: LaneRacePlan, gate: number, heads: number, seed: number): boolean {
  const { distance, spec, segs } = plan;
  let acc = 0;
  for (const seg of segs) {
    if (seg.corner && seg.radius > 0) {
      for (let o = 0; o < seg.length; o += 10) {
        const len = Math.min(10, seg.length - o);
        const w = laneAt(gate, heads, distance - (acc + o + len / 2), distance, seed, spec.widthM, undefined, spec);
        if (w === 0.8 || w === spec.widthM - 0.8) return true;
      }
    }
    acc += seg.length;
  }
  return false;
}

interface Tally { sum: number; loop: number; worst: number; bad: string[] }
function compareOn(name: string, plan: LaneRacePlan, heads: number, t: Tally): void {
  for (let s = 0; s < SEEDS; s += 1) {
    const seed = seedOf(s);
    for (let gate = 1; gate <= heads; gate += 1) {
      const ref = laneExtraMOnPlanLoop(plan, gate, heads, seed);
      const got = laneExtraMOnPlan(plan, gate, heads, seed);
      const path = laneExtraPathOf(plan, gate, heads, seed);
      const d = Math.abs(got - ref);
      if (path === 'sum') {
        t.sum += 1;
        t.worst = Math.max(t.worst, d);
        if (!(d <= TOL_M)) t.bad.push(`${name} ${plan.distance}m ${heads}頭 枠${gate} シード${seed}: 差 ${d}`);
      } else {
        t.loop += 1;
        /** ★ループに落ちた馬は ★1 ビットも同じ */
        if (!Object.is(got, ref)) t.bad.push(`${name} ${plan.distance}m ${heads}頭 枠${gate}（loop）: ${got} ≠ ${ref}`);
      }
    }
  }
}

describe('★距離ロスの同じ和の分解（ES-5）', () => {
  it('検査 2: ★分解の式を使える馬で、分解の式とループの差が 1×10⁻⁹ m 以下（10 場・既定・半径 4 つ違い × 7 距離 × 8・18 頭 × シード 30）', () => {
    const t: Tally = { sum: 0, loop: 0, worst: 0, bad: [] };
    for (const { name, spec } of SHAPES) {
      for (const distance of DISTANCE_MENU) {
        const plan = lanePlanOf(distance, spec);
        /** ★本番の形はすべて引き込み線がある（前提 P-1） */
        expect(plan.sum, `${name} ${distance}m の分解の 1 レース分`).toBeDefined();
        for (const heads of [8, 18]) compareOn(name, plan, heads, t);
      }
    }
    expect(t.bad.slice(0, 20), `★${t.bad.length} 件`).toEqual([]);
    expect(t.sum).toBeGreaterThan(t.loop * 10);
    console.log(`[ES-5 経路] 分解 ${t.sum} 頭 ／ ループ ${t.loop} 頭 ／ 最大の差 ${t.worst} m`);
  }, 300_000);

  it('検査 3a: ★大河原 1200m で、端で止められうる馬はループに落ちる（★値もループと 1 ビットも同じ）', () => {
    const plan = lanePlanOf(1200, specOfVenue('ookawara'));
    const t: Tally = { sum: 0, loop: 0, worst: 0, bad: [] };
    for (const heads of [8, 18]) compareOn('ookawara', plan, heads, t);
    expect(t.bad).toEqual([]);
    expect(t.loop, '★ループに落ちた馬の数').toBeGreaterThan(0);
    expect(t.sum).toBeGreaterThan(0);
  });

  it('検査 3b: ★前提 P-1 が崩れる形（★発走直後からコーナー・引き込み線なし）はループに落ちる', () => {
    const base = lanePlanOf(1600, DEFAULT_OVAL);
    /** ★`withRunUp` を通さずに組んだ区間（★最初のコーナーまで 0m） */
    const segs = [...base.segs].filter((seg) => seg.corner || seg.length > 0);
    const noRunUp = [{ corner: true, length: 150, radius: 95.5 }, ...segs];
    const distance = noRunUp.reduce((a, seg) => a + seg.length, 0);
    const plan: LaneRacePlan = { distance, spec: DEFAULT_OVAL, segs: noRunUp, swing: base.swing };
    expect(laneSumPlanOf(plan, 10, LANE_REVEAL_FULL_RUN, LANE_MODEL)).toBeUndefined();
    const t: Tally = { sum: 0, loop: 0, worst: 0, bad: [] };
    compareOn('no-run-up', plan, 18, t);
    expect(t.bad).toEqual([]);
    expect(t.sum).toBe(0);
    expect(t.loop).toBe(18 * SEEDS);
  });

  it('検査 3c: ★legacy の走り方はループに落ちる', () => {
    const plan = lanePlanOf(1600, DEFAULT_OVAL);
    for (let gate = 1; gate <= 12; gate += 1) {
      expect(laneExtraPathOf(plan, gate, 12, 99, 10, LANE_REVEAL_FULL_RUN, LANE_MODEL_LEGACY)).toBe('loop');
      expect(Object.is(
        laneExtraMOnPlan(plan, gate, 12, 99, 10, LANE_REVEAL_FULL_RUN, LANE_MODEL_LEGACY),
        laneExtraMOnPlanLoop(plan, gate, 12, 99, 10, LANE_REVEAL_FULL_RUN, LANE_MODEL_LEGACY),
      )).toBe(true);
    }
  });

  it('検査 4 の的: ★実際に端で止められる馬を含む組（★狭い人工の走路・幅 8m）でも、分解の式はループと一致する', () => {
    /**
     * ★本番の形（幅 20〜23m）では ★実際に端で止められる馬が ★ほとんど出ないので、★端の判定を外す変異（変異 ①）の的として
     *   ★**幅 8m の人工の走路**を使います（★回答 §4-2 検査 4「無ければ人工の形で作り、その旨を書く」）。
     */
    const spec: OvalSpec = { lapM: 2000, homeStretchM: 400, widthM: 8 };
    const t: Tally = { sum: 0, loop: 0, worst: 0, bad: [] };
    let clamped = 0;
    for (const distance of [1200, 2400]) {
      const plan = lanePlanOf(distance, spec);
      compareOn('narrow-8m', plan, 18, t);
      for (let s = 0; s < SEEDS; s += 1) for (let gate = 1; gate <= 18; gate += 1) if (clampedSomewhere(plan, gate, 18, seedOf(s))) clamped += 1;
    }
    expect(clamped, '★実際に端で止められた馬（的が空でないこと）').toBeGreaterThan(0);
    expect(t.bad.slice(0, 10), `★${t.bad.length} 件`).toEqual([]);
  });
});
