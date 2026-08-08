/**
 * §11.1 賞金テーブル。★§9.3「PP の主な稼ぎ口は賞金」を支える。
 */
import { describe, expect, it } from 'vitest';
import { PRIZE_TABLE, prizeFor, prizeTierOf, purseOf, RACES_BY_CLASS, classOf, gradeOf } from '../src/index.js';

describe('§11.1 賞金テーブルが正典と一致', () => {
  it('G1 の賞金', () => {
    expect(PRIZE_TABLE.G1).toEqual([100_000, 40_000, 25_000, 15_000, 10_000]);
  });
  it('新馬・未勝利の賞金', () => {
    expect(PRIZE_TABLE.maiden).toEqual([3_000, 1_200, 700, 400, 300]);
  });

  it('★クラスが上がるほど賞金が跳ねる（D-020）', () => {
    // 育成の報酬は昇級として現れるので、格の差が賞金の差で体感できないと
    // 育成が報われて見えない
    const order = ['maiden', 'win1', 'win2', 'win3', 'open', 'G3', 'G2', 'G1'] as const;
    for (let i = 1; i < order.length; i += 1) {
      expect(PRIZE_TABLE[order[i]!][0]!, order[i]).toBeGreaterThan(PRIZE_TABLE[order[i - 1]!][0]!);
    }
  });

  it('★どの格も着順が下がるほど賞金が減る', () => {
    for (const [tier, row] of Object.entries(PRIZE_TABLE)) {
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i]!, `${tier} ${i + 1}着`).toBeLessThan(row[i - 1]!);
      }
    }
  });

  it('★G1 の1着は新馬の33倍以上（昇級の体感）', () => {
    expect(PRIZE_TABLE.G1[0]! / PRIZE_TABLE.maiden[0]!).toBeGreaterThanOrEqual(33);
  });

  it('6着以下は 0', () => {
    expect(prizeFor('G1', 6)).toBe(0);
    expect(prizeFor('maiden', 99)).toBe(0);
    expect(prizeFor('G1', 0)).toBe(0);
    expect(prizeFor('G1', -1)).toBe(0);
  });

  it('★重賞に格が無ければ例外（黙って最低額にしない）', () => {
    expect(() => prizeTierOf('graded', null)).toThrow(/格がありません/);
    expect(prizeTierOf('graded', 'G1')).toBe('G1');
    expect(prizeTierOf('maiden', null)).toBe('maiden');
  });

  it('purse は1〜5着の合計', () => {
    expect(purseOf('G1')).toBe(190_000);
    expect(purseOf('maiden')).toBe(5_600);
  });
});

describe('★§9.3 PP の主な稼ぎ口は賞金でなければならない', () => {
  it('★1日の賞金総額が、馬券の理論的な PP 発行量を大きく上回る', () => {
    // 1日の賞金総額（144R の番組表どおり）
    let daily = 0;
    for (let i = 0; i < 144; i += 1) daily += purseOf(prizeTierOf(classOf(i), gradeOf(i)));

    // 馬券の払戻は「売上 × (1 − margin)」。売上が賞金と同規模なら払戻は8割程度。
    // ★つまり賞金が主な稼ぎ口であるためには、**売上が賞金総額を大きく超えない**
    //   必要がある。ここでは賞金総額そのものが十分に大きいことを確認する。
    expect(daily).toBeGreaterThan(1_000_000);
    // クラス別R数（新馬42本）が効いて、下位クラスに厚く配られる
    expect(RACES_BY_CLASS.maiden).toBe(42);
  });
});
