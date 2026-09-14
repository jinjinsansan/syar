/**
 * ★売る目の判定（D-035・D-096・AUDIT_FIX2 BF-5・2026-09-14）
 *
 * ★境界は両側を押さえる（R-2）。本番のオッズ表と V-10 が同じ述語を通ることは
 *   `apps/cli/test/v10-accounting.test.ts` が経路で固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  EVEN_ODDS_TENTHS,
  MARGIN,
  ODDS_CAP,
  TICKET_KINDS,
  debiasedProbability,
  minSellableProbability,
  oddsFromProbability,
  sellDecision,
} from '../src/index.js';

/** 本番と同じ MC 試行数（D-036・`requiredOddsTrials()`） */
const M = 3_896_104;

/** 切り捨て前のオッズ（上限で頭打ちまで・`oddsFromProbability` と同じ式） */
const unrounded = (k: (typeof TICKET_KINDS)[number], p: number): number =>
  Math.min(ODDS_CAP[k], (1 / debiasedProbability(p, M)) * (1 - MARGIN[k]));

describe('D-035・D-096 売る目の判定（sellDecision）', () => {
  it('★D-035 の境界（両側）: p_min ちょうどは売る ／ すぐ下は売らない', () => {
    for (const k of TICKET_KINDS) {
      const pMin = minSellableProbability(k);
      expect(sellDecision(k, pMin, M), k).toBe('sell');
      expect(sellDecision(k, pMin * (1 - 1e-9), M), k).toBe('below_min_probability');
    }
  });

  it('★D-096 の境界（両側）: 切り捨て前が 1.0 ちょうど・浮動小数で 1.0 のすぐ下に表されたもの → 売る ／ 1.0 のわずかに下 → 売らない', () => {
    for (const k of TICKET_KINDS) {
      const m = MARGIN[k];
      // (1 − m) / (p + (1 − p) / M) = 1 を p について解く
      const pEven = (1 - m - 1 / M) / (1 - 1 / M);
      expect(Math.abs(unrounded(k, pEven) - 1), k).toBeLessThan(1e-12);
      expect(sellDecision(k, pEven, M), k).toBe('sell');

      // ★浮動小数で 1.0 のすぐ下に表された形（素直に切り捨てると 0.9 になる）も売る
      const pRepr = pEven * (1 + 1e-13);
      expect(Math.floor(unrounded(k, pRepr) * 10), k).toBe(9); // この検査の存在意義
      expect(sellDecision(k, pRepr, M), k).toBe('sell');

      // 許容幅の外で 1.0 を下回るものは売らない
      const pBelow = pEven * (1 + 1e-5);
      expect(unrounded(k, pBelow), k).toBeLessThan(1);
      expect(sellDecision(k, pBelow, M), k).toBe('below_even_odds');
    }
  });

  it('★D-035 を先に判定する（確率が低すぎる目は、1.0 倍の判定に進まない）', () => {
    for (const k of TICKET_KINDS) {
      expect(sellDecision(k, minSellableProbability(k) / 2, M), k).toBe('below_min_probability');
    }
  });

  it('NaN・0・負の確率は売らない（判定不能を「売る」に倒さない・R-3）', () => {
    for (const k of TICKET_KINDS) {
      for (const p of [Number.NaN, 0, -0.1]) {
        expect(sellDecision(k, p, M), `${k} p=${p}`).toBe('below_min_probability');
      }
    }
  });

  it('★売る目のオッズは必ず 1.0 倍以上・上限以下（p_min〜1 を対数で等間隔に 2,001 点）', () => {
    let sold = 0;
    let violations = 0;
    for (const k of TICKET_KINDS) {
      const pMin = minSellableProbability(k);
      for (let i = 0; i <= 2_000; i += 1) {
        const p = Math.min(1, pMin * Math.pow(1 / pMin, i / 2_000));
        if (sellDecision(k, p, M) !== 'sell') continue;
        sold += 1;
        const odds = oddsFromProbability(k, p, M);
        if (Math.round(odds * 10) < EVEN_ODDS_TENTHS || odds > ODDS_CAP[k]) violations += 1;
      }
    }
    expect(sold).toBeGreaterThan(0); // 空振りしていない
    expect(violations).toBe(0);
  });

  it('D-096 の境界値は 1.0 倍（正典の写し）', () => {
    expect(EVEN_ODDS_TENTHS).toBe(10);
  });
});
