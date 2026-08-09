/**
 * §9.2 オッズ算出。★経済に直結するので「間違ったオッズを付けない」ことを測る。
 */
import {
  MARGIN,
  ODDS_CAP,
  TICKET_KINDS,
  debiasedProbability,
  minSellableProbability,
  requiredOddsTrials,
  type TicketKind,
} from '@star/betting';
import { describe, expect, it } from 'vitest';
import { ODDS_MC_TRIALS, buildOddsRows, keyToSelection, winningKeys } from '../src/odds.js';
import { toCycleIndexes } from '../src/pg-store.js';

const counts = (kind: TicketKind, entries: [string, number][]) =>
  new Map<TicketKind, ReadonlyMap<string, number>>([[kind, new Map(entries)]]);

describe('§9.2 オッズ算出', () => {
  it('★試行数は D-035 の設計式から決まる（数値リテラルを置かない）', () => {
    // M ≧ λ* × ODDS_CAP / (1 − margin)。律速は三連単（上限 100,000倍）
    expect(ODDS_MC_TRIALS).toBe(requiredOddsTrials());
    expect(ODDS_MC_TRIALS).toBe(3_896_104);
    // ★正典 §9.2 の 10,000 では足りない（三連単で −20.90pt）
    expect(ODDS_MC_TRIALS).toBeGreaterThan(10_000);
  });

  it('★D-035: p_min 未満の目は行が作られない（売らない）', () => {
    const M = ODDS_MC_TRIALS;
    // win の p_min = 0.82/500 = 1.64e-3。M·p_min = 6,389 回が境界
    const boundary = Math.ceil(M * minSellableProbability('win'));
    const rows = buildOddsRows(
      counts('win', [['1', boundary], ['2', boundary - 1], ['3', M / 2]]),
      M,
    );
    // ★境界の両側を見る（R-2）。ちょうどは売る、1つ下は売らない
    expect(rows.map((r) => r.selection[0]!).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('★D-035 の下では配当上限に当たる目が存在しない（capped が立たない）', () => {
    const M = ODDS_MC_TRIALS;
    for (const kind of TICKET_KINDS) {
      const boundary = Math.ceil(M * minSellableProbability(kind));
      // 売られる最小の目でも上限を超えない
      const [row] = buildOddsRows(counts(kind, [['7', boundary]]), M);
      expect(row, `${kind} の境界の目が売られていない`).toBeDefined();
      expect(row!.odds).toBeLessThanOrEqual(ODDS_CAP[kind]);
      expect(row!.capped, `${kind} で上限に当たった`).toBe(false);
    }
  });

  it('★オッズ = (1/p_eff) × (1 − margin)（D-013 の割り戻し込み）', () => {
    const [row] = buildOddsRows(counts('win', [['3', 2000]]), 10_000);
    expect(row!.probability).toBeCloseTo(0.2, 10);
    // ★保存するのは素の p̂。補正はオッズにだけ効く（表示する確率まで動かさない）
    expect(row!.odds).toBeCloseTo((1 - MARGIN.win) / debiasedProbability(0.2, 10_000), 10);
    expect(row!.odds).toBeLessThan(5 * (1 - MARGIN.win));
    expect(row!.capped).toBe(false);
  });

  it('★売る下限は推定の天井 1/M ではなく p_min（D-035 が先に効く）', () => {
    // ★D-035 の前は「推定できる最小確率 1/M」が実質の下限で、
    //   券種によっては §9.4 の上限に**届かないまま**稀な目を売っていた。
    //   いまは p_min が必ず先に効く（p_min ≫ 1/M）。
    const M = ODDS_MC_TRIALS;
    for (const kind of TICKET_KINDS) {
      expect(minSellableProbability(kind), `${kind}`).toBeGreaterThan(1 / M);
      // c=1（MC で1回だけ出た目）は、どの券種でも売られない
      expect(buildOddsRows(counts(kind, [['9', 1]]), M), `${kind}`).toEqual([]);
    }
  });

  it('★MC で出なかった目は売らない（cap を付けて売らない）', () => {
    // 出なかった目はそもそも counts に現れない → 行が作られない
    const rows = buildOddsRows(counts('win', [['1', 5000], ['2', 5000]]), 10_000);
    expect(rows.map((r) => r.selection[0]).sort()).toEqual([1, 2]);
    // ★売ると「絶対に当たらないはずの目」に賭けさせ、当たれば cap を払うことになる
  });

  it('★上限に当たる目は行が作られない（D-035 で「頭打ちにして売る」をやめた）', () => {
    // 以前はここで capped=true・odds=cap の行を作っていた。
    // ★それは「当たっても切り詰められた配当しか払わない馬券」を売る実装だった。
    //   D-035 では**売らない**ので、行そのものが存在しない。
    const rows = buildOddsRows(counts('win', [['9', 1]]), 10_000);
    expect(rows).toEqual([]);
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

describe('★pg が bigint を文字列で返す件（cycle_index）', () => {
  it('★文字列で返っても数値になる', () => {
    // ★`pg` は bigint を文字列で返す。`number[]` と型付けしたまま素通しすると、
    //   型は通るのに中身は文字列で、数値比較した瞬間に静かに外れる。
    //   実 DB を叩く verify-overdue.mjs でこれに当たった（偽ストアでは絶対に出ない）。
    expect(toCycleIndexes([{ cycle_index: '900002' }, { cycle_index: 7 }])).toEqual([900002, 7]);
  });

  it('★数値にできないものは黙って通さない', () => {
    expect(() => toCycleIndexes([{ cycle_index: 'abc' }])).toThrow();
  });
});
