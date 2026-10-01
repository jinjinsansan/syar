/**
 * ★**投票の履歴・投票の控え の純関数**（★2026-10-01・デザイナー引き渡し ②）
 *   ★状態の札（4 つ・★「はずれ」と書かない）／★今月の 2 つの数（★日本時間の月・★返還は使っていない）／★受付番号（4 桁区切り）
 */
import { describe, expect, it } from 'vitest';
import {
  VOTE_STATE_LABEL, jstDayHeading, jstMonthKey, jstMonthStartMs, monthPointsOf, receiptNoOf, stakeBreakdownOf, ticketKindLabel, voteStateOf,
} from '../../web/src/lib/vote-history-view';

describe('★状態の札', () => {
  it('★bets.status の 4 つが 4 つの札になる', () => {
    expect(VOTE_STATE_LABEL[voteStateOf('pending')]).toBe('結果待ち');
    expect(VOTE_STATE_LABEL[voteStateOf('won')]).toBe('確定 ・ 的中');
    expect(VOTE_STATE_LABEL[voteStateOf('lost')]).toBe('確定');
    expect(VOTE_STATE_LABEL[voteStateOf('refunded')]).toBe('返還');
  });
  it('★「はずれ」と書かない', () => {
    expect(Object.values(VOTE_STATE_LABEL).join('')).not.toContain('はずれ');
  });
  it('★知らない状態を黙って読み替えない', () => {
    expect(() => voteStateOf('void')).toThrow();
  });
});

describe('★券種名', () => {
  it('★DB の wide はワイド・3 連は「3連」', () => {
    expect(ticketKindLabel('wide')).toBe('ワイド');
    expect(ticketKindLabel('trio')).toBe('3連複');
    expect(ticketKindLabel('trifecta')).toBe('3連単');
    expect(() => ticketKindLabel('bracket')).toThrow();
  });
});

describe('★今月の 2 つの数（★日本時間）', () => {
  /** ★2026-09-30 15:30 UTC = ★2026-10-01 00:30 JST */
  const oct1Jst = Date.UTC(2026, 8, 30, 15, 30);
  /** ★2026-09-30 14:30 UTC = ★2026-09-30 23:30 JST */
  const sep30Jst = Date.UTC(2026, 8, 30, 14, 30);
  const now = Date.UTC(2026, 9, 1, 3, 0);

  it('★月の境目は日本時間', () => {
    expect(jstMonthKey(oct1Jst)).toBe('2026-10');
    expect(jstMonthKey(sep30Jst)).toBe('2026-09');
    expect(jstMonthStartMs(now)).toBe(Date.UTC(2026, 8, 30, 15, 0));
  });

  it('★今月だけを数え、★返還は使った EP に入れない（★PP は payout だけ）', () => {
    const m = monthPointsOf([
      { createdAtMs: oct1Jst, status: 'won', amountEP: 100, payoutPP: 400 },
      { createdAtMs: oct1Jst, status: 'lost', amountEP: 200, payoutPP: 0 },
      { createdAtMs: oct1Jst, status: 'refunded', amountEP: 300, payoutPP: 0 },
      { createdAtMs: oct1Jst, status: 'pending', amountEP: 100, payoutPP: 0 },
      { createdAtMs: sep30Jst, status: 'won', amountEP: 1000, payoutPP: 5000 },
    ], now);
    expect(m).toEqual({ usedEP: 400, receivedPP: 400 });
  });

  it('★日の見出し（★今日なら「今日」）', () => {
    expect(jstDayHeading(oct1Jst, now)).toBe('今日 10/01（木）');
    expect(jstDayHeading(sep30Jst, now)).toBe('09/30（水）');
  });
});

describe('★受付番号（★投票の ID を 4 桁ずつ）', () => {
  it('★12 桁まで 0 で埋めて 4 桁区切り', () => {
    expect(receiptNoOf('12345')).toBe('0000-0001-2345');
    expect(receiptNoOf('1')).toBe('0000-0000-0001');
    expect(receiptNoOf('1234567890123')).toBe('0001-2345-6789-0123');
  });
  it('★数字でない番号は投げる', () => {
    expect(() => receiptNoOf('12a')).toThrow();
  });
});

describe('★EP の内訳', () => {
  it('★1 口の額で割る', () => {
    expect(stakeBreakdownOf(300)).toBe('3 口 × 100 EP');
  });
});
