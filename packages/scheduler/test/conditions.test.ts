/**
 * §10.3/§10.4 レース条件。★サイクル番号だけから決まることが要点。
 */
import { describe, expect, it } from 'vitest';
import { COURSE_IDS, DISTANCE_MENU, RACES_PER_DAY, classOf, conditionsOf, gradeOf } from '../src/index.js';

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

  it('コースが全種類使われる', () => {
    const cs = new Set<string>();
    for (let i = 0; i < RACES_PER_DAY; i += 1) cs.add(conditionsOf(i, classOf(i), gradeOf(i)).courseId);
    expect(cs.size).toBe(COURSE_IDS.length);
  });

  it('負のサイクル番号でも壊れない', () => {
    expect(() => conditionsOf(-5, 'maiden', null)).not.toThrow();
    expect(DISTANCE_MENU).toContain(conditionsOf(-5, 'maiden', null).distance);
  });
});
