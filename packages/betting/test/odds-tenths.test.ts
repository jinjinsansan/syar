/**
 * ★オッズの 0.1 単位（監査 H-1・H-2 ／ 指示書 AF-1・AF-2・2026-09-14）
 *
 * ★払戻は PP の発行そのもの。**少ない側も多い側も**、整数の正解と完全に一致することを測る（R-2）。
 *   以前の検査（払戻 ≦ 購入額 × オッズ）は上側しか見ておらず、1 PP 少なく払う誤りを捕まえられなかった（裁定 §3-2）。
 */
import { describe, expect, it } from 'vitest';
import {
  MARGIN,
  MAX_ODDS_TENTHS,
  ODDS_CAP,
  ODDS_GRID_EPSILON_TENTHS,
  TICKET_KINDS,
  debiasedProbability,
  ep,
  floorOddsToTenths,
  grossPayout,
  minSellableProbability,
  oddsFromProbability,
  oddsTenthsFromDecimalString,
  oddsTenthsFromNumber,
  settle,
  type RaceOutcome,
  type TicketKind,
} from '../src/index.js';

/** ★整数の正解。BigInt で計算し、浮動小数を 1 度も通さない（検査対象と別の算術で出す） */
const exact = (stake: number, tenths: number, mult: number): number =>
  Number((BigInt(stake) * BigInt(tenths)) / BigInt(10 * mult));

/** 1..12 番の素直な着順。先頭 `mult` 頭が同着 1 着（mult = 1 なら同着なし） */
const outcomeWithDeadHeat = (mult: number): RaceOutcome => {
  const order = Array.from({ length: 12 }, (_, i) => i + 1);
  return mult === 1 ? { order, fieldSize: 12 } : { order, fieldSize: 12, deadHeats: [order.slice(0, mult)] };
};

/** 購入額 100〜10,000（100 刻み） */
const STAKES = Array.from({ length: 100 }, (_, i) => (i + 1) * 100);
const MULTS = [1, 2, 3] as const;

describe('AF-1 払戻を整数だけで計算する（監査 H-1）', () => {
  it('★総当たり: 購入額 100〜10,000 × tenths 10〜9,999 × 同着 1・2・3 で、整数の正解と完全に一致する', () => {
    let checked = 0;
    let wrong = 0;
    const samples: string[] = [];
    for (const mult of MULTS) {
      for (const stake of STAKES) {
        for (let tenths = 10; tenths <= 9_999; tenths += 1) {
          const got = grossPayout(stake, tenths, mult);
          const want = exact(stake, tenths, mult);
          checked += 1;
          if (got !== want) {
            wrong += 1;
            if (samples.length < 5) samples.push(`stake=${stake} odds=${tenths / 10} mult=${mult}: ${got} ≠ ${want}`);
          }
        }
      }
    }
    // ★等号でしか通らない（少ない側も多い側も落ちる）
    expect(checked).toBe(3 * 100 * 9_990);
    expect(wrong, samples.join('\n')).toBe(0);
  }, 60_000);

  it('★settle（数値のオッズ = tenths / 10）を通しても一致する（購入額 4 通り × 同着 3 通り × tenths 全部）', () => {
    let wrong = 0;
    const samples: string[] = [];
    for (const mult of MULTS) {
      const o = outcomeWithDeadHeat(mult);
      for (const stake of [100, 300, 700, 10_000]) {
        for (let tenths = 10; tenths <= 9_999; tenths += 1) {
          const got = settle(
            { selection: { kind: 'win', horses: [1] }, stake: ep(stake), oddsAtPurchase: tenths / 10 },
            o,
          ).payout;
          const want = exact(stake, tenths, mult);
          if (got !== want) {
            wrong += 1;
            if (samples.length < 5) samples.push(`stake=${stake} odds=${tenths / 10} mult=${mult}: ${got} ≠ ${want}`);
          }
        }
      }
    }
    expect(wrong, samples.join('\n')).toBe(0);
  }, 60_000);

  it('★変換の往復: tenths 0〜999,999 のすべてで、数値 → tenths・十進の文字列 → tenths が元に戻る', () => {
    let wrong = 0;
    for (let t = 0; t < 1_000_000; t += 1) {
      const text = `${Math.floor(t / 10)}.${t % 10}`;
      if (oddsTenthsFromNumber(t / 10) !== t || oddsTenthsFromDecimalString(text) !== t) wrong += 1;
    }
    expect(wrong).toBe(0);
  }, 60_000);

  it('境界: 100 × 2.3 = 230（以前は 229）／ 同着 3 等分は切り捨て', () => {
    // ★以前の式がここで 1 PP 少なかったことを、テスト自身の中で示す（この検査の存在意義）
    expect(Math.floor(100 * 2.3)).toBe(229);
    expect(grossPayout(100, 23, 1)).toBe(230);
    expect(oddsTenthsFromDecimalString('2.3')).toBe(23);
    expect(
      settle({ selection: { kind: 'win', horses: [1] }, stake: ep(100), oddsAtPurchase: 2.3 }, outcomeWithDeadHeat(1)).payout,
    ).toBe(230);
    // 100 × 3.5 ÷ 3 = 116.66… → 116（発行超過しない）
    expect(grossPayout(100, 35, 3)).toBe(116);
    expect(
      settle({ selection: { kind: 'win', horses: [1] }, stake: ep(100), oddsAtPurchase: 3.5 }, outcomeWithDeadHeat(3)).payout,
    ).toBe(116);
  });

  it('★0.1 単位に乗らない値・解釈できない値は例外（黙って丸めない・R-3）', () => {
    const o = outcomeWithDeadHeat(1);
    for (const odds of [3.33, 99.99, Number.NaN, Number.POSITIVE_INFINITY, -2.3]) {
      expect(
        () => settle({ selection: { kind: 'win', horses: [1] }, stake: ep(100), oddsAtPurchase: odds }, o),
        String(odds),
      ).toThrow();
    }
    for (const text of ['3.33', '99.99', 'NaN', 'abc', '', ' 2.3', '2.', '.3', '-2.3', '02.3', '1e2', '100000000.0']) {
      expect(() => oddsTenthsFromDecimalString(text), JSON.stringify(text)).toThrow();
    }
    // ★numeric(9,1) が返す形は読める
    expect(oddsTenthsFromDecimalString('0.9')).toBe(9);
    expect(oddsTenthsFromDecimalString('2')).toBe(20);
    expect(oddsTenthsFromDecimalString('2.30')).toBe(23);
    expect(oddsTenthsFromDecimalString('99999999.9')).toBe(MAX_ODDS_TENTHS);
  });

  it('購入額・オッズ・同着数の不正は例外', () => {
    expect(() => grossPayout(100.5, 23, 1)).toThrow();
    expect(() => grossPayout(-100, 23, 1)).toThrow();
    expect(() => grossPayout(100, 2.3, 1)).toThrow();
    expect(() => grossPayout(100, 23, 0)).toThrow();
  });
});

describe('AF-2 オッズを 0.1 単位で切り捨てて返す（監査 H-2）', () => {
  /** 切り捨て前の値（頭打ちまで）。式は `balance.ts` の本文と同じ部品で組む */
  const unrounded = (k: TicketKind, p: number, trials: number): number =>
    Math.min(ODDS_CAP[k], (1 - MARGIN[k]) / debiasedProbability(p, trials));

  it('★戻り値は 0.1 単位に乗り、切り捨て前の値以下で、切り捨て前の値 − 0.1 より大きい（両側）', () => {
    let checked = 0;
    let offGrid = 0;
    let above = 0;
    let tooLow = 0;
    for (const trials of [10_000, 3_896_104]) {
      for (const k of TICKET_KINDS) {
        const pMin = minSellableProbability(k);
        for (let i = 0; i <= 2_000; i += 1) {
          // p_min〜1 を対数で等間隔に取る
          const p = Math.min(1, pMin * Math.pow(1 / pMin, i / 2_000));
          const got = oddsFromProbability(k, p, trials);
          const raw = unrounded(k, p, trials);
          checked += 1;
          try {
            oddsTenthsFromNumber(got);
          } catch {
            offGrid += 1;
          }
          if (got > raw + ODDS_GRID_EPSILON_TENTHS / 10) above += 1;
          if (!(got > raw - 0.1)) tooLow += 1;
        }
      }
    }
    expect(checked).toBe(2 * 7 * 2_001);
    expect({ offGrid, above, tooLow }).toEqual({ offGrid: 0, above: 0, tooLow: 0 });
  });

  it('★格子ちょうど（浮動小数で下側に表されたもの）は下げない ／ 格子のすぐ下は 1 段下げる（両側）', () => {
    const justBelowRepr = (23 - 1e-9) / 10; // 本来 2.3 のつもりが、誤差で下に表された形
    expect(Math.floor(justBelowRepr * 10)).toBe(22); // ★素直な切り捨てなら 1 段下がる（この検査の存在意義）
    expect(floorOddsToTenths(justBelowRepr)).toBe(23);
    expect(floorOddsToTenths(2.3 - 1e-6)).toBe(22); // 許容幅の外は、本当に下
    expect(floorOddsToTenths(2.3)).toBe(23);
    expect(floorOddsToTenths(2.3 + 1e-6)).toBe(23); // 上側は切り捨て
    expect(floorOddsToTenths(2.39999)).toBe(23);
  });

  it('★上限で頭打ち → 切り捨て。上限値は 0.1 単位に乗っているので、順序を入れ替えても結果は同じ', () => {
    for (const k of TICKET_KINDS) {
      expect(floorOddsToTenths(ODDS_CAP[k])).toBe(ODDS_CAP[k] * 10);
      // 上限を超える確率（p_min の 1/4）: 頭打ちの値そのもの
      const p = minSellableProbability(k) / 4;
      const trials = 1e12;
      const got = oddsFromProbability(k, p, trials);
      expect(got).toBe(ODDS_CAP[k]);
      // 切り捨ててから頭打ちにしても同じ値
      const raw = (1 - MARGIN[k]) / debiasedProbability(p, trials);
      expect(raw).toBeGreaterThan(ODDS_CAP[k]);
      expect(Math.min(ODDS_CAP[k], floorOddsToTenths(raw) / 10)).toBe(got);
    }
  });
});
