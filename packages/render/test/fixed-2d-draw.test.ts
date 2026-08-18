import { describe, expect, it } from 'vitest';
import {
  fixed2DBackgroundRoleOf, fixed2DPackLayout, fixedSideXOf, raceCourseSectionAt,
} from '../src/index.js';

describe('fixed 2D side camera', () => {
  it('keeps the camera target at the designed screen centre', () => {
    expect(fixedSideXOf(800, 800, 12, 640)).toBe(640);
  });

  it('preserves race-engine gaps as horizontal pixel gaps', () => {
    expect(fixedSideXOf(804, 800, 12, 640)).toBe(688);
    expect(fixedSideXOf(796, 800, 12, 640)).toBe(592);
  });

  it('changes only the painted background near the corner and finish', () => {
    expect(fixed2DBackgroundRoleOf(800, 1600)).toBe('backstretch');
    expect(fixed2DBackgroundRoleOf(1200, 1600)).toBe('corner-exit');
    expect(fixed2DBackgroundRoleOf(1500, 1600)).toBe('finish');
  });

  it('separates the field into three ordered visual bands', () => {
    const layout = fixed2DPackLayout([
      { gate: 1, meters: 800, laneM: 1 },
      { gate: 2, meters: 799.5, laneM: 6 },
      { gate: 3, meters: 799, laneM: 11 },
      { gate: 4, meters: 798, laneM: 1 },
    ], {
      cameraMeters: 800, centerX: 700, pxPerMeter: 10, trackWidthM: 12,
      groundY: [490, 520, 550], displayReferenceHeight: [190, 215, 240],
      bandXOffsetPx: [-40, 0, 40], minVisibleGapPx: 84,
    });
    expect(layout.map(({ band }) => band)).toEqual([0, 0, 1, 2]);
    expect(layout[0]!.x - layout[1]!.x).toBeGreaterThanOrEqual(84);
    expect(layout.map(({ groundY }) => groundY)).toEqual([490, 490, 520, 550]);
    expect(layout.map(({ displayReferenceHeight }) => displayReferenceHeight)).toEqual([190, 190, 215, 240]);
  });
});

describe('raceCourseSectionAt', () => {
  it('1600mを全コーナー・向正面・直線・ゴールへ分割する', () => {
    expect(raceCourseSectionAt(100, 1600)).toBe('start');
    expect(raceCourseSectionAt(250, 1600)).toBe('first-corner');
    expect(raceCourseSectionAt(400, 1600)).toBe('second-corner');
    expect(raceCourseSectionAt(700, 1600)).toBe('backstretch');
    expect(raceCourseSectionAt(920, 1600)).toBe('third-corner');
    expect(raceCourseSectionAt(1120, 1600)).toBe('fourth-corner');
    expect(raceCourseSectionAt(1300, 1600)).toBe('straight');
    expect(raceCourseSectionAt(1520, 1600)).toBe('finish');
    expect(raceCourseSectionAt(1600, 1600, true)).toBe('winner');
  });
});
