/**
 * CLI の定数上書きで形質別パラメータが再導出されること（I-4・合格基準17）
 *
 * ⚠️ ここが壊れると、回帰率だけが変わって sd が据え置かれる。
 *    P0-fix の誤結論（「回帰0.20 では距離SDが0.4倍に収縮する」）を生んだのと同じ経路。
 */

import { DEFAULT_BALANCE, FOUNDERS } from '@star/sim-engine';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../src/config.js';

describe('CLI の上書きと形質別パラメータの再導出（I-4）', () => {
  it('上書きなしなら既定と同じ値になる', () => {
    const { balance, founders } = resolveRuntimeConfig();
    expect(founders).toEqual(FOUNDERS);
    expect(balance.traitMutation).toEqual(DEFAULT_BALANCE.traitMutation);
    expect(balance.traitMutation['durability']?.sd).toBe(66);
    expect(balance.traitMutation['distance_center']?.sd).toBe(341);
  });

  it('REGRESSION_RATE を上書きすると sd が追随する', () => {
    const { balance } = resolveRuntimeConfig({ REGRESSION_RATE: 0.05 });
    expect(balance.REGRESSION_RATE).toBe(0.05);
    // sd = 創始アレルSD × √(2r−r²) ÷ 0.9156。r=0.05 なら √0.0975 = 0.3122
    const f = 0.9156;
    const g = Math.sqrt(2 * 0.05 - 0.05 * 0.05);
    expect(balance.traitMutation['durability']?.sd).toBe(Math.round((100 * g) / f));
    expect(balance.traitMutation['distance_center']?.sd).toBe(
      Math.round(((3000 - 1200) / Math.sqrt(12)) * g / f),
    );
    // ★据え置きだったら既定値のままになる。それを検出する
    expect(balance.traitMutation['durability']?.sd).not.toBe(66);
    expect(balance.traitMutation['distance_center']?.sd).not.toBe(341);
  });

  it('FOUNDERS の SD を上書きすると sd が追随する', () => {
    const { balance, founders } = resolveRuntimeConfig({}, {}, { DURABILITY_SD: 200 });
    expect(founders.DURABILITY_SD).toBe(200);
    expect(balance.traitMutation['durability']?.sd).toBe(Math.round((200 * 0.6) / 0.9156));
    expect(balance.traitMutation['durability']?.sd).not.toBe(66);
    // 他形質は変わらない
    expect(balance.traitMutation['distance_center']?.sd).toBe(341);
  });

  it('FOUNDERS の平均を上書きすると品種中心が追随する', () => {
    const { balance } = resolveRuntimeConfig({}, {}, { DURABILITY_MEAN: 700 });
    expect(balance.traitMutation['durability']?.center).toBe(700);
  });

  it('MUTATION_SD を上書きすると clamp 比が変わり sd の clamp も追随する', () => {
    const { balance } = resolveRuntimeConfig({}, { MUTATION_SD: 45 });
    // clamp比 = MUTATION_CLAMP / MUTATION_SD = 150/45 = 3.33
    const ratio = DEFAULT_BALANCE.MUTATION_CLAMP / 45;
    const sd = balance.traitMutation['durability']?.sd ?? 0;
    const clamp = balance.traitMutation['durability']?.clamp ?? 0;
    expect(clamp / sd).toBeCloseTo(ratio, 1);
  });

  it('存在しない定数の上書きは例外にする（タイプミスを黙って無視しない）', () => {
    expect(() => resolveRuntimeConfig({ NO_SUCH_KEY: 1 })).toThrow(/balance に存在しない/);
    expect(() => resolveRuntimeConfig({}, { NO_SUCH_KEY: 1 })).toThrow(/genetics に存在しない/);
    expect(() => resolveRuntimeConfig({}, {}, { NO_SUCH_KEY: 1 })).toThrow(
      /founders に存在しない/,
    );
  });
});
