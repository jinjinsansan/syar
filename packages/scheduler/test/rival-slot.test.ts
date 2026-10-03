/**
 * ★**ライバル枠の判定**（★正典 D-131・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §4・§8・§9）。
 *   ★p と 余裕の値は `apps/cli/src/rival-slot-sim.ts` で決めた（★線: 同じ窓に居る出走のうち 50% 以上）。
 */
import { describe, expect, it } from 'vitest';
import { CAREER_WEEKS, RIVAL_PACE_MARGIN, RIVAL_SLOT_P, rivalPaceLimit, rivalSlotFires } from '../src/index.js';

describe('★ライバル枠', () => {
  it('★窓に居なければ 働かない（★クラスを跨がせない・オーナー決定「追いついたら当たる」）', () => {
    expect(rivalSlotFires({ eligible: false, rivalStarts: 0, paceLimit: 100, u: 0 })).toBe(false);
  });

  it('★p の内側で働き 外側で働かない（★p ＝ 0.6）', () => {
    expect(RIVAL_SLOT_P).toBe(0.6);
    expect(rivalSlotFires({ eligible: true, rivalStarts: 0, paceLimit: 100, u: 0.59 })).toBe(true);
    expect(rivalSlotFires({ eligible: true, rivalStarts: 0, paceLimit: 100, u: 0.61 })).toBe(false);
  });

  it('★ペースの上限に届いたら 働かない（★u が 0 でも）', () => {
    expect(rivalSlotFires({ eligible: true, rivalStarts: 10, paceLimit: 10, u: 0 })).toBe(false);
    expect(rivalSlotFires({ eligible: true, rivalStarts: 9, paceLimit: 10, u: 0 })).toBe(true);
  });

  it('★齢に見合う数 × 余裕（★余裕 1.3・★現役の半ばなら 1 キャリアの半分 × 1.3）', () => {
    expect(RIVAL_PACE_MARGIN).toBe(1.3);
    expect(rivalPaceLimit({ activeWeeks: CAREER_WEEKS / 2, startsPerCareer: 26 })).toBeCloseTo(13 * 1.3, 9);
    // ★現役の前と 後は 端で止める
    expect(rivalPaceLimit({ activeWeeks: -5, startsPerCareer: 26 })).toBe(0);
    expect(rivalPaceLimit({ activeWeeks: CAREER_WEEKS * 3, startsPerCareer: 26 })).toBeCloseTo(26 * 1.3, 9);
  });

  it('★1 キャリアの出走数が読めなければ投げる（★既定値で埋めない・D-128）', () => {
    expect(() => rivalPaceLimit({ activeWeeks: 10, startsPerCareer: Number.NaN })).toThrow();
    expect(() => rivalPaceLimit({ activeWeeks: 10, startsPerCareer: 0 })).toThrow();
  });
});
