/**
 * 正典 §9 の馬券。
 *
 * ★ここは**経済に直結する**（PP の発行量そのもの）ので、
 *   「動くこと」より「間違った払戻をしないこと」を測る。
 */

import { describe, expect, it } from 'vitest';
import {
  BET_LIMITS,
  MARGIN,
  MIN_STAKE,
  ODDS_CAP,
  TICKET_KINDS,
  ep,
  hitMultiplicity,
  isWellFormed,
  debiasedProbability,
  oddsFromProbability,
  placeDepth,
  settle,
  type RaceOutcome,
  type Selection,
  type Ticket,
} from '../src/index.js';

/** 1着=1番, 2着=2番, ... の素直な結果 */
const straight = (fieldSize = 12): RaceOutcome => ({
  order: Array.from({ length: fieldSize }, (_, i) => i + 1),
  fieldSize,
});

const bet = (selection: Selection, odds: number, stake = 100): Ticket => ({
  selection,
  stake: ep(stake),
  oddsAtPurchase: odds,
});

describe('§9.3 控除率・§9.4 上限が正典と一致している', () => {
  it('margin（単複0.18 / ワイド馬連馬単0.20 / 三連0.23）', () => {
    expect(MARGIN.win).toBe(0.18);
    expect(MARGIN.place).toBe(0.18);
    expect(MARGIN.quinella_place).toBe(0.2);
    expect(MARGIN.quinella).toBe(0.2);
    expect(MARGIN.exacta).toBe(0.2);
    expect(MARGIN.trio).toBe(0.23);
    expect(MARGIN.trifecta).toBe(0.23);
  });

  it('最高オッズ', () => {
    expect(ODDS_CAP.win).toBe(500);
    expect(ODDS_CAP.place).toBe(100);
    expect(ODDS_CAP.quinella_place).toBe(300);
    expect(ODDS_CAP.quinella).toBe(2000);
    expect(ODDS_CAP.exacta).toBe(4000);
    expect(ODDS_CAP.trio).toBe(10_000);
    expect(ODDS_CAP.trifecta).toBe(100_000);
  });

  it('ベット上限と最小単位', () => {
    expect(MIN_STAKE).toBe(100);
    expect(BET_LIMITS.PER_POINT).toBe(10_000);
    expect(BET_LIMITS.PER_RACE_KIND).toBe(30_000);
    expect(BET_LIMITS.PER_RACE_TOTAL).toBe(50_000);
    expect(BET_LIMITS.PER_DAY).toBe(500_000);
  });

  it('★券種は7種ちょうど（増減したら margin/cap の更新漏れを疑う）', () => {
    expect(TICKET_KINDS.length).toBe(7);
    for (const k of TICKET_KINDS) {
      expect(MARGIN[k], `${k} の margin`).toBeGreaterThan(0);
      expect(ODDS_CAP[k], `${k} の cap`).toBeGreaterThan(1);
    }
  });
});

/** テストで使う MC 試行数（§9.2 の 10,000 を写す。ここは較正定数ではない） */
const M = 10_000;

describe('§9.2 オッズ = (1/p_eff) × (1 − margin)', () => {
  it('★控除率のぶんだけ必ず 1/p を下回る（胴元が損しない）', () => {
    for (const k of TICKET_KINDS) {
      const p = 0.1;
      expect(oddsFromProbability(k, p, M)).toBeCloseTo(
        (1 / debiasedProbability(p, M)) * (1 - MARGIN[k]),
        10,
      );
      expect(oddsFromProbability(k, p, M)).toBeLessThan(1 / p);
    }
  });

  it('★上限で頭打ちになる（極小確率でも cap を超えない）', () => {
    for (const k of TICKET_KINDS) {
      expect(oddsFromProbability(k, 1e-12, M)).toBeLessThanOrEqual(ODDS_CAP[k]);
      // 確率0・負・NaN でも壊れず cap を返す（オッズが Infinity になると配当が壊れる）
      expect(oddsFromProbability(k, 0, M)).toBe(ODDS_CAP[k]);
      expect(oddsFromProbability(k, Number.NaN, M)).toBe(ODDS_CAP[k]);
    }
  });

  it('★D-013 の帰結: cap より先に「推定の天井」(1−margin)×M が効く券種がある', () => {
    // ★M=10,000 では p̂ ≧ 1/M しか出ないので、オッズは (1−margin)×M を超えられない。
    //   §9.4 の cap がこれより上にある券種では、**cap は到達不能**になる。
    //   これは補正が露わにした事実で、隠すと「cap が守っている」と読み違える。
    for (const k of TICKET_KINDS) {
      const ceiling = (1 - MARGIN[k]) * M;
      // p̂ = 1/M（MC で1回だけ出た目）が最大オッズを与える
      expect(oddsFromProbability(k, 1 / M, M)).toBeLessThanOrEqual(ceiling);
    }
    // 単勝 cap 500 は天井 8,200 より下 → cap が効く
    expect(oddsFromProbability('win', 1 / M, M)).toBe(500);
    // 三連単 cap 100,000 は天井 77,000 より上 → cap に届かない
    expect(oddsFromProbability('trifecta', 1 / M, M)).toBeLessThan(100_000);
  });
});

describe('★D-013 モンテカルロ推定量のバイアスを導出式で打ち消す', () => {
  it('★レビュー側の割り戻し式と p_eff 形が一致する（式変形が正しい）', () => {
    // odds = (1/p̂)(1−margin) / (1 + (1−p̂)/(M·p̂))  ⇔  odds = (1−margin)/(p̂ + (1−p̂)/M)
    for (const k of TICKET_KINDS) {
      for (const pHat of [0.5, 0.1, 0.01, 0.002, 1 / M]) {
        const divided = ((1 / pHat) * (1 - MARGIN[k])) / (1 + (1 - pHat) / (M * pHat));
        expect(oddsFromProbability(k, pHat, M)).toBeCloseTo(Math.min(ODDS_CAP[k], divided), 9);
      }
    }
  });

  it('★稀な目ほど補正が大きい（裾に寄与が集中していた実測と整合）', () => {
    // 補正率 = 補正後オッズ / 補正前オッズ。小さい p̂ ほど 1 から離れる
    const ratio = (pHat: number): number => pHat / debiasedProbability(pHat, M);
    expect(ratio(0.5)).toBeGreaterThan(ratio(0.05));
    expect(ratio(0.05)).toBeGreaterThan(ratio(0.005));
    // p̂ = 1/M（MC で1回だけ出た目）は約半分になる
    expect(ratio(1 / M)).toBeCloseTo(0.5, 2);
    // 確実な目（p̂=1）には補正が要らない
    expect(ratio(1)).toBe(1);
  });

  it('★試行数 M を宣言しない呼び出しはできない（既定値を持たせない）', () => {
    // 別の M で推定した確率に誤った補正が当たっても、既定値があると気づけない
    expect(() => debiasedProbability(0.1, 0)).toThrow();
    expect(() => debiasedProbability(0.1, Number.NaN)).toThrow();
  });

  it('★振る舞い: 期待払戻率が (1 − margin) に寄る（R-14）', () => {
    // ★乱数を使わず**二項分布で厳密に**期待値を取る。
    //   真の勝率 p の馬に1点賭けたときの期待払戻は
    //     Σ_c P(c) × p × odds(c/M)    （c=0 は売られないので除く）
    //   オッズが正しければ (1 − margin) になる。
    const MT = 200; // 厳密計算できる大きさに落とす（補正の式は M に依らない）
    const expected = (p: number, corrected: boolean): number => {
      let acc = 0;
      let logPmf = MT * Math.log(1 - p); // c = 0
      for (let c = 1; c <= MT; c += 1) {
        logPmf += Math.log((MT - c + 1) / c) + Math.log(p) - Math.log(1 - p);
        const pHat = c / MT;
        const used = corrected ? debiasedProbability(pHat, MT) : pHat;
        acc += Math.exp(logPmf) * p * ((1 / used) * (1 - MARGIN.win));
      }
      return acc;
    };
    const target = 1 - MARGIN.win;
    for (const p of [0.3, 0.1, 0.05]) {
      const before = Math.abs(expected(p, false) - target);
      const after = Math.abs(expected(p, true) - target);
      // ★補正後のほうが目標に近い、かつ残差が控除率の 1% 未満
      expect(after).toBeLessThan(before);
      expect(after).toBeLessThan(0.01 * target);
    }
  });
});

describe('§9.1 的中判定', () => {
  const o = straight(12);

  it('単勝・複勝', () => {
    expect(hitMultiplicity({ kind: 'win', horses: [1] }, o)).toBe(1);
    expect(hitMultiplicity({ kind: 'win', horses: [2] }, o)).toBe(0);
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, o)).toBe(1);
    expect(hitMultiplicity({ kind: 'place', horses: [4] }, o)).toBe(0);
  });

  it('★7頭以下は複勝・ワイドが2着まで（§9.1 の慣行）', () => {
    expect(placeDepth(12)).toBe(3);
    expect(placeDepth(8)).toBe(3);
    expect(placeDepth(7)).toBe(2);
    const small = straight(7);
    expect(hitMultiplicity({ kind: 'place', horses: [2] }, small)).toBe(1);
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, small)).toBe(0);
    expect(hitMultiplicity({ kind: 'quinella_place', horses: [1, 3] }, small)).toBe(0);
    expect(hitMultiplicity({ kind: 'quinella_place', horses: [1, 2] }, small)).toBe(1);
  });

  it('順不同の券種は並び順で結果が変わらない', () => {
    for (const kind of ['quinella_place', 'quinella', 'trio'] as const) {
      const hs = kind === 'trio' ? [1, 2, 3] : [1, 2];
      const a = hitMultiplicity({ kind, horses: hs }, o);
      const b = hitMultiplicity({ kind, horses: [...hs].reverse() }, o);
      expect(a, kind).toBe(b);
      expect(a).toBe(1);
    }
  });

  it('★馬単・三連単は着順通りでないと外れる', () => {
    expect(hitMultiplicity({ kind: 'exacta', horses: [1, 2] }, o)).toBe(1);
    expect(hitMultiplicity({ kind: 'exacta', horses: [2, 1] }, o)).toBe(0);
    expect(hitMultiplicity({ kind: 'trifecta', horses: [1, 2, 3] }, o)).toBe(1);
    expect(hitMultiplicity({ kind: 'trifecta', horses: [1, 3, 2] }, o)).toBe(0);
  });

  it('買い目の形を検査する（重複・頭数・範囲外）', () => {
    expect(isWellFormed({ kind: 'quinella', horses: [1, 1] }, 12)).toBe(false);
    expect(isWellFormed({ kind: 'quinella', horses: [1] }, 12)).toBe(false);
    expect(isWellFormed({ kind: 'win', horses: [13] }, 12)).toBe(false);
    expect(isWellFormed({ kind: 'trifecta', horses: [1, 2, 3] }, 12)).toBe(true);
  });
});

describe('§9.1 払戻・返還', () => {
  it('的中は PP で払い、外れは何も出ない', () => {
    const o = straight();
    const hit = settle(bet({ kind: 'win', horses: [1] }, 3.5), o);
    expect(hit.payout).toBe(350);
    expect(hit.refund).toBe(0);
    const miss = settle(bet({ kind: 'win', horses: [2] }, 3.5), o);
    expect(miss.payout).toBe(0);
    expect(miss.refund).toBe(0);
  });

  it('★払戻は購入時オッズだけを使う（後からオッズを直しても変わらない）', () => {
    const o = straight();
    // 同じ買い目でも、購入時オッズが違えば配当が違う
    expect(settle(bet({ kind: 'win', horses: [1] }, 2.0), o).payout).toBe(200);
    expect(settle(bet({ kind: 'win', horses: [1] }, 9.9), o).payout).toBe(990);
  });

  it('★取消・除外を含む馬券は全額返還（EP で返す）', () => {
    const o: RaceOutcome = { ...straight(), scratched: [1] };
    const s = settle(bet({ kind: 'win', horses: [1] }, 3.5, 500), o);
    expect(s.refunded).toBe(true);
    expect(s.refund).toBe(500);
    expect(s.payout).toBe(0);
  });

  it('★的中の形でも取消を含めば返還（判定順序が逆だと過払いになる）', () => {
    // 1番は1着だが取消扱い。返還を先に判定しないと「当たり」として払ってしまう
    const o: RaceOutcome = { ...straight(), scratched: [1] };
    expect(settle(bet({ kind: 'win', horses: [1] }, 3.5), o).payout).toBe(0);
  });

  it('★同着は配当を均等分割する（切り捨て・発行超過を防ぐ）', () => {
    const o: RaceOutcome = { order: [1, 2, 3, 4], fieldSize: 4, deadHeats: [[1, 2]] };
    // 1番と2番が同着1着 → 単勝は2分割
    const s = settle(bet({ kind: 'win', horses: [1] }, 3.5, 100), o);
    expect(s.hit).toBe(true);
    expect(s.payout).toBe(175);
    // 切り捨て: 100 × 3.33 ÷ 2 = 166.5 → 166
    expect(settle(bet({ kind: 'win', horses: [2] }, 3.33, 100), o).payout).toBe(166);
  });

  it('★払戻が購入額×オッズを超えない（丸めで発行超過しない）', () => {
    const o = straight();
    for (const odds of [1.1, 2.7, 3.33, 99.99]) {
      const s = settle(bet({ kind: 'win', horses: [1] }, odds, 300), o);
      expect(s.payout).toBeLessThanOrEqual(300 * odds);
    }
  });
});

describe('★§9.4 配当上限が実際に効いている（R-14 の振る舞い側）', () => {
  // ★閾値に ODDS_CAP 自身を使わない（使うと定数を動かしたときテストも一緒に動き、
  //   「守られている」が空振りになる。D-018 で潰した自己検出）。正典の数字をリテラルで置く。
  it('★万に一つの目でも券種ごとの上限を超えて払わない', () => {
    const oneInAMillion = 1e-6;
    expect(oddsFromProbability('win', oneInAMillion, M)).toBeLessThanOrEqual(500);
    expect(oddsFromProbability('place', oneInAMillion, M)).toBeLessThanOrEqual(100);
    expect(oddsFromProbability('quinella_place', oneInAMillion, M)).toBeLessThanOrEqual(300);
    expect(oddsFromProbability('quinella', oneInAMillion, M)).toBeLessThanOrEqual(2000);
    expect(oddsFromProbability('exacta', oneInAMillion, M)).toBeLessThanOrEqual(4000);
    expect(oddsFromProbability('trio', oneInAMillion, M)).toBeLessThanOrEqual(10_000);
    expect(oddsFromProbability('trifecta', oneInAMillion, M)).toBeLessThanOrEqual(100_000);
  });

  it('★上限に達した1本の払戻が PP 発行を跳ねさせない', () => {
    // 上限を外すと、10,000 EP の三連単1本で 10^13 PP が発行されうる。
    // 経済が壊れる経路なので、払戻額そのもので押さえる。
    const odds = oddsFromProbability('trifecta', 1e-12, M);
    const payout = settle(bet({ kind: 'trifecta', horses: [1, 2, 3] }, odds, 10_000), straight())
      .payout;
    expect(payout).toBeLessThanOrEqual(10_000 * 100_000);
  });

  it('★上限に達しない確率では上限を返さない（cap が常時発動していない）', () => {
    // 常に cap を返す実装でも上の2件は通ってしまう。効いていない状態も検出する。
    // ★補正後の値。0.1 → p_eff = 0.1 + 0.9/10000、0.001 → 0.001 + 0.999/10000
    expect(oddsFromProbability('win', 0.1, M)).toBeCloseTo(0.82 / (0.1 + 0.9 / M), 10);
    expect(oddsFromProbability('trifecta', 0.001, M)).toBeCloseTo(0.77 / (0.001 + 0.999 / M), 10);
  });
});
