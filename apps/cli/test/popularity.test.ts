/**
 * O-2 / R-12: 人気推定のタイブレークが判定を作らないこと
 *
 * ★V-6 の PASS が測定の自由変数（試行回数）で決まっていた。原因は
 *   「0勝で並んだ馬を枠順で割っていた」こと。ここを固定する。
 */

import { describe, expect, it } from 'vitest';
import { PopularityEstimator, rankByPopularity } from '../src/popularity.js';

describe('人気順の決め方（O-2）', () => {
  it('勝利回数の降順が最優先', () => {
    const ranked = rankByPopularity([
      { horseId: 'A', wins: 3, meanRank: 5, index: 0 },
      { horseId: 'B', wins: 10, meanRank: 9, index: 1 },
      { horseId: 'C', wins: 7, meanRank: 1, index: 2 },
    ]);
    expect(ranked.map((r) => r.horseId)).toEqual(['B', 'C', 'A']);
  });

  it('★勝利回数が同数なら平均着順で割る（枠順では割らない）', () => {
    // 全員0勝。枠順で割ると A→B→C だが、平均着順なら C→A→B が正しい
    const ranked = rankByPopularity([
      { horseId: 'A', wins: 0, meanRank: 8.0, index: 0 },
      { horseId: 'B', wins: 0, meanRank: 9.5, index: 1 },
      { horseId: 'C', wins: 0, meanRank: 6.2, index: 2 },
    ]);
    expect(ranked.map((r) => r.horseId)).toEqual(['C', 'A', 'B']);
    // ★「最低人気」が最も外枠の馬になっていないこと（これが V-6 を壊していた）
    expect(ranked[ranked.length - 1]?.horseId).not.toBe('C');
  });

  it('勝利回数も平均着順も同じときだけ枠順で決める（決定論のため）', () => {
    const ranked = rankByPopularity([
      { horseId: 'B', wins: 0, meanRank: 5, index: 1 },
      { horseId: 'A', wins: 0, meanRank: 5, index: 0 },
    ]);
    expect(ranked.map((r) => r.horseId)).toEqual(['A', 'B']);
  });

  it('入力の並び順を変えても結果は同じ（安定ソート依存にしない）', () => {
    const samples = [
      { horseId: 'A', wins: 0, meanRank: 8.0, index: 0 },
      { horseId: 'B', wins: 2, meanRank: 4.0, index: 1 },
      { horseId: 'C', wins: 0, meanRank: 6.2, index: 2 },
      { horseId: 'D', wins: 2, meanRank: 3.1, index: 3 },
    ];
    const a = rankByPopularity(samples).map((r) => r.horseId);
    const b = rankByPopularity([...samples].reverse()).map((r) => r.horseId);
    expect(b).toEqual(a);
  });
});

describe('PopularityEstimator の集計（O-2）', () => {
  it('試行を重ねると勝利数と平均着順が積み上がる', () => {
    const est = new PopularityEstimator(['A', 'B', 'C']);
    est.addTrial(['A', 'B', 'C']);
    est.addTrial(['A', 'C', 'B']);
    est.addTrial(['B', 'A', 'C']);
    const ranked = est.rank();
    expect(ranked[0]?.horseId).toBe('A');
    expect(ranked[0]?.wins).toBe(2);
    // A の着順は 1,1,2 → 平均 4/3
    expect(ranked[0]?.meanRank).toBeCloseTo(4 / 3, 10);
  });

  it('★0勝の馬同士でも平均着順で順位が付く（V-6 が試行回数に依存しなくなる）', () => {
    const est = new PopularityEstimator(['A', 'B', 'C']);
    // A が常に勝ち、B は常に2着、C は常に3着 → B と C はどちらも0勝
    for (let i = 0; i < 20; i++) est.addTrial(['A', 'B', 'C']);
    const ranked = est.rank();
    expect(ranked.map((r) => r.horseId)).toEqual(['A', 'B', 'C']);
    expect(ranked[1]?.wins).toBe(0);
    expect(ranked[2]?.wins).toBe(0);
    // 最低人気は「最も弱い馬」であって「最も外枠の馬」ではない
    expect(ranked[2]?.horseId).toBe('C');
  });

  it('★枠順を逆にしても最低人気は変わらない（枠順が判定を作っていない）', () => {
    const forward = new PopularityEstimator(['A', 'B', 'C']);
    const reversed = new PopularityEstimator(['C', 'B', 'A']);
    for (let i = 0; i < 20; i++) {
      forward.addTrial(['A', 'B', 'C']);
      reversed.addTrial(['A', 'B', 'C']);
    }
    expect(reversed.rank()[2]?.horseId).toBe(forward.rank()[2]?.horseId);
  });

  it('試行0回でも例外にならない（ゼロ除算）', () => {
    const est = new PopularityEstimator(['A', 'B']);
    const ranked = est.rank();
    expect(ranked).toHaveLength(2);
    for (const r of ranked) expect(Number.isFinite(r.meanRank)).toBe(true);
  });
});
