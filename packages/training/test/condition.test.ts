/**
 * ★疲労と調子（§7.4）と、**§8b の介入ゲージへの接続**（B-6）。
 *
 *   正典 §8b.2:「**育成の仕上がりが操作の効きに直結する**」
 *   → 繋がっていなければ、この一文が**静かに成立しなくなります**
 *     （P1 で V-8 の盲点として出た形。いまは V-13 が守っています）。
 */
import { describe, expect, it } from 'vitest';
import { deriveRng } from '@star/sim-engine';
import { DEFAULT_INTERVENTION_BALANCE, initialStamina } from '@star/race-engine';
import {
  CAPPED_CONDITION_MAX, FATIGUE_CAPS_CONDITION_AT, FATIGUE_RACE_PENALTY_AT,
  applyFatigue, isRacePenalized, nextCondition, weeklyFatigue,
} from '../src/index.js';

describe('§7.4 疲労', () => {
  it('値域に収まる（負にならない・上限を超えない）', () => {
    expect(applyFatigue(10, -35)).toBe(0);
    expect(applyFatigue(95, 32)).toBe(100);
    expect(applyFatigue(50, 18)).toBe(68);
  });

  it('★休養で疲労が抜ける（§7.2 の -35 が効く）', () => {
    expect(applyFatigue(50, -35)).toBe(15);
  });
});

describe('§7.4 調子の再判定', () => {
  it('★疲労が増えるほど調子は下がる（傾向）', () => {
    const mean = (fatigue: number): number => {
      let s = 0;
      for (let i = 0; i < 500; i += 1) s += nextCondition(fatigue, deriveRng(1, 62, i));
      return s / 500;
    };
    expect(mean(0)).toBeGreaterThan(mean(30));
    expect(mean(30)).toBeGreaterThan(mean(60));
  });

  it('疲労70以上は調子2止まり（§7.4）', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(nextCondition(FATIGUE_CAPS_CONDITION_AT, deriveRng(2, 62, i)))
        .toBeLessThanOrEqual(CAPPED_CONDITION_MAX);
    }
  });

  it('★★この上限は一度も効かない（正典の式が先に効いている）', () => {
    // base = 3 - floor(fatigue/25) + rand(-1,+1) なので:
    //   疲労 50〜74 → 最大 3-2+1 = 2
    //   疲労 75〜99 → 最大 1
    // ★つまり疲労50以上では式そのものが既に2以下で、
    //   「疲労70以上は2止まり」という規定は**一度も適用されません**。
    //   照会中（Q-P3-6）。規定が意味を持つように変わったらここが落ちて気づけます。
    const formulaMax = (f: number): number =>
      Math.max(0, Math.min(5, 3 - Math.floor(f / 25) + 1));
    for (let f = FATIGUE_CAPS_CONDITION_AT; f <= 100; f += 1) {
      expect(formulaMax(f), `疲労${f}`).toBeLessThanOrEqual(CAPPED_CONDITION_MAX);
    }
    // ★上限が効くとしたら疲労49以下だが、そこには規定が掛かっていない
    expect(formulaMax(49)).toBeGreaterThan(CAPPED_CONDITION_MAX);
  });

  it('★0..5 の整数に収まる（段階値であること）', () => {
    for (const f of [0, 24, 25, 49, 50, 74, 75, 99, 100]) {
      for (let i = 0; i < 60; i += 1) {
        const c = nextCondition(f, deriveRng(4, 62, i));
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(5);
      }
    }
  });

  it('§7.4 疲労90以上で出走時ペナルティ（境界の両側）', () => {
    expect(isRacePenalized(FATIGUE_RACE_PENALTY_AT - 1)).toBe(false);
    expect(isRacePenalized(FATIGUE_RACE_PENALTY_AT)).toBe(true);
  });
});

describe('★B-6 §8b の介入ゲージ初期値に効いている', () => {
  const gauge = (condition: number, fatigue: number): number =>
    initialStamina(700, condition, fatigue, DEFAULT_INTERVENTION_BALANCE);

  it('★仕上げが良いほどゲージが高い（§8b.2「操作の効きに直結する」）', () => {
    // 絶好調・疲労なし  vs  絶不調・疲労満タン
    expect(gauge(5, 0)).toBeGreaterThan(gauge(0, 100));
  });

  it('★調子だけを動かしても効く（fatigue 固定）', () => {
    expect(gauge(5, 0)).toBeGreaterThan(gauge(3, 0));
    expect(gauge(3, 0)).toBeGreaterThan(gauge(1, 0));
  });

  it('★疲労だけを動かしても効く（condition 固定）', () => {
    expect(gauge(3, 0)).toBeGreaterThan(gauge(3, 80));
    // §8b.2 は max(0, fatigue-50)/2 なので、50以下では効かない
    expect(gauge(3, 50)).toBe(gauge(3, 0));
  });

  it('★P2 の固定値（condition=3 / fatigue=0）は「最良」ではなく中庸', () => {
    // ★固定したままだと、仕上げの巧拙が一切ゲージに出ない。
    //   固定値が中庸であることを示すことで、「差が出るはずの幅」を明示する。
    const fixed = gauge(3, 0);
    expect(gauge(5, 0)).toBeGreaterThan(fixed);
    expect(gauge(0, 100)).toBeLessThan(fixed);
  });
});

describe('★D-046 疲労の自然回復', () => {
  it('★軽め調整は実質マイナス（放置馬が慢性疲労にならない）', () => {
    // 軽め +4 − 自然回復5 = 実質 −1
    expect(weeklyFatigue(50, 4)).toBe(49);
  });

  it('★追い切りは実質プラス（強度に対して疲労がたまる関係が成立する）', () => {
    // 追い切り +32 − 5 = +27
    expect(weeklyFatigue(50, 32)).toBe(77);
  });

  it('★強度の順に疲労がたまる（D-046 が成立させた当たり前の関係）', () => {
    const light = weeklyFatigue(50, 4);
    const hill = weeklyFatigue(50, 18);
    const hard = weeklyFatigue(50, 32);
    expect(light).toBeLessThan(50); // 軽めは回復する
    expect(hill).toBeGreaterThan(light);
    expect(hard).toBeGreaterThan(hill);
  });

  it('値域から飛び出さない', () => {
    expect(weeklyFatigue(2, 4)).toBe(1);
    expect(weeklyFatigue(0, 4)).toBe(0);
    expect(weeklyFatigue(98, 32)).toBe(100);
  });
});
