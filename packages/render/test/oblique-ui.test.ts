import { describe, expect, it } from 'vitest';
import { raceHudVisibilityAt, shouldEmitRaceCall } from '../src/index.js';

describe('raceHudVisibilityAt', () => {
  it('発馬直後は映像をUIで隠さない', () => {
    expect(raceHudVisibilityAt(0.4, 20, false)).toEqual({
      gauge: false, standings: false, calls: false, result: false,
    });
  });

  it('道中はライブ情報を表示する', () => {
    expect(raceHudVisibilityAt(5, 20, false)).toEqual({
      gauge: true, standings: true, calls: true, result: false,
    });
  });

  it('決着後はライブUIを消し、一拍後だけ結果を出す', () => {
    expect(raceHudVisibilityAt(20.2, 20, true).result).toBe(false);
    expect(raceHudVisibilityAt(20.35, 20, true)).toEqual({
      gauge: false, standings: false, calls: false, result: true,
    });
  });
});

describe('shouldEmitRaceCall', () => {
  it('同じ状態と短時間の順位揺れを読み上げない', () => {
    expect(shouldEmitRaceCall('道中/同/4', '道中/同/4', 2, 4)).toBe(false);
    expect(shouldEmitRaceCall('道中/同/4', '道中/詰/3', 2, 3)).toBe(false);
    expect(shouldEmitRaceCall('道中/同/4', '道中/詰/3', 2, 3.5)).toBe(true);
  });

  it('局面転換は待たずに読み上げる', () => {
    expect(shouldEmitRaceCall('道中/同/4', '勝負所/詰/3', 4, 4.1)).toBe(true);
  });
});
