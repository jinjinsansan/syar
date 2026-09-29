/**
 * ★**続けて投票**（★2026-09-29・オーナー「毎回たずねる」・レビュー側の裁定「中立に」）
 *
 * 【★見ている壊れ方】
 *   ① ★当たったときだけ出る（★追い賭けの誘導）→ ★この層は当たり外れを ★受け取らない（★型に無い）
 *   ② ★確定前・同じレース・締切後に出る
 *   ③ ★上限（続けて 3 回）が効かない／★当たりの連続で数える
 *   ④ ★残高が足りないのに押せる（★黙って止めない＝「足りない」と出す）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nextRepeatStreak, repeatOfferOf, type LastBet } from '../../web/src/lib/repeat-bet';
import { REPEAT_BET_MAX } from '../../web/src/lib/claims';

const last: LastBet = { id: '1', raceId: 'r1', betType: 'place', amount: 100, settled: true };
const base = {
  last, currentRaceId: 'r2', salesClosed: false, epBalance: 1000, streak: 0,
  betTypes: ['win', 'place'] as const, stakeEP: 100,
};

describe('★続けて投票', () => {
  it('★確定した前の投票があれば、同じ券種・同じ額で出す', () => {
    expect(repeatOfferOf(base)).toEqual({ kind: 'offer', betType: 'place', amount: 100 });
  });

  it('★① 当たり外れを受け取らない（★LastBet に status・payout が無い・loadLastBet も返さない）', () => {
    const src = readFileSync(path.resolve(__dirname, '../../web/src/lib/repeat-bet.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bwon\b|\blost\b|payout|status/);
    const loader = readFileSync(path.resolve(__dirname, '../../web/src/lib/bet-screen.ts'), 'utf8');
    const body = loader.slice(loader.indexOf('export async function loadLastBet'), loader.indexOf('const RACE_COLUMNS'));
    expect(body).toContain("settled: row.status !== 'pending',");
    expect(body).not.toMatch(/payout|'won'|'lost'/);
  });

  it('★② 確定前・同じレース・締切後・受付中のレースが無い・別の券種・別の額 では出さない', () => {
    expect(repeatOfferOf({ ...base, last: { ...last, settled: false } }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, currentRaceId: 'r1' }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, salesClosed: true }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, currentRaceId: null }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, last: { ...last, betType: 'trio' } }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, last: { ...last, amount: 500 } }).kind).toBe('none');
    expect(repeatOfferOf({ ...base, last: null }).kind).toBe('none');
  });

  it(`★③ 続けて ${REPEAT_BET_MAX} 回で止まり、自分で選び直して買えば 0 に戻る`, () => {
    expect(REPEAT_BET_MAX).toBe(3);
    let streak = 0;
    for (let i = 0; i < REPEAT_BET_MAX; i++) {
      expect(repeatOfferOf({ ...base, streak }).kind).toBe('offer');
      streak = nextRepeatStreak(streak, true);
    }
    expect(repeatOfferOf({ ...base, streak }).kind).toBe('limit');
    expect(nextRepeatStreak(streak, false)).toBe(0);
  });

  it('★④ 残高が足りなければ「足りない」を出す（★黙って消さない）', () => {
    expect(repeatOfferOf({ ...base, epBalance: 99 })).toEqual({ kind: 'short', amount: 100 });
  });

  it('★自動では買わない（★/vote で placeBet を呼ぶのは「投票する」の 1 か所だけ）', () => {
    const vote = readFileSync(path.resolve(__dirname, '../../web/src/app/vote/page.tsx'), 'utf8');
    expect(vote.match(/placeBet\(/g)?.length).toBe(1);
    expect(vote).toContain('const result = await placeBet({ raceId: race.id, betType, selection: [selected], amount: EP_PER_PICK, clientToken });');
  });
});
