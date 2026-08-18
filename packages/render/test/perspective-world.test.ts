import { describe, expect, it } from 'vitest';
import { broadcastCamera, broadcastEnvironmentAt, drawPerspectiveWorld, ovalCourse, segmentStarts, trackKickupIntensity, trackSurfacePaletteRole } from '../src/index.js';

describe('drawPerspectiveWorld', () => {
  it('芝・ダートと4段階の馬場状態を別のパレット役割へ割り当てる', () => {
    expect(trackSurfacePaletteRole('turf', 'good')).toBe('turf-3');
    expect(trackSurfacePaletteRole('turf', 'bad')).toBe('turf-6');
    expect(trackSurfacePaletteRole('dirt', 'good')).toBe('dirt-0');
    expect(trackSurfacePaletteRole('dirt', 'bad')).toBe('dirt-3');
  });

  it('乾いた芝では飛沫を出さず、悪化したダートほど蹴り上げを強くする', () => {
    expect(trackKickupIntensity('turf', 'good')).toBeGreaterThan(0);
    expect(trackKickupIntensity('turf', 'bad')).toBeGreaterThan(0);
    expect(trackKickupIntensity('dirt', 'good')).toBeGreaterThan(0);
    expect(trackKickupIntensity('dirt', 'bad')).toBeGreaterThan(trackKickupIntensity('dirt', 'soft'));
  });
  it('注視地点を中継用の背景区間へ分類する', () => {
    const course = ovalCourse(1600);
    for (const part of segmentStarts(course)) {
      const expected = part.label === '向正面' ? 'backstretch'
        : part.label.includes('角') ? 'corner'
          : part.label === '直線' ? 'homestretch' : 'gate';
      expect(broadcastEnvironmentAt(course, part.s + 0.01)).toBe(expected);
    }
  });

  it('描画帯の外側を含めて最初に画面全面を地表色で塗る', () => {
    const fills: Array<[number, number, number, number]> = [];
    const target: Record<string, unknown> = {
      fillRect: (x: number, y: number, w: number, h: number) => fills.push([x, y, w, h]),
    };
    const ctx = new Proxy(target, {
      get: (obj, key) => key in obj ? obj[key as string] : () => undefined,
      set: (obj, key, value) => { obj[key as string] = value; return true; },
    });
    const course = ovalCourse(1600);
    const cam = broadcastCamera(course, {
      atS: 800, width: 1280, height: 720, view: 'diag-front',
      preset: { backM: 27, upM: 11, sideM: 9, fovDeg: 28 },
    });
    drawPerspectiveWorld(ctx as never, course, cam, { 'turf-4': '#123456' }, 1600);
    expect(fills[0]).toEqual([0, 0, 1280, 720]);
  });
});
