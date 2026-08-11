/**
 * ★気性の下限（D-049）。
 *
 *   これは「気性が 0 に潰れて形質が死んでいた」ことへの是正です。
 *   ★**潰れていた事実は、どのゲートにも現れていませんでした**（V-2e も V-2f も
 *     B-1 も 588件のテストも全部通っていた）。同じことが再発しないよう、
 *     ここでは「下限が効いている」ではなく **「順序と分散が保たれる」** を固定します。
 */
import { describe, expect, it } from 'vitest';
import {
  TEMPER_BOUNDS, TEMPER_FLOOR_RATIO, applyTemperDelta, temperFloor,
} from '../src/index.js';

describe('★下限は誕生時の値に比例する（順序が保たれる理由）', () => {
  it('下限 = 誕生時 × 比率', () => {
    expect(temperFloor(80)).toBeCloseTo(80 * TEMPER_FLOOR_RATIO, 10);
    expect(temperFloor(20)).toBeCloseTo(20 * TEMPER_FLOOR_RATIO, 10);
  });

  it('★V-15 で較正した比率（変異試験）', () => {
    // ★0.50 は漸近値がゲート（50%）ちょうどで余裕ゼロ。0.60 が確定値
    expect(TEMPER_FLOOR_RATIO).toBe(0.6);
    expect(TEMPER_FLOOR_RATIO).toBeGreaterThan(0.5);
    expect(TEMPER_FLOOR_RATIO).toBeLessThan(1);
  });

  it('★気性の高い馬は落ち着いてもなお高い（順序が入れ替わらない）', () => {
    let hi = 80;
    let lo = 20;
    for (let i = 0; i < 500; i += 1) {
      hi = applyTemperDelta(hi, -5, 80);
      lo = applyTemperDelta(lo, -5, 20);
      expect(hi).toBeGreaterThan(lo);
    }
    expect(hi).toBeCloseTo(temperFloor(80), 6);
    expect(lo).toBeCloseTo(temperFloor(20), 6);
  });
});

describe('★下限に漸近するが到達しない（headroom と同型）', () => {
  it('何回下げても下限を割らない', () => {
    let t = 50;
    for (let i = 0; i < 10000; i += 1) t = applyTemperDelta(t, -5, 50);
    expect(t).toBeGreaterThanOrEqual(temperFloor(50));
  });

  it('★残り幅が減るほど1回あたりの変化が小さくなる（張り付かない）', () => {
    const a = 50 - applyTemperDelta(50, -5, 50);
    const b = 40 - applyTemperDelta(40, -5, 50);
    const c = 32 - applyTemperDelta(32, -5, 50);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0); // ★止まらない
  });

  it('★是正前との違い: 40週ぶん休養しても 0 にならない', () => {
    let t = 50;
    for (let i = 0; i < 40; i += 1) t = applyTemperDelta(t, -5, 50);
    expect(t).toBeGreaterThan(temperFloor(50) - 1e-9);
    expect(t).toBeGreaterThan(25); // ★是正前はここで 0 になっていた
  });
});

describe('★上側（§7.6 の強行 +10）', () => {
  it('上限 100 を超えない', () => {
    let t = 50;
    for (let i = 0; i < 1000; i += 1) t = applyTemperDelta(t, +10, 50);
    expect(t).toBeLessThanOrEqual(TEMPER_BOUNDS.max);
  });

  it('★上げてから下げても下限を割らない（両方向を混ぜる）', () => {
    let t = 50;
    for (let i = 0; i < 300; i += 1) {
      t = applyTemperDelta(t, +10, 50);
      t = applyTemperDelta(t, -5, 50);
      expect(t).toBeGreaterThanOrEqual(temperFloor(50) - 1e-9);
      expect(t).toBeLessThanOrEqual(TEMPER_BOUNDS.max);
    }
  });
});

describe('★端の馬（0 除算をここで閉じる）', () => {
  it('気性 0 の馬は下がらない（下限も 0）', () => {
    expect(applyTemperDelta(0, -5, 0)).toBe(0);
  });

  it('気性 100 の馬は上がらない', () => {
    expect(applyTemperDelta(100, +10, 100)).toBe(100);
  });

  it('★気性 100 の馬でも下がりはする（片方向だけ塞ぐ）', () => {
    expect(applyTemperDelta(100, -5, 100)).toBeLessThan(100);
    expect(applyTemperDelta(100, -5, 100)).toBeGreaterThan(temperFloor(100));
  });

  it('delta 0 は何も変えない', () => {
    expect(applyTemperDelta(37.5, 0, 50)).toBe(37.5);
  });
});
