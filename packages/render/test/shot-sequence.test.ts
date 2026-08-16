import { describe, expect, it } from 'vitest';
import { focusForRaceShot, raceShotAt, shotCameraForDistance, type ShotSequenceInput } from '../src/index.js';

const base = (overrides: Partial<ShotSequenceInput> = {}): ShotSequenceInput => ({
  distanceMeter: 1600,
  leaderMeters: 500,
  displaySec: 12,
  displayDurationSec: 45,
  phase: 'cruise',
  allFinished: false,
  ...overrides,
});

describe('raceShotAt', () => {
  it('発走から隊列形成へ進む', () => {
    expect(raceShotAt(base({ leaderMeters: 0 })).family).toBe('start-wide');
    expect(raceShotAt(base({ leaderMeters: 120 })).family).toBe('start-wide');
    expect(raceShotAt(base({ leaderMeters: 121 })).family).toBe('formation');
    expect(raceShotAt(base({ leaderMeters: 300 })).family).toBe('formation');
  });

  it('発馬カメラは最後尾1頭ではなく全馬群を注視する', () => {
    const all = [{ gate: 1 }, { gate: 2 }, { gate: 18 }];
    const shot = raceShotAt(base({ leaderMeters: 20 }));
    expect(focusForRaceShot(shot, {
      all, pack: [all[0]], contenders: [all[1]], leader: [all[0]], winner: [all[1]],
    })).toBe(all);
  });

  it('道中は6秒ごとに異なるショット族を使う', () => {
    expect(raceShotAt(base({ displaySec: 0 })).family).toBe('side-pack');
    expect(raceShotAt(base({ displaySec: 6 })).family).toBe('close-pack');
    expect(raceShotAt(base({ displaySec: 12 })).family).toBe('corner-wide');
    expect(raceShotAt(base({ displaySec: 18 })).family).toBe('side-pack');
  });

  it('局面が道中の時間スロットより優先される', () => {
    expect(raceShotAt(base({ phase: 'spurt' }))).toMatchObject({ family: 'corner-chase', target: 'pack' });
    expect(raceShotAt(base({ phase: 'straight' }))).toMatchObject({ family: 'straight-wide', target: 'pack' });
    expect(raceShotAt(base({ leaderMeters: 1550, phase: 'straight' })).family).toBe('finish');
  });

  it('全馬確定後は勝ち馬ショットになる', () => {
    const shot = raceShotAt(base({ allFinished: true, leaderMeters: 1600, phase: 'straight' }));
    expect(shot.family).toBe('winner');
    expect(shot.target).toBe('winner');
  });

  it('同じ入力は同じショット定義を返す', () => {
    const input = base({ displaySec: 8.25, leaderMeters: 640 });
    expect(raceShotAt(input)).toEqual(raceShotAt(input));
  });

  it('終盤カメラは短距離の寄りを保ち、長距離では隊列全体へ引く', () => {
    const shot = raceShotAt(base({ phase: 'spurt' }));
    expect(shotCameraForDistance(shot, 1200)).toEqual(shot.camera);
    expect(shotCameraForDistance(shot, 1600)).toEqual(shot.camera);
    expect(shotCameraForDistance(shot, 2300).fovDeg).toBe(45);
    expect(shotCameraForDistance(shot, 3000)).toEqual({ backM: 80, upM: 34, sideM: 10, fovDeg: 58 });
  });
});
