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

  /**
   * ★序盤の 2 カットを真横から斜めに替えました（2026-08-21）。
   *
   *   エンジンの `laneAt` は発走後どの馬もラチを取りにいく設計で、**残り 1350m の時点で
   *   12 頭の横の広がりは 0.85m しかありません**（8 頭が同じ横位置）。
   *   真横から撮ると同じ大きさの切り抜きが重なり、★オーナー評「**競艇のボートみたいな姿**」。
   *   ゴール前が合格なのは、そこでは**横に 11.9m 散っている**からです（同じ素材・同じ真横）。
   *
   *   ★このテストは**カットの並び**を留めるためのものです。並びを変えるときは、
   *     上のような理由を添えてここも直すこと。数字合わせで通さないこと。
   */
  /**
   * ★台本 v4（既定）— オーナー判定（2026-08-21・12 カット全数）で
   *   **後方・俯瞰が 5 戦 5 敗**だったため、**前からと真横だけ**で構成する。
   *   詳細は `JUDGE_RACE_CUTS_20260821.md`。
   *   ⚠️ ★このテストは**「後方・俯瞰が混ざっていないこと」**を留めるのが本体です。
   *      並びを変えるときは判定表を更新してからにすること。
   */
  it('★★台本 v4（既定）: 前からと真横だけ。後方・俯瞰を含まない', () => {
    // ★境界は 240 / 528 / 800 / 1056 / 1280 / 1472m（`SCRIPT_V4` の until × 1600）
    const seq = [30, 400, 700, 900, 1100, 1300, 1500]
      .map((s) => broadcastV2ShotAt(course, s).id);
    expect(seq).toEqual([
      'start-front', 'first-corner-front', 'side-drive', 'fourth-corner-front',
      'homestretch-side', 'front-close', 'finish-line',
    ]);
    // ★不合格だった 5 カットが、距離のどこにも現れないこと
    const banned = new Set(['second-corner-high', 'aerial', 'third-corner-rear', 'fourth-corner-wide']);
    for (let m = 0; m <= 1600; m += 10) {
      expect(banned.has(broadcastV2ShotAt(course, m).id)).toBe(false);
    }
  });

  it('★台本 v3（旧）: 明示指定したときだけ使う', () => {
    const seq = [30, 150, 300, 500, 700, 850, 950, 1050, 1200, 1400, 1550]
      .map((s) => broadcastV2ShotAt(course, s, false, undefined, { script: 'v3' }).id);
    expect(seq).toEqual(['start-front', 'first-corner-front', 'second-corner-high', 'aerial', 'third-corner-rear', 'side-drive',
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
