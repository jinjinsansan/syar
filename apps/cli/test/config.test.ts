/**
 * CLI の定数上書きで形質別パラメータが再導出されること（I-4・合格基準17）
 *
 * ⚠️ ここが壊れると、回帰率だけが変わって sd が据え置かれる。
 *    P0-fix の誤結論（「回帰0.20 では距離SDが0.4倍に収縮する」）を生んだのと同じ経路。
 */

import { DEFAULT_BALANCE, FOUNDERS, clampTruncationFactor } from '@star/sim-engine';
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

  it('MUTATION_SD を上書きすると clamp 比・切断係数・導出 sd がすべて追随する（J-1）', () => {
    // ⚠️ 以前はここで `clamp/sd ≈ ratio` しか見ておらず、**切断係数が古いままでも緑になった**。
    //    比が変われば係数も sd も変わるので、sd の実値まで固定する。
    const { balance } = resolveRuntimeConfig({}, { MUTATION_SD: 45 });
    const ratio = DEFAULT_BALANCE.MUTATION_CLAMP / 45; // = 3.333
    const factor = clampTruncationFactor(ratio); // ≒ 0.9992（既定の 0.9156 ではない）
    expect(factor).toBeGreaterThan(0.99);

    const expectedSd = Math.round((100 * Math.sqrt(2 * 0.2 - 0.04)) / factor);
    expect(balance.traitMutation['durability']?.sd).toBe(expectedSd);
    // ★係数がリテラル固定のままなら 66 が返る。それを検出する
    expect(balance.traitMutation['durability']?.sd).toBe(60);
    expect(balance.traitMutation['durability']?.sd).not.toBe(66);

    const sd = balance.traitMutation['durability']?.sd ?? 0;
    const clamp = balance.traitMutation['durability']?.clamp ?? 0;
    expect(clamp / sd).toBeCloseTo(ratio, 1);
  });

  it('切断係数は clamp 比の関数である（J-1・指示書の表と一致）', () => {
    // 既定 k=150/90 では正典 §6.4 の 0.9156
    expect(clampTruncationFactor(150 / 90)).toBeCloseTo(0.9156, 4);
    // 指示書 J-1 の表
    expect(clampTruncationFactor(150 / 45)).toBeCloseTo(0.9992, 3);
    expect(clampTruncationFactor(2)).toBeCloseTo(0.9594, 3);
    expect(clampTruncationFactor(1.5)).toBeCloseTo(0.8823, 3);
    // 比が大きいほど切断の影響が小さくなる（単調）
    expect(clampTruncationFactor(3)).toBeGreaterThan(clampTruncationFactor(1.5));
  });

  it('回帰率0の上書きは例外にする（無言で変異が止まるのを防ぐ・J-3）', () => {
    expect(() => resolveRuntimeConfig({ REGRESSION_RATE: 0 })).toThrow(/回帰率は正の数/);
    expect(() => resolveRuntimeConfig({ REGRESSION_RATE: -0.1 })).toThrow(/回帰率は正の数/);
  });

  it('存在しない定数の上書きは例外にする（タイプミスを黙って無視しない）', () => {
    expect(() => resolveRuntimeConfig({ NO_SUCH_KEY: 1 })).toThrow(/balance に存在しない/);
    expect(() => resolveRuntimeConfig({}, { NO_SUCH_KEY: 1 })).toThrow(/genetics に存在しない/);
    expect(() => resolveRuntimeConfig({}, {}, { NO_SUCH_KEY: 1 })).toThrow(
      /founders に存在しない/,
    );
  });
});
