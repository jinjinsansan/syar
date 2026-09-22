/**
 * ★**D-121 ③ の測る部品**（`tools/lib/lineage-measure.mjs`・裁定 REVIEW_D121_MEASURE_TOOL_VERDICT_20260923.md）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { maternalGenerations, percentileOf, plateauOf, quantile, summarizeUsers } from '../../../tools/lib/lineage-measure.mjs';

type Bred = { id: string; userId: string; damId: string | null; sum: number; inbreed: number; frail: boolean };
const pct = percentileOf as (r: readonly number[], v: number) => number | null;
const gens = maternalGenerations as (b: readonly Omit<Bred, 'sum' | 'inbreed' | 'frail'>[]) => Map<string, number>;
const plateau = plateauOf as (b: readonly number[], k: number, w: number) => string;
const summarize = summarizeUsers as (b: readonly Bred[], r: readonly number[], o: { k: number; width: number }) => {
  best: number; bestByGen: number[]; plateau: string; inbreedMean: number; frailShare: number; horses: number;
}[];

describe('★% 点（★いまの NPC 現役の物差し）', () => {
  const ref = [10, 20, 30, 40];
  it('★下にある数 ＋ 同じ値の半分', () => {
    expect(pct(ref, 5)).toBe(0);
    expect(pct(ref, 25)).toBe(50);
    expect(pct(ref, 30)).toBe(62.5);
    expect(pct(ref, 99)).toBe(100);
  });
  it('★物差しが空なら null（★0 と言わない）', () => expect(pct([], 1)).toBeNull());
  it('★分位点', () => expect((quantile as (v: number[], q: number) => number)([5, 1, 3], 50)).toBe(3));
});

describe('★母系の世代', () => {
  it('★母が同じ利用者の自家産なら 1 つ下の世代・★そうでなければ 1 世代目', () => {
    const g = gens([
      { id: 'a', userId: 'u', damId: 'npc' },
      { id: 'b', userId: 'u', damId: 'a' },
      { id: 'c', userId: 'u', damId: 'b' },
      { id: 'd', userId: 'v', damId: 'a' },   // ★別の利用者の母（★買えない設計だが、世代は 1 から）
    ]);
    expect([...g.entries()].sort()).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 1]]);
  });
});

describe('★参考の列 (a)（★直近 k 世代が それまでの最良 ＋ 幅 を上回らない）', () => {
  it('★上回らなければ plateau・★上回れば rising', () => {
    expect(plateau([40, 60, 55, 58], 2, 0)).toBe('plateau');
    expect(plateau([40, 60, 55, 61], 2, 0)).toBe('rising');
    // ★幅を広げると ★同じ列が plateau になる（★数が判断を決めることの対照）
    expect(plateau([40, 60, 55, 61], 2, 2)).toBe('plateau');
  });
  it('🔴 ★世代が k ＋ 1 に満たなければ ★判定できない（★0 人を「頭打ち 0 %」と読ませない）', () => {
    expect(plateau([40, 60], 2, 0)).toBe('undecidable');
    expect(plateau([], 2, 0)).toBe('undecidable');
  });
});

describe('★利用者ごとに まとめる（★ID を返さない）', () => {
  it('★世代ごとの最良・最良・近交の平均・虚弱の割合', () => {
    const ref = [0, 100, 200, 300];
    const out = summarize([
      { id: 'a', userId: 'u', damId: 'npc', sum: 150, inbreed: 0, frail: false },
      { id: 'a2', userId: 'u', damId: 'npc', sum: 50, inbreed: 0.1, frail: true },
      { id: 'b', userId: 'u', damId: 'a', sum: 250, inbreed: 0.2, frail: false },
    ], ref, { k: 2, width: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]!.bestByGen).toEqual([50, 75]);
    expect(out[0]!.best).toBe(75);
    expect(out[0]!.plateau).toBe('undecidable');
    expect(out[0]!.frailShare).toBeCloseTo(1 / 3);
    expect(out[0]!.inbreedMean).toBeCloseTo(0.1);
    expect(JSON.stringify(out)).not.toContain('"u"');
  });
});
