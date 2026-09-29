/**
 * ★レース名（★2026-09-29・オーナー「R12345 のようなおかしなレース名」・レビュー側 規則 3）
 *   ★重賞は既存の架空 50 鞍の名前・★平場は「場の名 ＋ クラス ＋ 距離」・★`R数字` を名前に入れない。
 */
import { describe, it, expect } from 'vitest';
import { classOf, gradeOf, conditionsOf, raceNameOf, GRADED_RACES, VENUES } from '../src/index.js';

const WEEK = 480 * 7;
const nameAt = (i: number): { name: string; grade: string | null; venueId: string } => {
  const cls = classOf(i); const grade = gradeOf(i); const c = conditionsOf(i, cls, grade);
  return { name: raceNameOf({ cycleIndex: i, raceClass: cls, grade, venueId: c.courseId, surface: c.surface, distanceM: c.distance }), grade, venueId: c.courseId };
};

describe('★レース名', () => {
  it('★1 週間のどのレースも R 数字を名乗らず、空でない', () => {
    for (let i = 12000; i < 12000 + WEEK; i++) {
      const { name } = nameAt(i);
      expect(name.length).toBeGreaterThan(0);
      expect(name, `cycle ${i}`).not.toMatch(/^R\d+$/);
    }
  });

  it('★重賞は 既存の架空 50 鞍の名前で、★その競馬場の鞍を名乗る', () => {
    const graded = new Map(GRADED_RACES.map((r) => [r.name, r]));
    let n = 0;
    for (let i = 12000; i < 12000 + WEEK; i++) {
      const { name, grade, venueId } = nameAt(i);
      if (grade === null) continue;
      n += 1;
      const r = graded.get(name);
      expect(r, `cycle ${i}: ${name} は 50 鞍に無い`).toBeDefined();
      expect(r!.grade).toBe(grade);
      expect(r!.venueId).toBe(venueId);
    }
    expect(n).toBeGreaterThan(100);
  });

  it('★平場は「場の名 ＋ クラス ＋ 距離」（★例: スターパーク 1勝クラス 芝1600m）', () => {
    expect(raceNameOf({ cycleIndex: 1, raceClass: 'win1', grade: null, venueId: 'star-park', surface: 'turf', distanceM: 1600 }))
      .toBe('スターパーク 1勝クラス 芝1600m');
    expect(raceNameOf({ cycleIndex: 1, raceClass: 'maiden', grade: null, venueId: 'shirasuna', surface: 'dirt', distanceM: 1200 }))
      .toBe('白砂 未勝利 ダート1200m');
    const shorts = VENUES.map((v) => v.name.replace(/競馬場$/, ''));
    for (let i = 12000; i < 12000 + 480; i++) {
      const { name, grade } = nameAt(i);
      if (grade !== null) continue;
      expect(shorts.some((s) => name.startsWith(`${s} `)), name).toBe(true);
    }
  });

  it('★同じサイクルは同じ名前（★決定論・憲法 4）', () => {
    for (const i of [12000, 12345, 20000]) expect(nameAt(i).name).toBe(nameAt(i).name);
  });
});
