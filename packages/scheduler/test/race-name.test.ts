/**
 * ★レース名（★2026-09-29・オーナー「R12345 のようなおかしなレース名」・レビュー側 規則 3）
 *   ★重賞は既存の架空 50 鞍の名前・★平場は「場の名 ＋ クラス ＋ 距離」・★`R数字` を名前に入れない。
 */
import { describe, it, expect } from 'vitest';
import { classOf, gradeOf, conditionsOf, raceNameOf, gradedRaceAt, dailyProgramme, slotOfDay, gameMonthOf, GRADED_RACES, VENUES, CYCLES_PER_WEEK, WEEKS_PER_YEAR, RACES_PER_DAY } from '../src/index.js';

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
    /** ★3,360 サイクル ＝ 84 ゲーム週（★暦で 年 50 鞍 → 約 80） */
    expect(n).toBeGreaterThan(60);
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

/**
 * ★**重賞の暦**（★2026-09-29・レビュー側の裁定「1 ゲーム年に 50 鞍がそれぞれ 1 回ずつ」）
 *   ★対照: ★暦を無視して 重賞の枠をすべて重賞にすると ★年 130 鞍・同じ名前が最大 8 回（★直す前の実測）→ ③ で落ちる。
 */
describe('★重賞の暦', () => {
  const YEAR = CYCLES_PER_WEEK * WEEKS_PER_YEAR;
  for (const start of [0, YEAR * 3, YEAR * 7 + 13 * CYCLES_PER_WEEK]) {
    it(`★1 ゲーム年（サイクル ${start} から）: ①50 鞍が 1 回ずつ ②同じ名前が 2 回出ない ③重賞は 50`, () => {
      const seen = new Map<string, number>();
      let graded = 0;
      for (let i = start; i < start + YEAR; i++) {
        const race = gradedRaceAt(i);
        if (race === null) { expect(gradeOf(i)).toBeNull(); continue; }
        graded += 1;
        expect(classOf(i)).toBe('graded');
        expect(gradeOf(i)).toBe(race.grade);
        seen.set(race.id, (seen.get(race.id) ?? 0) + 1);
      }
      expect(graded).toBe(GRADED_RACES.length);
      expect(seen.size).toBe(GRADED_RACES.length);
      for (const [id, n] of seen) expect(n, id).toBe(1);
    });
  }

  it('★重賞は 暦の月に走り、★鞍の競馬場・馬場・距離で走る', () => {
    for (let i = 0; i < CYCLES_PER_WEEK * WEEKS_PER_YEAR; i++) {
      const race = gradedRaceAt(i);
      if (race === null) continue;
      expect(gameMonthOf(Math.floor(i / CYCLES_PER_WEEK))).toBe(race.month);
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      expect([c.courseId, c.surface, c.distance]).toEqual([race.venueId, race.surface, race.distanceM]);
    }
  });

  it('★1 日のレース数は変わらない（★余った重賞の枠は オープン）', () => {
    const programme = dailyProgramme();
    expect(programme.length).toBe(RACES_PER_DAY);
    for (let i = 0; i < 2000; i++) {
      if (programme[slotOfDay(i)] === 'graded' && gradedRaceAt(i) === null) expect(classOf(i)).toBe('open');
    }
  });
});
