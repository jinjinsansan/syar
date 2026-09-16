/**
 * ★**レースが残す出来事**（★(a) 第 5 便-4・2026-09-16・正典 **§18 LR-4・LR-5・LR-7**）
 *
 * 【★見ている壊れ方】
 *   ① ★**文を保存する形になる**（★文言を直した日に、過去の行だけ古い文のまま残る）
 *   ② ★初勝利・重賞勝ち・最高格勝ちの境目がずれる（★2 勝目で「初勝利」が出る等）
 *   ③ ★**名コンビが毎回出る**（★頭打ちに達した回だけのはず）
 *   ④ ★負けたレースで勝ちの出来事が出る
 *   ⑤ ★乱数・時刻を読む（★憲法 4・決定論）
 */
import { describe, it, expect } from 'vitest';
import { raceStoryEvents, storyLineOf, STORY_EVENT_TYPES } from '../src/index.js';

const base = {
  finishPosition: 1,
  grade: null,
  runsBefore: 3,
  winsBefore: 1,
  ridesWithJockeyBefore: 0,
  bondMaxRides: 5,
  week: 120,
  raceName: '桜星賞',
  jockeyName: '青井 はやと',
} as const;

const types = (o: Parameters<typeof raceStoryEvents>[0]) => raceStoryEvents(o).map((e) => e.type);

describe('★レースが残す出来事（§18）', () => {
  it('② ★デビュー戦（★それより前の出走が 0）', () => {
    expect(types({ ...base, runsBefore: 0, winsBefore: 0, finishPosition: 5 })).toEqual(['debut']);
    /** ★2 戦目では出ない（★境目の両側・R-2） */
    expect(types({ ...base, runsBefore: 1, winsBefore: 0, finishPosition: 5 })).toEqual([]);
  });

  it('② ★初勝利は「それより前の勝ちが 0」で 1 着のときだけ', () => {
    expect(types({ ...base, winsBefore: 0 })).toEqual(['first-win']);
    expect(types({ ...base, winsBefore: 1 })).toEqual([]);
    /** ④ ★負けたら出ない */
    expect(types({ ...base, winsBefore: 0, finishPosition: 2 })).toEqual([]);
  });

  it('② ★重賞勝ちと最高格勝ち（★G1 は両方残す）', () => {
    expect(types({ ...base, grade: 'G3' })).toEqual(['graded-win']);
    expect(types({ ...base, grade: 'G2' })).toEqual(['graded-win']);
    expect(types({ ...base, grade: 'G1' })).toEqual(['graded-win', 'top-grade-win']);
    /** ④ ★2 着では出ない */
    expect(types({ ...base, grade: 'G1', finishPosition: 2 })).toEqual([]);
  });

  it('③ ★名コンビは頭打ちに「達した回」だけ', () => {
    const at = (rides: number) => types({ ...base, ridesWithJockeyBefore: rides });
    expect(at(3)).toEqual([]);
    /** ★4 回乗せた次（＝5 回目）で出る */
    expect(at(4)).toEqual(['jockey-bond']);
    /** ★それ以降は出ない（★毎回出ると物語が埋まる） */
    expect(at(5)).toEqual([]);
    expect(at(20)).toEqual([]);
    /** ★騎手を選んでいなければ出ない */
    expect(raceStoryEvents({ ...base, jockeyName: undefined, ridesWithJockeyBefore: 4 })
      .map((e) => e.type)).toEqual([]);
  });

  it('★同じレースで複数出る（★初勝利かつ最高格勝ち）', () => {
    expect(types({ ...base, winsBefore: 0, grade: 'G1', runsBefore: 0 }))
      .toEqual(['debut', 'first-win', 'graded-win', 'top-grade-win']);
    /** ★並びは `STORY_EVENT_TYPES` の順に矛盾しない（★物語の順が揺れない） */
    const order = types({ ...base, winsBefore: 0, grade: 'G1', runsBefore: 0 })
      .map((t) => STORY_EVENT_TYPES.indexOf(t));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('① ★文を持たない（★種類と値だけ返す。文は storyLineOf が組み立てる）', () => {
    const [e] = raceStoryEvents({ ...base, winsBefore: 0 });
    expect(Object.keys(e!).sort()).toEqual(['finishPosition', 'jockeyName', 'raceName', 'type', 'week']);
    /** ★文は別の関数から出る */
    expect(storyLineOf(e!)).toContain('初勝利');
    expect(storyLineOf(e!)).toContain('桜星賞');
  });

  it('⑤ ★決定論（★同じ入力なら同じ出来事・乱数と時刻を受け取る口が無い）', () => {
    expect(raceStoryEvents.length).toBe(1);
    expect(raceStoryEvents({ ...base, winsBefore: 0 })).toEqual(raceStoryEvents({ ...base, winsBefore: 0 }));
  });
});
