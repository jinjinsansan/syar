/**
 * §10.3/§10.4 レース条件。★サイクル番号だけから決まることが要点。
 */
import { describe, expect, it } from 'vitest';
import {
  DISTANCE_MENU, RACES_PER_DAY, VENUES, classOf, conditionsOf, frozenCourseOf, gradeOf, productionRaceOf,
  venueById,
} from '../src/index.js';

const WEEK = RACES_PER_DAY * 7;

describe('§10.4 レース条件', () => {
  it('★同じサイクル番号からは必ず同じ条件（commit 後に条件が変わらない）', () => {
    for (const i of [0, 1, 143, 5000]) {
      const a = conditionsOf(i, classOf(i), gradeOf(i));
      const b = conditionsOf(i, classOf(i), gradeOf(i));
      expect(b).toEqual(a);
    }
  });

  it('★条件が固定値でない（144本が同じ中身にならない）', () => {
    const set = new Set<string>();
    for (let i = 0; i < RACES_PER_DAY; i += 1) {
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      set.add(`${c.surface}/${c.distance}/${c.courseId}`);
    }
    // 1日のうちに十分な種類が現れる
    expect(set.size).toBeGreaterThan(20);
  });

  it('★芝とダートが両方出る（片方に寄らない）', () => {
    let dirt = 0;
    for (let i = 0; i < RACES_PER_DAY; i += 1) {
      if (conditionsOf(i, classOf(i), gradeOf(i)).surface === 'dirt') dirt += 1;
    }
    expect(dirt).toBeGreaterThan(RACES_PER_DAY * 0.2);
    expect(dirt).toBeLessThan(RACES_PER_DAY * 0.6);
  });

  it('★距離が §8.2 の全帯に散る', () => {
    const ds = new Set<number>();
    for (let i = 0; i < RACES_PER_DAY; i += 1) ds.add(conditionsOf(i, classOf(i), gradeOf(i)).distance);
    expect(ds.size).toBe(DISTANCE_MENU.length);
  });

  it('★重賞は短距離に寄らない（格上が1200mばかりにならない）', () => {
    let short = 0;
    let graded = 0;
    for (let i = 0; i < RACES_PER_DAY * 7; i += 1) {
      const g = gradeOf(i);
      if (g === null) continue;
      graded += 1;
      if (conditionsOf(i, classOf(i), g).distance < 1600) short += 1;
    }
    expect(graded).toBeGreaterThan(0);
    expect(short).toBe(0);
  });

  it('負のサイクル番号でも壊れない', () => {
    expect(() => conditionsOf(-5, 'maiden', null)).not.toThrow();
    expect(DISTANCE_MENU).toContain(conditionsOf(-5, 'maiden', null).distance);
  });
});

/**
 * ★**競馬場の割り当て**（★2026-09-15・指示書 VW-2 §5-1）
 *   ★サイクル番号だけから・★その回の馬場を持つ場だけ・★均等（照会 Q-2 の既定）。
 */
describe('★VW-2 競馬場の割り当て', () => {
  it('★1 同じサイクル番号から、何度呼んでも同じ競馬場', () => {
    for (const i of [0, 7, 143, 144, 1007, 99_999]) {
      const a = conditionsOf(i, classOf(i), gradeOf(i)).courseId;
      for (let k = 0; k < 3; k += 1) expect(conditionsOf(i, classOf(i), gradeOf(i)).courseId).toBe(a);
      // ★クラスを変えても場は変わらない（★場は cycle 番号だけで決まる）
      expect(conditionsOf(i, 'open', null).courseId).toBe(conditionsOf(i, 'maiden', null).courseId);
    }
  });

  it('★2 1 日（144R）の中に 10 場すべてが現れる（どの日でも）', () => {
    for (const day of [0, 1, 2, 5, 6, 100]) {
      const cs = new Set<string>();
      for (let k = 0; k < RACES_PER_DAY; k += 1) {
        const i = day * RACES_PER_DAY + k;
        cs.add(conditionsOf(i, classOf(i), gradeOf(i)).courseId);
      }
      expect([...cs].sort(), `★${day} 日目`).toEqual(VENUES.map((v) => v.id).sort());
    }
  });

  it('★3 割り当てた場が、その回の馬場を持っている（1 週分の全サイクル）', () => {
    for (let i = 0; i < WEEK; i += 1) {
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      expect(venueById(c.courseId).surfaces, `★cycle ${i}`).toContain(c.surface);
    }
  });

  /**
   * ★4 場ごとの回数（★Q-2 の判断材料。★報告書に表で出す）。
   *   ★ここでは「均等に回している」ことだけを固定します — ★馬場ごとに最多と最少の差が 1 以内。
   */
  it('★4 馬場ごとに 10 場へ均等に配る（1 週で最多 − 最少 ≤ 1）', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < WEEK; i += 1) {
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      const key = `${c.surface}/${c.courseId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const surface of ['turf', 'dirt'] as const) {
      const ns = VENUES.filter((v) => v.surfaces.includes(surface)).map((v) => counts.get(`${surface}/${v.id}`) ?? 0);
      expect(Math.max(...ns) - Math.min(...ns), `★${surface}: ${ns.join(',')}`).toBeLessThanOrEqual(1);
      expect(Math.min(...ns)).toBeGreaterThan(0);
    }
  });

  /**
   * ★**クラスが場に偏らない**（★番組表はクラスを枠で決めるため）。
   *   ⚠️ ★芝は 1 日 90 本で 10 で割り切れ、★通し番号だけだと同じ枠に毎日同じ場が来ました
   *   （★初版の実測 1 週: 新馬が潮風 69 本・スターパーク 12 本）。
   *   ★1 日 3 場ずつずらすので、★**10 日で芝の各枠が 10 場を 1 回ずつ**回る ＝ ★クラスごとの芝の本数が場の間で完全に等しい。
   */
  it('★10 日で、クラスごとの芝の本数が 10 場で等しい（枠が場に張り付かない）', () => {
    const DAYS = 10;
    const counts = new Map<string, Map<string, number>>();
    for (let i = 0; i < RACES_PER_DAY * DAYS; i += 1) {
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      if (c.surface !== 'turf') continue;
      const byVenue = counts.get(classOf(i)) ?? new Map<string, number>();
      byVenue.set(c.courseId, (byVenue.get(c.courseId) ?? 0) + 1);
      counts.set(classOf(i), byVenue);
    }
    for (const [cls, byVenue] of counts) {
      const ns = VENUES.map((v) => byVenue.get(v.id) ?? 0);
      expect(new Set(ns).size, `★${cls}: ${ns.join(',')}`).toBe(1);
    }
  });

  it('★旧 ID（C1〜C4）を返さない', () => {
    for (let i = 0; i < RACES_PER_DAY; i += 1) {
      expect(conditionsOf(i, classOf(i), gradeOf(i)).courseId).not.toMatch(/^C[0-9]$/);
    }
  });
});

describe('★VW-3 凍結する走路の形（scheduler 側）', () => {
  it('★10 場すべてで venues.ts の値をそのまま写す（courseShape は全場 oval・Q-1 の既定）', () => {
    for (const v of VENUES) {
      const f = frozenCourseOf(v.id);
      expect(f).toEqual({
        v: 1, venueId: v.id, lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM,
        turn: v.turn, courseShape: 'oval',
      });
      // ★持っていない場は項目ごと無い（★undefined の項目を jsonb に残さない）
      expect(Object.keys(f)).not.toContain('cornerRadiiM');
    }
  });

  it('★知らない id は投げる（★既定の場へ落とさない）', () => {
    expect(() => frozenCourseOf('C1')).toThrow();
  });

  it('★productionRaceOf は conditionsOf と frozenCourseOf の合成そのもの', () => {
    for (const i of [0, 1, 99, 143, 1000]) {
      const p = productionRaceOf(i);
      expect(p.programme).toEqual(conditionsOf(i, classOf(i), gradeOf(i)));
      expect(p.courseFrozen).toEqual(frozenCourseOf(p.programme.courseId));
      expect(p.raceClass).toBe(classOf(i));
      expect(p.grade).toBe(gradeOf(i));
    }
  });
});
