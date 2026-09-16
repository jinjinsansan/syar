/**
 * ★**生涯の記録**（★第 2 便・2026-09-16・正典 §18 LR-1〜LR-8）
 *
 * 【★見ている壊れ方】
 *   ① ★記録だけの馬が**週送りの対象に残る**（★LR-3。★頭数に比例してバッチが重くなる）
 *   ② ★記録だけの馬を**所有に数える**／★繁殖・種牡馬に上がった馬を**数え忘れる**（★LR-2）
 *   ③ ★文章が定型でない・★値が無い項目で壊れた文になる（★LR-4）
 *   ④ ★物語の順が保存の順とずれる
 */
import { describe, it, expect } from 'vitest';
import {
  STORY_EVENT_TYPES, storyLineOf, storyOf, isRecordOnly, weeklyAdvanceTargets, storyGrowthOf,
  type StoryEvent,
} from '../src/index.js';

describe('★生涯の記録（第 2 便・§18）', () => {
  it('① ★記録だけの馬は週送りの対象から外れる（LR-3）', () => {
    const horses = [
      { id: 'active', retired: false, breeds: false },
      { id: 'broodmare', retired: true, breeds: true },
      { id: 'honored', retired: true, breeds: false },
    ];
    expect(weeklyAdvanceTargets(horses).map((h) => h.id)).toEqual(['active', 'broodmare']);
    /** ★記録だけの馬が何頭増えても、対象は増えない */
    const many = [...horses, ...Array.from({ length: 100 }, (_, i) => ({ id: `rec${i}`, retired: true, breeds: false }))];
    expect(weeklyAdvanceTargets(many).length).toBe(2);
  });

  it('② ★記録は所有ではない。ただし繁殖・種牡馬に上がった馬は所有（LR-2）', () => {
    expect(isRecordOnly({ retired: true, breeds: false }), '功労馬＝記録だけ').toBe(true);
    expect(isRecordOnly({ retired: true, breeds: true }), '繁殖・種牡馬＝所有').toBe(false);
    expect(isRecordOnly({ retired: false, breeds: false }), '現役＝所有').toBe(false);
  });

  it('③ ★文章は定型で、値が無い項目があっても壊れない（LR-4）', () => {
    for (const type of STORY_EVENT_TYPES) {
      const bare: StoryEvent = { type, week: 12 };
      const line = storyLineOf(bare);
      expect(line.length, `${type} の文`).toBeGreaterThan(0);
      /** ★値が無い項目が文に漏れない */
      expect(line, `${type}`).not.toContain('undefined');
      expect(line, `${type}`).not.toContain('null');
      expect(line, `${type}`).toContain('12 週');
    }
    /** ★値があるときは文に入る */
    const win: StoryEvent = { type: 'first-win', week: 20, raceName: '若草賞', jockeyName: '青井 はやと' };
    expect(storyLineOf(win)).toContain('若草賞');
    expect(storyLineOf(win)).toContain('青井 はやと');
  });

  it('④ ★物語は週の順。同じ週は保存の順のまま（安定）', () => {
    const events: StoryEvent[] = [
      { type: 'retirement', week: 260 },
      { type: 'debut', week: 78, raceName: 'A' },
      { type: 'first-win', week: 78, raceName: 'B' },
      { type: 'birth', week: 0 },
    ];
    const lines = storyOf(events);
    expect(lines[0]).toContain('生まれました');
    expect(lines[1]).toContain('デビュー');
    expect(lines[2]).toContain('初勝利');
    expect(lines[3]).toContain('引退');
    expect(lines.length).toBe(4);
  });

  it('⑤ ★行の増え方を測れる（LR-8）', () => {
    const g = storyGrowthOf([8, 12, 10]);
    expect(g).toEqual({ horses: 3, events: 30, perHorse: 10 });
    expect(storyGrowthOf([])).toEqual({ horses: 0, events: 0, perHorse: 0 });
  });
});
