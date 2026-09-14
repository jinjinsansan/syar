/**
 * ★V-10 の集計と合否（AUDIT_FIX2 BF-5・BF-6・2026-09-14）
 *
 * ★測定器（V-10）と製品（本番のオッズ表）が**同じ「売る目」を見ていること自体**を検査で固定する（R-30）。
 */
import { describe, expect, it } from 'vitest';
import { MARGIN, TICKET_KINDS, minSellableProbability, type TicketKind } from '@star/betting';
import { ODDS_MC_TRIALS, buildOddsRows } from '../../worker/src/odds.js';
import {
  V10_SE_LIMIT,
  V10_TOLERANCE,
  accountRaceKind,
  emptyKindStat,
  judgeKind,
  mergeKindStat,
  type KindStat,
} from '../src/v10-accounting.js';

const M = ODDS_MC_TRIALS;

/**
 * 売る目・D-035 で売らない目・D-096 で売らない目が混ざった集計。
 *   '1' … p_min のすぐ下（D-035 で売らない）
 *   '2' … p_min ちょうど（売る）
 *   '3' … p = 0.05（売る）
 *   '4' … p = 0.95（どの券種でも 1 − margin を上回る → D-096 で売らない）
 */
function mixedCounts(kind: TicketKind): Map<string, number> {
  const atMin = Math.ceil(minSellableProbability(kind) * M);
  return new Map([
    ['1', atMin - 1],
    ['2', atMin],
    ['3', Math.round(M * 0.05)],
    ['4', Math.round(M * 0.95)],
  ]);
}

describe('BF-5 V-10 の賭け金は本番と同じ「売る目」', () => {
  it('★経路: 賭け金は、同じ counts から本番の buildOddsRows が作る行数と一致する（R-30）', () => {
    for (const kind of TICKET_KINDS) {
      const counts = mixedCounts(kind);
      const st = emptyKindStat();
      accountRaceKind(st, kind, counts, M, []);
      const rows = buildOddsRows(new Map([[kind, counts]]), M);
      expect(st.stake, kind).toBe(rows.length);
      // ★空振りしていない: 売る目と、両方の規則で売らない目が実際に混ざっている
      expect(st.stake, kind).toBe(2);
      expect(st.unsoldMinProbability.bets, kind).toBe(1);
      expect(st.unsoldEvenOdds.bets, kind).toBe(1);
    }
  });

  it('★売らなかった目は払わず、「売っていたら」を規則ごとに数える ／ MC で出なかった目は unseenHits', () => {
    const st = emptyKindStat();
    accountRaceKind(st, 'win', mixedCounts('win'), M, ['1', '3', '4', '9']);
    expect(st.unsoldMinProbability.hits).toBe(1); // '1'
    expect(st.unsoldEvenOdds.hits).toBe(1); // '4'
    expect(st.unseenHits).toBe(1); // '9'
    expect(st.unsoldMinProbability.payoutBeforeFloor).toBeGreaterThan(0);
    expect(st.unsoldEvenOdds.payoutBeforeFloor).toBeGreaterThan(0);
    expect(st.unsoldEvenOdds.payoutBeforeFloor).toBeLessThan(1); // 1.0 倍未満の目
    // ★払戻は売った '3' の分だけ
    const rows = buildOddsRows(new Map([['win', mixedCounts('win')]]), M);
    const odds3 = rows.find((r) => r.selection[0] === 3)!.odds;
    expect(st.payout).toBeCloseTo(odds3, 10);
    expect(st.races).toBe(1);
  });

  it('シードをまたいでプールしても件数と額が足し合わさる', () => {
    const a = emptyKindStat();
    const b = emptyKindStat();
    accountRaceKind(a, 'place', mixedCounts('place'), M, ['3']);
    accountRaceKind(b, 'place', mixedCounts('place'), M, ['3', '4']);
    mergeKindStat(a, b);
    expect(a.stake).toBe(4);
    expect(a.races).toBe(2);
    expect(a.unsoldEvenOdds.hits).toBe(1);
  });
});

/** 判定の検査用に、賭け金・払戻・切り捨ての損失だけを持つ集計を作る */
const statWith = (stake: number, payout: number, floorLoss: number): KindStat => ({
  ...emptyKindStat(),
  stake,
  payout,
  floorLoss,
});

describe('BF-6 V-10 の合否は切り捨て前の払戻率で出す（D-094）', () => {
  it('★切り捨て前が帯の内・切り捨て後が帯の外 → 合格', () => {
    const target = 1 - MARGIN.place; // 0.82
    // 切り捨て前 0.815（−0.5pt・帯の内）／ 切り捨て後 0.800（−2.0pt・帯の外）
    const v = judgeKind('place', statWith(1000, 800, 15));
    expect(v.rateBeforeFloor).toBeCloseTo(0.815, 12);
    expect(v.rateAfterFloor).toBeCloseTo(0.8, 12);
    expect(v.floorDiff).toBeCloseTo(-0.015, 12);
    expect(Math.abs(v.rateBeforeFloor - target)).toBeLessThanOrEqual(V10_TOLERANCE);
    expect(Math.abs(v.rateAfterFloor - target)).toBeGreaterThan(V10_TOLERANCE);
    expect(v.pass).toBe(true);
    expect(v.passAfterFloor).toBe(false);
  });

  it('★切り捨て前が帯の外 → 不合格（切り捨て後が帯の内でも）', () => {
    // 切り捨て前 0.835（+1.5pt・帯の外）／ 切り捨て後 0.825（+0.5pt・帯の内）
    const v = judgeKind('place', statWith(1000, 825, 10));
    expect(v.pass).toBe(false);
    expect(v.passAfterFloor).toBe(true);
  });

  it('賭け金 0 は不合格（判定不能を合格にしない・R-3）', () => {
    const v = judgeKind('win', emptyKindStat());
    expect(v.pass).toBe(false);
    expect(Number.isNaN(v.rateBeforeFloor)).toBe(true);
  });

  it('★出走表間 SD と SE（D-036）: レース 2 本未満は判定不能、SE が 0.25pt を超えたら届いていない', () => {
    const one = { ...statWith(10, 8, 0), raceRateSum: 0.8, raceRateSqSum: 0.64, races: 1 };
    expect(judgeKind('win', one).se).toBeNull();
    expect(judgeKind('win', one).seReached).toBe(false);

    // レースごとの払戻率 0.7 と 0.9（平均 0.8・SD = √0.02 ≒ 0.1414・SE = 0.1）
    const two = { ...statWith(20, 16, 0), raceRateSum: 1.6, raceRateSqSum: 0.49 + 0.81, races: 2 };
    const v2 = judgeKind('win', two);
    expect(v2.raceSd).toBeCloseTo(Math.sqrt(0.02), 12);
    expect(v2.se).toBeCloseTo(0.1, 12);
    expect(v2.seReached).toBe(false);

    // ばらつきが無ければ SE = 0 で届く
    const flat = { ...statWith(40, 32, 0), raceRateSum: 3.2, raceRateSqSum: 4 * 0.64, races: 4 };
    expect(judgeKind('win', flat).se).toBeCloseTo(0, 12);
    expect(judgeKind('win', flat).seReached).toBe(true);
    expect(V10_SE_LIMIT).toBe(0.0025);
  });
});
