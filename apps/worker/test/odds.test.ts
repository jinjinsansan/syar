/**
 * §9.2 オッズ算出。★経済に直結するので「間違ったオッズを付けない」ことを測る。
 */
import { MARGIN, ODDS_CAP, TICKET_KINDS, debiasedProbability, type TicketKind } from '@star/betting';
import { describe, expect, it } from 'vitest';
import { ODDS_MC_TRIALS, buildOddsRows, keyToSelection, winningKeys } from '../src/odds.js';

const counts = (kind: TicketKind, entries: [string, number][]) =>
  new Map<TicketKind, ReadonlyMap<string, number>>([[kind, new Map(entries)]]);

describe('§9.2 オッズ算出', () => {
  it('正典のモンテカルロ試行数は 10,000', () => {
    expect(ODDS_MC_TRIALS).toBe(10_000);
  });

  it('★オッズ = (1/p_eff) × (1 − margin)（D-013 の割り戻し込み）', () => {
    const [row] = buildOddsRows(counts('win', [['3', 2000]]), 10_000);
    expect(row!.probability).toBeCloseTo(0.2, 10);
    // ★保存するのは素の p̂。補正はオッズにだけ効く（表示する確率まで動かさない）
    expect(row!.odds).toBeCloseTo((1 - MARGIN.win) / debiasedProbability(0.2, 10_000), 10);
    expect(row!.odds).toBeLessThan(5 * (1 - MARGIN.win));
    expect(row!.capped).toBe(false);
  });

  it('★推定できる最小確率は 1/M なので、到達しうる最大オッズは (1−margin)×M', () => {
    // ★§9.4 の cap との関係が M で決まることを固定する。
    //   MC で1回だけ出た目（c=1）が最も高いオッズになる。
    const M = ODDS_MC_TRIALS;
    for (const kind of TICKET_KINDS) {
      const [row] = buildOddsRows(counts(kind, [['9', 1]]), M);
      const ceiling = (1 - MARGIN[kind]) * M;
      expect(row!.odds).toBeLessThanOrEqual(ceiling + 1e-6);
      // cap が天井より上にある券種では、cap は M=10,000 では**到達不能**になる
      if (ODDS_CAP[kind] > ceiling) expect(row!.capped).toBe(false);
    }
  });

  it('★MC で出なかった目は売らない（cap を付けて売らない）', () => {
    // 出なかった目はそもそも counts に現れない → 行が作られない
    const rows = buildOddsRows(counts('win', [['1', 5000], ['2', 5000]]), 10_000);
    expect(rows.map((r) => r.selection[0]).sort()).toEqual([1, 2]);
    // ★売ると「絶対に当たらないはずの目」に賭けさせ、当たれば cap を払うことになる
  });

  it('★上限に当たったら capped を立てる（§9.4 は表示への明示を求めている）', () => {
    const [row] = buildOddsRows(counts('win', [['9', 1]]), 10_000);
    expect(row!.odds).toBe(ODDS_CAP.win);
    expect(row!.capped).toBe(true);
  });

  it('試行数が0以下なら例外（ゼロ除算で Infinity のオッズを作らない）', () => {
    expect(() => buildOddsRows(counts('win', [['1', 1]]), 0)).toThrow(/試行数/);
  });

  it('★全券種で margin が効いている（どれかが素通りしていない）', () => {
    for (const k of TICKET_KINDS) {
      const [row] = buildOddsRows(counts(k, [['1-2-3', 1000]]), 10_000);
      expect(row!.odds, k).toBeLessThan(1 / 0.1);
    }
  });
});

describe('§9.1 的中目の導出', () => {
  const order = [5, 3, 8, 1, 9];

  it('券種ごとの的中目', () => {
    expect(winningKeys('win', order, 3)).toEqual(['5']);
    expect(winningKeys('place', order, 3)).toEqual(['5', '3', '8']);
    expect(winningKeys('quinella', order, 3)).toEqual(['3-5']);
    expect(winningKeys('exacta', order, 3)).toEqual(['5>3']);
    expect(winningKeys('trio', order, 3)).toEqual(['3-5-8']);
    expect(winningKeys('trifecta', order, 3)).toEqual(['5>3>8']);
  });

  it('★7頭以下は複勝圏が2着まで（§9.1）', () => {
    expect(winningKeys('place', order, 2)).toEqual(['5', '3']);
    expect(winningKeys('quinella_place', order, 2)).toEqual(['3-5']);
  });

  it('★キーと買い目が往復する（保存して読み戻せる）', () => {
    expect(keyToSelection('5')).toEqual([5]);
    expect(keyToSelection('3-5-8')).toEqual([3, 5, 8]);
    expect(keyToSelection('5>3>8')).toEqual([5, 3, 8]);
  });

  it('★順不同の券種はキーが昇順に正規化される（同じ組が2行にならない）', () => {
    expect(winningKeys('quinella', [3, 5], 3)).toEqual(['3-5']);
    expect(winningKeys('quinella', [5, 3], 3)).toEqual(['3-5']);
  });
});
