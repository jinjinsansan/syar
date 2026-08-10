/**
 * ★故障（§7.5）。**プレイヤーの資産を毀損する**唯一の経路なので、
 *   正典の3つの約束を実装で守れているかを見ます:
 *     ① 馬を死なせない（致命的でも引退にとどめる）
 *     ② 恒久ダメージは potential を削る
 *     ③ ★何が永久に失われたかを明示する（D-045。黙って8%削るほうが理不尽）
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, deriveRng, type AbilityKey } from '@star/sim-engine';
import {
  AGE_FACTOR,
  INJURY_BASE_PROB,
  MODERATE_SP_LOSS,
  SEVERE_ALL_LOSS,
  SEVERE_DURABILITY_LOSS,
  SEVERITY_TABLE,
  ageFactor,
  applyInjury,
  hasPermanentLoss,
  injuryProbability,
  rollSeverity,
} from '../src/index.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

const state = { potential: rec(500), current: rec(480), durability: 650 };
const risk = { menu: 'hill' as const, fatigue: 40, durability: 650, injuryRateMult: 1, ageWeeks: 150 };

describe('§7.5 故障確率', () => {
  it('★正典の式どおり（各因子が効いている）', () => {
    const p = injuryProbability(risk);
    expect(p).toBeGreaterThan(0);
    expect(injuryProbability({ ...risk, fatigue: 90 })).toBeGreaterThan(p);
    expect(injuryProbability({ ...risk, durability: 900 })).toBeLessThan(p);
    expect(injuryProbability({ ...risk, injuryRateMult: 2 })).toBeCloseTo(p * 2, 10);
    expect(injuryProbability({ ...risk, ageWeeks: 260 })).toBeGreaterThan(p);
  });

  it('★休養では故障しない（menuIntensity 0）', () => {
    expect(injuryProbability({ ...risk, menu: 'rest', fatigue: 100 })).toBe(0);
  });

  it('★追い切りが最も危険（2.2 / プール 0.5）', () => {
    const hard = injuryProbability({ ...risk, menu: 'hard' });
    const pool = injuryProbability({ ...risk, menu: 'pool' });
    expect(hard / pool).toBeCloseTo(2.2 / 0.5, 6);
  });

  it('★durability が 0 でも壊れない（0 除算で Infinity にしない）', () => {
    const p = injuryProbability({ ...risk, durability: 0 });
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('確率は 0..1 に収まる（極端な入力でも）', () => {
    const p = injuryProbability({
      ...risk, menu: 'hard', fatigue: 100, durability: 1, injuryRateMult: 50, ageWeeks: 260,
    });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('§7.5 ageFactor は 208週 1.0 から 260週 1.6 の線形（境界の両側・R-2）', () => {
    expect(ageFactor(AGE_FACTOR.fromWeeks - 1)).toBe(1.0);
    expect(ageFactor(AGE_FACTOR.fromWeeks)).toBe(1.0);
    expect(ageFactor(234)).toBeCloseTo(1.3, 6);
    expect(ageFactor(AGE_FACTOR.toWeeks)).toBe(1.6);
    expect(ageFactor(AGE_FACTOR.toWeeks + 40)).toBe(1.6);
  });

  it('正典の基礎確率と一致する', () => {
    expect(INJURY_BASE_PROB).toBe(0.0018);
  });
});

describe('§7.5 重篤度の分布', () => {
  it('★正典の 60/30/9/1% と一致する', () => {
    const n = 40000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i += 1) {
      const s = rollSeverity(deriveRng(70, 63, i));
      count[s] = (count[s] ?? 0) + 1;
    }
    for (const row of SEVERITY_TABLE) {
      expect((count[row.severity] ?? 0) / n, row.severity).toBeCloseTo(row.weight, 2);
    }
  });
});

describe('★① 馬を死なせない（正典の明示要件）', () => {
  it('致命的でも引退にとどまる', () => {
    const r = applyInjury(state, 'career_ending', deriveRng(71, 63, 1));
    expect(r.careerEnding).toBe(true);
    expect(r.restWeeks).toBeNull();
    for (const k of ABILITY_KEYS) {
      expect(r.potential[k]).toBeGreaterThan(0);
      expect(r.current[k]).toBeGreaterThan(0);
    }
  });

  it('★どの重篤度でも能力が負にならない', () => {
    const weak = { potential: rec(10), current: rec(10), durability: 50 };
    for (const row of SEVERITY_TABLE) {
      const r = applyInjury(weak, row.severity, deriveRng(72, 63, 1));
      for (const k of ABILITY_KEYS) expect(r.potential[k]).toBeGreaterThanOrEqual(0);
      expect(r.durability).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('★② 恒久ダメージは potential を削る（§7.5 の表どおり）', () => {
  it('軽度: 恒久ダメージなし・休養3〜6週', () => {
    const r = applyInjury(state, 'mild', deriveRng(73, 63, 1));
    expect(r.potential).toEqual(state.potential);
    expect(r.durability).toBe(650);
    expect(hasPermanentLoss(r.permanentLoss)).toBe(false);
    expect(r.restWeeks).toBeGreaterThanOrEqual(3);
    expect(r.restWeeks).toBeLessThanOrEqual(6);
  });

  it('中度: SP のみ 3% 減（他は変わらない）', () => {
    const r = applyInjury(state, 'moderate', deriveRng(74, 63, 1));
    expect(r.potential.sp).toBeCloseTo(500 * (1 - MODERATE_SP_LOSS), 6);
    for (const k of ABILITY_KEYS) if (k !== 'sp') expect(r.potential[k]).toBe(500);
    expect(r.durability).toBe(650);
  });

  it('重度: 全体 8% 減かつ durability 100 減', () => {
    const r = applyInjury(state, 'severe', deriveRng(75, 63, 1));
    for (const k of ABILITY_KEYS) expect(r.potential[k]).toBeCloseTo(500 * (1 - SEVERE_ALL_LOSS), 6);
    expect(r.durability).toBe(650 - SEVERE_DURABILITY_LOSS);
    expect(r.restWeeks).toBeGreaterThanOrEqual(30);
    expect(r.restWeeks).toBeLessThanOrEqual(52);
  });

  it('★durability が 100 未満でも負にならない', () => {
    const r = applyInjury({ ...state, durability: 40 }, 'severe', deriveRng(76, 63, 1));
    expect(r.durability).toBe(0);
    expect(r.permanentLoss.durability).toBe(40);
  });
});

describe('★③ 現在値の切り下げと、その明示（D-045）', () => {
  it('★上限に達した馬は重度故障で current も下がる（C 案が成立しない理由）', () => {
    const mature = { potential: rec(500), current: rec(500), durability: 650 };
    const r = applyInjury(mature, 'severe', deriveRng(77, 63, 1));
    const expected = 500 * (1 - SEVERE_ALL_LOSS);
    for (const k of ABILITY_KEYS) {
      expect(r.current[k]).toBeCloseTo(expected, 6);
      expect(r.current[k]).toBeLessThanOrEqual(r.potential[k]);
    }
  });

  it('★失われた量が明示される（UI がそのまま出せる）', () => {
    const mature = { potential: rec(500), current: rec(500), durability: 650 };
    const r = applyInjury(mature, 'severe', deriveRng(78, 63, 1));
    expect(hasPermanentLoss(r.permanentLoss)).toBe(true);
    for (const k of ABILITY_KEYS) {
      expect(r.permanentLoss.potential[k]).toBeCloseTo(500 * SEVERE_ALL_LOSS, 6);
      expect(r.permanentLoss.current[k]).toBeCloseTo(500 * SEVERE_ALL_LOSS, 6);
    }
    expect(r.permanentLoss.durability).toBe(SEVERE_DURABILITY_LOSS);
  });

  it('★まだ上限に遠い馬は current が下がらない（切り下げは必要なぶんだけ）', () => {
    const young = { potential: rec(500), current: rec(300), durability: 650 };
    const r = applyInjury(young, 'severe', deriveRng(79, 63, 1));
    for (const k of ABILITY_KEYS) expect(r.current[k]).toBe(300);
    expect(Object.keys(r.permanentLoss.current).length).toBe(0);
    // ★ただし potential は確かに削られている（損していないわけではない）
    expect(r.potential.sp).toBeCloseTo(460, 6);
  });

  it('★不変条件がここで閉じる（あらゆる重篤度・あらゆる現在値で）', () => {
    for (const row of SEVERITY_TABLE) {
      for (const cur of [0, 100, 460, 499.9, 500]) {
        const r = applyInjury(
          { potential: rec(500), current: rec(cur), durability: 650 },
          row.severity,
          deriveRng(80, 63, 1),
        );
        for (const k of ABILITY_KEYS) {
          expect(r.current[k], `${row.severity}/${cur}/${k}`).toBeLessThanOrEqual(r.potential[k]);
        }
      }
    }
  });

  it('★入力を書き換えない（呼び出し側の状態が黙って変わらない）', () => {
    const mature = { potential: rec(500), current: rec(500), durability: 650 };
    applyInjury(mature, 'severe', deriveRng(81, 63, 1));
    for (const k of ABILITY_KEYS) {
      expect(mature.potential[k]).toBe(500);
      expect(mature.current[k]).toBe(500);
    }
    expect(mature.durability).toBe(650);
  });
});
