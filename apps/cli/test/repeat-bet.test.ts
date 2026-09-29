/**
 * ★**続けて投票**（★2026-09-29・オーナー「毎回たずねる」・レビュー側の裁定・★デザイナー R-22 の指摘で「受け付けた直後だけ」に差し替え）
 *
 * 【★見ている壊れ方】
 *   ① ★結果の後に出る（★当たり外れで見た目を同じにしても「結果を見て、もう一度」＝追い賭けの流れ）
 *      → ★この仕組みは ★結果（当たり外れ・払戻・確定したか）を ★一切読まない（★型にも画面にも無い）
 *   ② ★自動で買う（★予定は券種を揃えるだけ・★「投票する」を押すまで買わない）
 *   ③ ★上限（続けて 3 回）が効かない
 *   ④ ★残高が足りないのに出す（★黙って消さない＝「足りない」と出す）
 *   ⑤ ★予定を作ったレースそのもの・締切後に 予定を当てる
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nextRepeatStreak, offerAfterAccept, planAppliesTo } from '../../web/src/lib/repeat-bet';
import { REPEAT_BET_MAX } from '../../web/src/lib/claims';

const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const LIB = strip(readFileSync(path.resolve(__dirname, '../../web/src/lib/repeat-bet.ts'), 'utf8'));
const VOTE = readFileSync(path.resolve(__dirname, '../../web/src/app/vote/page.tsx'), 'utf8');

describe('★続けて投票（受け付けた直後だけ）', () => {
  it('★受け付けた直後に 同じ券種・同じ額で出す', () => {
    expect(offerAfterAccept({ betType: 'place', amount: 100, epBalance: 1000, streak: 0 }))
      .toEqual({ kind: 'offer', betType: 'place', amount: 100 });
  });

  it('★① 結果を一切読まない（★ライブラリにも /vote にも 当たり外れ・払戻・確定・前の投票を読む口が無い）', () => {
    expect(LIB).not.toMatch(/\bwon\b|\blost\b|payout|status|settled/);
    expect(strip(VOTE)).not.toMatch(/loadLastBet|from\('bets'\)|\bsettled\b|\bpayout\b/);
    /** ★案内（受け付けた直後）は ★投票を受け付けた所でだけ作られる */
    const setAt = VOTE.indexOf('setJustPlaced({ raceId: race.id, betType, streak });');
    expect(setAt, '★受け付けた所で 案内を作っていない').toBeGreaterThan(-1);
    expect(VOTE.lastIndexOf('const result = await placeBet(', setAt)).toBeGreaterThan(-1);
    expect(VOTE.match(/setJustPlaced\(\{/g)?.length).toBe(1);
  });

  it('★② 自動では買わない（★/vote で placeBet を呼ぶのは「投票する」の 1 か所だけ）', () => {
    expect(VOTE.match(/placeBet\(/g)?.length).toBe(1);
    expect(VOTE).toContain('const result = await placeBet({ raceId: race.id, betType, selection: [selected], amount: EP_PER_PICK, clientToken });');
  });

  it(`★③ 続けて ${REPEAT_BET_MAX} 回で止まり、自分で選び直して買えば 0 に戻る`, () => {
    expect(REPEAT_BET_MAX).toBe(3);
    let streak = 0;
    for (let i = 0; i < REPEAT_BET_MAX; i++) {
      expect(offerAfterAccept({ betType: 'win', amount: 100, epBalance: 1000, streak }).kind).toBe('offer');
      streak = nextRepeatStreak(streak, true);
    }
    expect(offerAfterAccept({ betType: 'win', amount: 100, epBalance: 1000, streak }).kind).toBe('limit');
    expect(nextRepeatStreak(streak, false)).toBe(0);
  });

  it('★④ 残高が足りなければ「足りない」を出す（★黙って消さない）', () => {
    expect(offerAfterAccept({ betType: 'win', amount: 100, epBalance: 99, streak: 0 })).toEqual({ kind: 'short', amount: 100 });
  });

  it('★⑤ 予定は 作ったレースの次にだけ・締切前にだけ・画面にある券種だけ当てる', () => {
    const plan = { afterRaceId: 'r1', betType: 'place' };
    const base = { currentRaceId: 'r2', salesClosed: false, betTypes: ['win', 'place'] };
    expect(planAppliesTo(plan, base)).toBe(true);
    expect(planAppliesTo(plan, { ...base, currentRaceId: 'r1' })).toBe(false);
    expect(planAppliesTo(plan, { ...base, salesClosed: true })).toBe(false);
    expect(planAppliesTo(plan, { ...base, currentRaceId: null })).toBe(false);
    expect(planAppliesTo({ ...plan, betType: 'trio' }, base)).toBe(false);
    expect(planAppliesTo(null, base)).toBe(false);
  });
});
