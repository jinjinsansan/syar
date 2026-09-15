/**
 * ★**オッズのモンテカルロで、距離ロスの下ごしらえを試行の間で使い回す**（★ES 便 ES-6・2026-09-16・回答 `REVIEW_ENGINE_LANE_SPEED_ES5_ANSWER_20260916.md` §2-1 検査 2・4）
 *
 * 【★見ている壊れ方】
 *   ① ★使い回した版のオッズが ★試行ごとに作り直す版から ★わずかでも変わること（★1 ビットも同じはず）
 *   ② ★ワーカーが渡し忘れて ★試行ごとに作り直す形に戻ること（★結果は同じまま遅くなるので、★呼び出しの回数で見る）
 * 【★比べ方】★この検査の中だけ `resolveRace` を包み、★`strip` のときは渡された下ごしらえを外して呼びます（＝試行ごとに作り直す版）。
 *   ★`lanePlanOf` の回数は ★エンジンの `lane.ts` を包んで数えます（★製品のコードに数える状態を足さない）。
 */
import { describe, expect, it, vi } from 'vitest';
import { NICKS_GEN, type HorseRecord } from '@star/sim-engine';

const mode = vi.hoisted(() => ({ strip: false, planCalls: 0, trialsWithPlan: 0, trials: 0 }));

vi.mock('../../../packages/race-engine/src/lane.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../packages/race-engine/src/lane.js')>();
  return {
    ...orig,
    lanePlanOf: (...a: Parameters<typeof orig.lanePlanOf>) => { mode.planCalls += 1; return orig.lanePlanOf(...a); },
  };
});
vi.mock('@star/race-engine', async (importOriginal) => {
  const m = await importOriginal<typeof import('@star/race-engine')>();
  return {
    ...m,
    resolveRace: (p: Parameters<typeof m.resolveRace>[0]) => {
      mode.trials += 1;
      if (p.lanePlan !== undefined) mode.trialsWithPlan += 1;
      return m.resolveRace(mode.strip ? { ...p, lanePlan: undefined } : p);
    },
  };
});

const { buildRace } = await import('../src/build-race.js');
const { runSimulation } = await import('../../cli/src/simulator.js');
const { resolveRuntimeConfig } = await import('../../cli/src/config.js');

const { balance, founders } = resolveRuntimeConfig();
const POOL: readonly HorseRecord[] = runSimulation(
  { seed: 11, generations: 8, population: 200, stallionPool: 60, v1Pairs: 1, v1Repeats: 5, retainFinalPopulation: true },
  balance, founders, NICKS_GEN,
).finalPopulation ?? [];
const EPOCH_SEED = 20260916;

type Programme = { surface: 'turf' | 'dirt'; distance: number; courseId: string };
/** ★大河原 1200m（★分解の式からループに落ちる馬を含む）・短距離と長距離・10 場のうちいくつか */
const PROGRAMMES: readonly Programme[] = [
  { surface: 'turf', distance: 1200, courseId: 'ookawara' },
  { surface: 'turf', distance: 3000, courseId: 'ookawara' },
  { surface: 'turf', distance: 1400, courseId: 'star-park' },
  { surface: 'dirt', distance: 2400, courseId: 'ookawara' },
];

/** ★数は `toString()` で文字にして比べる（★1 ビットの違いも拾う） */
const bits = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : `n:${x.toString()}`) : x));

/** ★その頭数になるサイクルを探す（★出走頭数は `generateRace` が決める） */
function cycleWithHeads(p: Programme, heads: number): number | undefined {
  for (let c = 0; c < 400; c += 1) {
    if (buildRace(POOL, c, EPOCH_SEED, 1, undefined, p).entrants.length === heads) return c;
  }
  return undefined;
}

describe('★オッズの試行の間で下ごしらえを使い回す（ES-6）', () => {
  it('検査 2: ★buildRace の出力（オッズの行すべて）が、使い回す版と試行ごとに作り直す版で 1 ビット一致（8・18 頭）', () => {
    const TRIALS = 300;
    let compared = 0;
    for (const p of PROGRAMMES) {
      for (const heads of [8, 18]) {
        const cycle = cycleWithHeads(p, heads);
        expect(cycle, `${p.courseId} ${p.distance}m で ${heads} 頭のサイクル`).toBeDefined();
        mode.strip = true;
        const rebuilt = buildRace(POOL, cycle!, EPOCH_SEED, TRIALS, undefined, p);
        mode.strip = false;
        const reused = buildRace(POOL, cycle!, EPOCH_SEED, TRIALS, undefined, p);
        expect(reused.entrants.length).toBe(heads);
        expect(reused.odds.length).toBeGreaterThan(0);
        expect(bits(reused), `${p.courseId} ${p.distance}m ${heads}頭`).toBe(bits(rebuilt));
        compared += 1;
      }
    }
    expect(compared).toBe(PROGRAMMES.length * 2);
  }, 300_000);

  it('検査 4: ★オッズ計算 1 レースで lanePlanOf は試行の回数によらず 1 回・全試行が下ごしらえを受け取る', () => {
    const p = PROGRAMMES[0]!;
    for (const trials of [20, 400]) {
      mode.strip = false; mode.planCalls = 0; mode.trials = 0; mode.trialsWithPlan = 0;
      buildRace(POOL, 3, EPOCH_SEED, trials, undefined, p);
      expect(mode.trials, '試行の回数').toBe(trials);
      expect(mode.trialsWithPlan, '★下ごしらえを受け取った試行').toBe(trials);
      expect(mode.planCalls, `★試行 ${trials} 回での lanePlanOf`).toBe(1);
    }
    /** ★対照: 外すと試行ごとに作り直す（＝数え方が効いている） */
    mode.strip = true; mode.planCalls = 0;
    buildRace(POOL, 3, EPOCH_SEED, 50, undefined, p);
    mode.strip = false;
    expect(mode.planCalls).toBe(50 + 1);
  }, 120_000);
});
