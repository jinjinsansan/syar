/**
 * ★**物語の「行」**（★D13-1・2026-09-16・デザイナーのカード `components/horse-story`）
 *
 * 【★見ている壊れ方】
 *   ① ★**種類が落ちる**（★`storyOf` は文だけを返す。★画面が文から種類を推測する形になる）
 *   ② ★**同じ週の続きの行が分からない**（★カードは「同じ週の最初の行だけ週番号を出す」）
 *   ③ ★並べ替えが `storyOf` と食い違う（★同じ物語が 2 通りの順で出る）
 *   ④ ★ラベルが 15 種そろっていない／★文とラベルが同じになる（★ラベルは短く、文は説明）
 */
import { describe, it, expect } from 'vitest';
import {
  storyOf, storyLinesOf, storyLineOf, STORY_EVENT_LABEL, STORY_EVENT_TYPES,
  type StoryEvent,
} from '../src/index.js';

const events: readonly StoryEvent[] = [
  { type: 'debut', week: 236, raceName: 'R5655', finishPosition: 12 },
  { type: 'first-win', week: 236, raceName: 'R5655', finishPosition: 1, jockeyName: '青井 はやと' },
  { type: 'birth', week: 12 },
  { type: 'graded-win', week: 260, raceName: '若草賞', finishPosition: 1 },
];

describe('★物語の行（D13-1）', () => {
  it('① ★種類が落ちない（★画面が文から推測しなくてよい）', () => {
    const lines = storyLinesOf(events);
    expect(lines.map((l) => l.type)).toEqual(['birth', 'debut', 'first-win', 'graded-win']);
    /** ★週も持っている */
    expect(lines.map((l) => l.week)).toEqual([12, 236, 236, 260]);
  });

  it('② ★同じ週の続きの行が分かる（★週番号を 1 回だけ出すため）', () => {
    const lines = storyLinesOf(events);
    /** ★236 週の 2 行目だけが「続き」 */
    expect(lines.map((l) => l.sameWeekAsPrev)).toEqual([false, false, true, false]);
  });

  it('③ ★`storyOf` と並びが完全に一致する（★2 通りの順を作らない）', () => {
    expect(storyLinesOf(events).map((l) => l.text)).toEqual([...storyOf(events)]);
  });

  it('★文は `storyLineOf` が作ったものと同じ（★行の側で組み立て直さない）', () => {
    const lines = storyLinesOf(events);
    for (const [i, e] of [...events].sort((a, b) => a.week - b.week).entries()) {
      void i;
      expect(lines.some((l) => l.text === storyLineOf(e))).toBe(true);
    }
  });

  it('④ ★ラベルが 15 種そろい、★文より短い', () => {
    expect(Object.keys(STORY_EVENT_LABEL).length).toBe(STORY_EVENT_TYPES.length);
    for (const t of STORY_EVENT_TYPES) {
      const label = STORY_EVENT_LABEL[t];
      expect(label.length, `★${t} のラベルが空`).toBeGreaterThan(0);
      /** ★ラベルは短い名前で、★文（説明）ではない */
      expect(label.length, `★${t} のラベルが長すぎる`).toBeLessThanOrEqual(6);
      expect(label).not.toContain('週');
      expect(label).not.toContain('。');
    }
  });

  it('★空の物語でも落ちない', () => {
    expect(storyLinesOf([])).toEqual([]);
    expect(storyOf([])).toEqual([]);
  });
});
