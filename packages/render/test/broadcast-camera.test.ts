import { describe, expect, it } from 'vitest';
import { broadcastCamera, ovalCourse, posOf, type ShotView } from '../src/index.js';

const course = ovalCourse(1600);
const preset = { backM: 40, upM: 16, sideM: 10, fovDeg: 30 };
const cam = (view: ShotView) => broadcastCamera(course, {
  atS: 700, width: 1280, height: 720, view, preset,
});

describe('broadcastCamera', () => {
  it('同じ入力から同じカメラになる', () => {
    expect(cam('diag-rear')).toEqual(cam('diag-rear'));
  });

  it('方向ごとに異なる視点を返す', () => {
    const positions = (['side', 'diag-front', 'diag-rear', 'rear', 'high-diag'] as const)
      .map((view) => JSON.stringify(cam(view).eye));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('斜め前と斜め後ろは注視点の前後に分かれる', () => {
    const center = posOf(course, 700, course.widthM / 2);
    const ahead = posOf(course, 720, course.widthM / 2);
    const fx = ahead.x - center.x;
    const fy = ahead.y - center.y;
    const along = (view: ShotView) => {
      const eye = cam(view).eye;
      return (eye.x - center.x) * fx + (eye.y - center.y) * fy;
    };
    expect(along('diag-front')).toBeGreaterThan(0);
    expect(along('diag-rear')).toBeLessThan(0);
  });

  it('俯瞰は通常の斜め後方より高い', () => {
    expect(cam('high-diag').eye.z).toBe(cam('diag-rear').eye.z);
    const high = broadcastCamera(course, {
      atS: 700, width: 1280, height: 720, view: 'high-diag',
      preset: { ...preset, upM: 28 },
    });
    expect(high.eye.z).toBeGreaterThan(cam('diag-rear').eye.z);
  });
});
