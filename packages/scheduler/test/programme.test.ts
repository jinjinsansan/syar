/**
 * §10.3 番組表。
 *
 * ★A-2 の前提は「サイクル番号だけから決まること」なので、
 *   再現性と、本数が静かに減らないことを測る。
 */

import { describe, expect, it } from 'vitest';
import {
  G1_DAYS,
  G1_SLOTS,
  GRADED_PER_WEEK,
  RACES_BY_CLASS,
  RACES_PER_DAY,
  classOf,
  dailyProgramme,
  dayIndex,
  gradeOf,
  slotOfDay,
  type RaceClass,
} from '../src/index.js';

describe('§10.3 正典との一致', () => {
  it('1日144R', () => {
    expect(RACES_PER_DAY).toBe(144);
  });

  it('★クラス別R数の合計が144（どれかを増やしたら別を減らす必要がある）', () => {
    const sum = Object.values(RACES_BY_CLASS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(RACES_PER_DAY);
  });

  it('クラス別R数（新馬42 / 1勝36 / 2勝24 / 3勝18 / OP15 / 重賞9）', () => {
    expect(RACES_BY_CLASS.maiden).toBe(42);
    expect(RACES_BY_CLASS.win1).toBe(36);
    expect(RACES_BY_CLASS.win2).toBe(24);
    expect(RACES_BY_CLASS.win3).toBe(18);
    expect(RACES_BY_CLASS.open).toBe(15);
    expect(RACES_BY_CLASS.graded).toBe(9);
  });

  it('重賞の週次頻度（G1=3 / G2=8 / G3=20）', () => {
    expect(GRADED_PER_WEEK.G1).toBe(3);
    expect(GRADED_PER_WEEK.G2).toBe(8);
    expect(GRADED_PER_WEEK.G3).toBe(20);
  });

  it('★G1 は週にちょうど3回（毎日3枠にすると週21回になる）', () => {
    let n = 0;
    for (let i = 0; i < RACES_PER_DAY * 7; i += 1) if (gradeOf(i) === 'G1') n += 1;
    expect(n).toBe(GRADED_PER_WEEK.G1);
  });
});

describe('§10.3 番組表の構成', () => {
  const programme = dailyProgramme();

  it('★144枠がすべて埋まる（短い配列を黙って返さない）', () => {
    expect(programme.length).toBe(RACES_PER_DAY);
    expect(programme.every((c) => c !== undefined)).toBe(true);
  });

  it('★クラスごとの本数が正典どおり', () => {
    for (const [cls, n] of Object.entries(RACES_BY_CLASS)) {
      const actual = programme.filter((c) => c === cls).length;
      expect(actual, cls).toBe(n);
    }
  });

  it('★新馬・未勝利が1日に散っている（時間帯で締め出されない）', () => {
    // §10.3「常時空きを確保」。1日を6等分して、どの時間帯にも新馬があること
    const block = RACES_PER_DAY / 6;
    for (let b = 0; b < 6; b += 1) {
      const seg = programme.slice(b * block, (b + 1) * block);
      expect(seg.includes('maiden'), `${b}番目の時間帯`).toBe(true);
    }
  });

  it('★G1 は指定の枠に固定される（§10.3 の時刻固定）', () => {
    for (const s of G1_SLOTS) expect(programme[s]).toBe('graded');
  });

  it('★同じ番組表が何度呼んでも出る（乱数に依存していない）', () => {
    expect(dailyProgramme()).toEqual(programme);
  });
});

describe('§10.3 サイクル番号からの引き当て', () => {
  it('日をまたいでも枠が循環する', () => {
    expect(slotOfDay(0)).toBe(0);
    expect(slotOfDay(143)).toBe(143);
    expect(slotOfDay(144)).toBe(0);
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(143)).toBe(0);
    expect(dayIndex(144)).toBe(1);
  });

  it('★同じサイクル番号からは必ず同じクラス・格が出る（A-2 の前提）', () => {
    for (const i of [0, 54, 143, 144, 1000, 5000]) {
      expect(classOf(i)).toBe(classOf(i));
      expect(gradeOf(i)).toBe(gradeOf(i));
    }
  });

  it('★重賞でない枠は格が null', () => {
    const programme = dailyProgramme();
    const nonGraded = programme.findIndex((c: RaceClass) => c !== 'graded');
    expect(gradeOf(nonGraded)).toBeNull();
  });

  it('★指定した曜日・枠が G1 になる', () => {
    for (const g of G1_DAYS) {
      expect(gradeOf(g.dayOfWeek * RACES_PER_DAY + g.slot)).toBe('G1');
    }
  });

  it('★非G1の重賞は G2 と G3 の両方が現れる', () => {
    const grades = new Set<string>();
    for (let i = 0; i < RACES_PER_DAY * 7; i += 1) {
      const g = gradeOf(i);
      if (g !== null) grades.add(g);
    }
    expect(grades.has('G2')).toBe(true);
    expect(grades.has('G3')).toBe(true);
  });
});
