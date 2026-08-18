import { describe, expect, it } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';

describe('Broadcast V2 scene', () => {
  const course = ovalCourse(1600, { widthM: 30, turn: 'left' });

  it('preserves the engine-owned horse coordinates across camera resolution', () => {
    const horses: BroadcastV2Horse[] = Array.from({ length: 12 }, (_, i) => ({
      gate: i + 1, s: 420 - i * 3.5, w: 2.2 + (i % 4) * 1.4,
    }));
    const before = JSON.stringify(horses);
    const scene = resolveBroadcastV2Scene(course, horses, { width: 960, height: 540 });
    expect(JSON.stringify(horses)).toBe(before);
    expect(scene.visibleHorses).toHaveLength(12);
    expect(scene.focusS).toBeGreaterThan(390);
  });

  it('follows only the winner after the field has finished', () => {
    const horses: BroadcastV2Horse[] = [
      { gate: 3, s: 1608, w: 4 },
      { gate: 8, s: 1602, w: 6 },
    ];
    const scene = resolveBroadcastV2Scene(course, horses, { width: 960, height: 540 }, true);
    expect(scene.shot.id).toBe('winner-follow');
    expect(scene.visibleHorses.map((horse) => horse.gate)).toEqual([3]);
    expect(scene.focusS).toBe(1608);
  });

  it('changes camera direction on a real corner without replacing the field', () => {
    const fullLapCourse = ovalCourse(3000, { widthM: 30, turn: 'left' });
    let start = 0;
    fullLapCourse.segments.find((segment) => {
      if (segment.label.includes('1角')) return true;
      start += segment.length;
      return false;
    });
    // ★コーナー専用カットは冒頭 CORNER_CUT_M だけ（それ以降は横追従に戻る）
    const s = start + 10;
    const horses: BroadcastV2Horse[] = [
      { gate: 1, s, w: 3 }, { gate: 2, s: s - 2, w: 5 }, { gate: 3, s: s - 4, w: 7 },
    ];
    const scene = resolveBroadcastV2Scene(fullLapCourse, horses, { width: 960, height: 540 }, false, { script: 'v2' });
    expect(scene.shot.id).toBe('first-corner-front');
    expect(scene.shot.horseAsset).toBe('diag-front-v2');
    expect(scene.visibleHorses).toEqual(horses);
  });
});
