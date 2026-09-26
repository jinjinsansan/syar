/**
 * 🔴 ★**実レース 1 本を「走らせる形」に開く**（★段 2・2026-09-26）
 *   ★裁定 `REVIEW_RACE_WIRING_20260926.md`・計画 `PLAN_RACE_REAL_WIRING_20260926.md`
 *
 * 【🔴 ★なぜ要るか】
 *   ★`/race` の ★`DIST` / `COURSE_SPEC` / `RACE_TURN` は ★**鞍**（`?venue=`）から来ます。
 *   ★実レースは ★**自前の距離・馬場・競馬場**を持つので、★`result` だけ差し替えると
 *   ★★**実レースの馬を 違うコースで走らせます**（★1600m を 3600m の走路で流す等）。
 *   → ★`races_public` の 1 行（★`course_id` / `distance` / `surface` / `grade`）から組みます。
 */
import { describe, expect, it } from 'vitest';
import {
  raceSetupById, raceSetupFor, DEFAULT_RACE_ID, VENUES, gradedRaceById,
} from '@star/scheduler';

describe('🔴 ★実レースの走らせる形（raceSetupFor）', () => {
  it('★走査が空振りしていない', () => {
    expect(VENUES.length, '★競馬場が 0 場').toBeGreaterThan(1);
  });

  /**
   * 🔴 ★**走路の形は 1 か所から**（★台帳 B-6）。
   *   ★鞍の道と実レースの道が ★**同じ `spec` を返す**こと（★同じ場なら）。
   *   ⚠️ ★これが崩れると ★**着順に効きます**（★`RaceConditions.course` → `laneExtraM`・憲法 3）。
   */
  it('🔴 ★同じ場なら、鞍の道と実レースの道の spec が一致する', () => {
    const byId = raceSetupById(DEFAULT_RACE_ID);
    const real = raceSetupFor({
      courseId: byId.venue.id,
      distanceM: byId.distanceM,
      surface: byId.surface,
      grade: byId.race.grade,
      raceName: byId.meta.raceName,
      raceNo: byId.meta.raceNo,
    });
    expect(real.spec, '🔴 ★走路の形が 2 か所で離れています（★台帳 B-6 の形・着順に効きます）')
      .toEqual(byId.spec);
    expect(real.turn).toBe(byId.turn);
    expect(real.venue.id).toBe(byId.venue.id);
    expect(real.distanceM).toBe(byId.distanceM);
  });

  /** ★10 場すべてで組める（★1 場だけ通る形にしない） */
  it('★どの競馬場でも組める', () => {
    for (const v of VENUES) {
      const s = raceSetupFor({
        courseId: v.id, distanceM: 1600, surface: 'turf',
        grade: null, raceName: '第1レース', raceNo: '1R',
      });
      expect(s.spec.lapM, `${v.id}: 1 周が 0`).toBeGreaterThan(0);
      expect(s.spec.homeStretchM, `${v.id}: 直線が 0`).toBeGreaterThan(0);
      expect(s.turn === 'left' || s.turn === 'right', `${v.id}: 回りが無い`).toBe(true);
    }
  });

  /**
   * 🔴 ★**季節を決めない**（★照会 Q-RACE-4・★簿 `REPLAY-SEASON-UNKNOWN-FOR-REAL-RACE`）。
   *   ★実レースが持つのは ★`scheduled_at`（実時刻）だけで、★ゲーム内の月は ★**正典に在りません**。
   *   ⚠️ ★暦月から推測すると ★`records-screen.ts` が避けたのと ★同じ穴に落ちます（★BT-6 の形）。
   */
  it('🔴 ★季節（ゲーム内の月）を決めていない', () => {
    const s = raceSetupFor({
      courseId: VENUES[0]!.id, distanceM: 2000, surface: 'dirt',
      grade: 'G3', raceName: '試験', raceNo: '5R',
    });
    expect(s.gameMonth, '🔴 ★ゲーム内の月を決めています（★正典に無いので推測になります）').toBeNull();
    /** ★格はそのまま運ぶ（★`races_public.grade` に在る） */
    expect(s.grade).toBe('G3');
  });

  /**
   * 🔴 ★**知らない場は投げる**（★R-27・★既定へ落とさない）。
   *   ⚠️ ★既定の場に落とすと ★「そのレースを見た」と嘘になります（★`?venue=` で直したのと同じ形）。
   */
  it('🔴 ★知らない場・読めない距離は投げる（既定に落とさない）', () => {
    expect(() => raceSetupFor({
      courseId: 'no-such-venue', distanceM: 1600, surface: 'turf',
      grade: null, raceName: 'x', raceNo: '1R',
    })).toThrow(/競馬場が見つかりません/);
    for (const bad of [0, -1, Number.NaN]) {
      expect(() => raceSetupFor({
        courseId: VENUES[0]!.id, distanceM: bad, surface: 'turf',
        grade: null, raceName: 'x', raceNo: '1R',
      }), `距離 ${String(bad)} を通しました`).toThrow(/距離が読めません/);
    }
  });

  /**
   * 🔴 ★**偽の `GradedRace` を作っていない**ことの対照。
   *   ★重賞は ★`month` / `age` / `fillies` を持ちますが、★実レースには在りません。
   *   ★`RealRaceSetup` が ★それらを ★**持たない**ことを、★型ではなく ★実物で確かめます。
   */
  it('🔴 ★重賞の条件（month / age / fillies）を持ち込んでいない', () => {
    const s = raceSetupFor({
      courseId: VENUES[0]!.id, distanceM: 1200, surface: 'turf',
      grade: null, raceName: '試験', raceNo: '3R',
    }) as unknown as Record<string, unknown>;
    for (const key of ['race', 'month', 'age', 'fillies', 'series']) {
      expect(s[key], `🔴 ★\`${key}\` を持ち込んでいます（★実レースには無い値です）`).toBeUndefined();
    }
    /** ★対照: ★鞍の道は ★これらを持っている（★走査が空振りでない） */
    const g = gradedRaceById(DEFAULT_RACE_ID) as unknown as Record<string, unknown>;
    expect(g['month'], '★鞍の道が month を持っていない（★対照が壊れている）').not.toBeUndefined();
  });
});
