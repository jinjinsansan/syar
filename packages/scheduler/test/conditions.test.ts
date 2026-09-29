/**
 * §10.3/§10.4 レース条件。★サイクル番号だけから決まることが要点。
 */
import { describe, expect, it } from 'vitest';
import {
  DISTANCE_MENU, RACES_PER_DAY, VENUES, classOf, conditionsOf, frozenCourseOf, gradeOf, productionRaceOf,
  venueById, CYCLES_PER_WEEK, WEEKS_PER_YEAR, GRADED_RACES, dailyProgramme, slotOfDay,
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

  /**
   * ★2026-09-29 に書き換え（★設計が変わったから）: 旧「重賞は 1600m 未満 0」は ★番組が重賞の距離を決めていた頃の前提。
   *   ★重賞の暦では ★重賞は ★鞍の距離で走る（★涼風ステークス は 短距離の鞍）。★狙い「格上が短距離ばかりにならない」は ★鞍の表で見る。
   *   ⚠️ ★最初は「短距離の重賞は 1 割未満」も足したが ★**私の思い込みだった**（★表は 13/50 ＝ 26%）。★表の本数と一致することだけを見る。
   */
  it('★重賞は 鞍の距離で走り、短距離（1600m 未満）の重賞は 鞍の表の本数だけ（★旧「0 本」は暦の前の前提）', () => {
    const YEAR = CYCLES_PER_WEEK * WEEKS_PER_YEAR;
    let short = 0;
    let graded = 0;
    for (let i = 0; i < YEAR; i += 1) {
      const g = gradeOf(i);
      if (g === null) continue;
      graded += 1;
      if (conditionsOf(i, classOf(i), g).distance < 1600) short += 1;
    }
    expect(graded).toBe(GRADED_RACES.length);
    expect(short).toBe(GRADED_RACES.filter((r) => r.distanceM < 1600).length);
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
  /** ★2026-09-29: ★重賞は鞍の場で走る（★重賞の暦・緩めたのではなく 設計が変わった） */
  /**
   * ★見ているのは ★場の回し方（★通し番号で 10 場を回す）そのもの。★重賞は その上から鞍の場で上書きされる。
   *   → ★全枠を ★重賞でないとして（grade = null）回し方の場を引き、★均等を見る（★回し方は 暦の前と 1 ビットも同じ）。
   */
  it('★4 馬場ごとに 10 場へ均等に配る（1 週で最多 − 最少 ≤ 1・★回し方の場・重賞は鞍の場で上書き）', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < WEEK; i += 1) {
      const c = conditionsOf(i, classOf(i), null);
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
   * ★**結果の側**（★利用者から見える「レースが 10 場に散っている」・★2026-09-29 レビュー側の条件）。
   *   ★差 3 は ★重賞が鞍の場で走るぶん。★暦の前は ≤ 1 だった。★4 を超えたら ★暦か鞍の場の置き方が変わったということ（★人が見る）。
   */
  it('★実際に走る場も 10 場に散っている（1 週で最多 − 最少 ≤ 4・★暦の前は ≤ 1・差 3 は重賞が鞍の場で走るぶん）', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < WEEK; i += 1) {
      const c = conditionsOf(i, classOf(i), gradeOf(i));
      counts.set(`${c.surface}/${c.courseId}`, (counts.get(`${c.surface}/${c.courseId}`) ?? 0) + 1);
    }
    for (const surface of ['turf', 'dirt'] as const) {
      const ns = VENUES.filter((v) => v.surfaces.includes(surface)).map((v) => counts.get(`${surface}/${v.id}`) ?? 0);
      expect(Math.max(...ns) - Math.min(...ns), `★${surface}: ${ns.join(',')}`).toBeLessThanOrEqual(4);
    }
  });

  /**
   * ★**クラスが場に偏らない**（★番組表はクラスを枠で決めるため）。
   *   ⚠️ ★芝は 1 日 90 本で 10 で割り切れ、★通し番号だけだと同じ枠に毎日同じ場が来ました
   *   （★初版の実測 1 週: 新馬が潮風 69 本・スターパーク 12 本）。
   *   ★1 日 3 場ずつずらすので、★**10 日で芝の各枠が 10 場を 1 回ずつ**回る ＝ ★クラスごとの芝の本数が場の間で完全に等しい。
   */
  /**
   * ★2026-09-29: ★重賞の枠のうち 暦に鞍が無い枠は オープンになり、★重賞は鞍の場で走る（★重賞の暦）。
   *   ★番組の枠（dailyProgramme）で見て ★重賞の枠は除く（★緩めたのではなく 設計が変わった）。
   */
  it('★10 日で、番組のクラスごとの芝の本数が 10 場で等しい（枠が場に張り付かない・★重賞の枠は除く）', () => {
    const DAYS = 10;
    const programme = dailyProgramme();
    const counts = new Map<string, Map<string, number>>();
    for (let i = 0; i < RACES_PER_DAY * DAYS; i += 1) {
      if (programme[slotOfDay(i)] === 'graded') continue;
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
