import { describe, expect, it } from 'vitest';
import { broadcastV2FocusMeters, broadcastV2RangeCenterMeters, broadcastV2ShotAt, ovalCourse, segmentStarts } from '../src/index.js';

describe('Broadcast V2', () => {
  const course = ovalCourse(1600, { turn: 'left' });

  it('実コース区間から方向別ショットを選ぶ', () => {
    for (const boundary of segmentStarts(course)) {
      const shot = broadcastV2ShotAt(course, Math.min(1599, boundary.s + 1), false, undefined, { script: 'v2' });
      if (boundary.label.includes('1角')) expect(shot.id).toBe('first-corner-front');
      if (boundary.label.includes('2角')) expect(shot.id).toBe('second-corner-high');
      if (boundary.label === '向正面') expect(shot.id).toBe('backstretch-side');
      if (boundary.label.includes('3角')) expect(shot.id).toBe('third-corner-rear');
      if (boundary.label.includes('4角')) expect(shot.id).toBe('fourth-corner-high');
      if (boundary.label === '直線' && boundary.s < 1520) expect(shot.id).toBe('homestretch-side');
    }
  });

  it('ゴール前と決着後を専用ショットへ切り替える', () => {
    expect(broadcastV2ShotAt(course, 1550, false, undefined, { script: 'v2' }).id).toBe('finish-line');
    expect(broadcastV2ShotAt(course, 1600, true).id).toBe('winner-follow');
  });

  it('★台本 v3: 距離比で発走→低いサイド→寄り→空撮→3角→勝負所→4角→正面固定→直線→先頭争い→ゴール→勝馬', () => {
    const seq = [30, 150, 300, 500, 700, 850, 950, 1050, 1200, 1400, 1550].map((s) => broadcastV2ShotAt(course, s).id);
    expect(seq).toEqual(['start-follow', 'side-low', 'side-close', 'aerial', 'third-corner-rear', 'side-drive',
      'fourth-corner-wide', 'fourth-corner-front', 'homestretch-side', 'front-close', 'finish-line']);
    expect(broadcastV2ShotAt(course, 1600, true).id).toBe('winner-follow');
    // 正面寄り素材が無いときは 4 角を俯瞰ワイドで代用
    expect(broadcastV2ShotAt(course, 1050, false, undefined, { fourthCornerFront: false }).id).toBe('fourth-corner-wide');
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
