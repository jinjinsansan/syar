import { describe, expect, it } from 'vitest';
import { broadcastV2FocusMeters, broadcastV2RangeCenterMeters, broadcastV2ShotAt, ovalCourse, segmentStarts } from '../src/index.js';

describe('Broadcast V2', () => {
  const course = ovalCourse(1600, { turn: 'left' });

  it('実コース区間から方向別ショットを選ぶ', () => {
    for (const boundary of segmentStarts(course)) {
      const shot = broadcastV2ShotAt(course, Math.min(1599, boundary.s + 1));
      if (boundary.label.includes('1角')) expect(shot.id).toBe('first-corner-front');
      if (boundary.label.includes('2角')) expect(shot.id).toBe('second-corner-high');
      if (boundary.label === '向正面') expect(shot.id).toBe('backstretch-side');
      if (boundary.label.includes('3角')) expect(shot.id).toBe('third-corner-rear');
      if (boundary.label.includes('4角')) expect(shot.id).toBe('fourth-corner-high');
      if (boundary.label === '直線' && boundary.s < 1520) expect(shot.id).toBe('homestretch-side');
    }
  });

  it('ゴール前と決着後を専用ショットへ切り替える', () => {
    expect(broadcastV2ShotAt(course, 1550).id).toBe('finish-line');
    expect(broadcastV2ShotAt(course, 1600, true).id).toBe('winner-follow');
  });

  it('注視点は両端の外れ値を除いた平均になる', () => {
    expect(broadcastV2FocusMeters([0, 100, 101, 102, 103, 104, 105, 106, 107, 300])).toBeCloseTo(103.5);
    expect(broadcastV2FocusMeters([])).toBe(0);
  });

  it('全馬群ショットは単独先頭と最後尾の中点を使う', () => {
    expect(broadcastV2RangeCenterMeters([100, 101, 102, 140])).toBe(120);
    expect(broadcastV2RangeCenterMeters([])).toBe(0);
  });
});
