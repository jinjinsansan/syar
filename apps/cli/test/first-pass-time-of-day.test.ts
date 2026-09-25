/**
 * ★**長距離の「1 周目のスタンド前」と時間帯**（★2026-09-15・計画書 R-5 / C-1・第 4 便）
 *
 * 【★見ている壊れ方】
 *   ① ★1 周目のスタンド前が ★4 鞍以外に出る／★4 鞍に出ない（★レビュー側の回答 §0-1）
 *   ② ★見せる区間が直線をはみ出す／★長く見せすぎる（★D-062）
 *   ③ ★渡さなければ 1 ビットも変わらない（★対照）
 *   ④ ★区間名が ★発走の直線・1 周目で「最後の直線」と出る
 *   ⑤ ★時間帯の対応表が 1 か所で、★日本時間で固定・★G1 の枠が朝・昼・夜に分かれる
 *   ⑥ ★見比べの口: 省くと昼・知らない値は昼へ落として落ちたことを返す（★D-085・R-27）
 *   ⑦ ★色の表の名前が scheduler と揃い、★昼は何も重ねない・★上限以下・★介入の局面で弱まる
 *   ⑧ ★画面が同じ関数から組んでいる（★R-30）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  GRADED_RACES, raceSetupFromParam, G1_SLOTS, MINUTES_PER_SLOT,
  TIME_OF_DAYS, TIME_OF_DAY_BANDS, JST_OFFSET_MINUTES, DEMO_TIME_OF_DAY,
  timeOfDayAtJstMinute, timeOfDayOfScheduledAt, timeOfDayFromParam,
} from '@star/scheduler';
import {
  ovalCourse, firstPassStraightsMOf, sideOnlyShownMetersOf, FIRST_PASS_SHOWN_M, raceEditElisionsFor,
  broadcastV2SectionLabel, homeStretchMetersOf,
  TIME_OF_DAY_LOOKS, TIME_OF_DAY_TINT_MAX, TIME_OF_DAY_INTERVENE_FACTOR, timeOfDayTintsOf,
  type Course, type PhaseKnots,
} from '@star/render';

const courseOf = (id: string): Course => {
  const s = raceSetupFromParam(id).setup;
  return ovalCourse(s.distanceM, { ...s.spec, turn: s.turn });
};

describe('★1 周目のスタンド前（★長距離の 3 幕）', () => {
  it('★① 出るのは 銀河賞・北極星カップ・大河原記念・白光記念 の 4 鞍だけ（★全鞍）', () => {
    const withFirstPass = GRADED_RACES.filter((r) => firstPassStraightsMOf(courseOf(r.id)).length > 0).map((r) => r.id).sort();
    expect(withFirstPass).toEqual(['g1-ginga', 'g2-ookawara', 'g3-hakko', 'g3-hokkyokusei']);
    /** ★区間は ★ゴールの 1 周前の決勝線で終わる（★回答 §0-1: 残り [1 周, 1 周 ＋ 直線]） */
    for (const id of withFirstPass) {
      const s = raceSetupFromParam(id).setup;
      const [span] = firstPassStraightsMOf(courseOf(id));
      expect(span!.toM, id).toBeCloseTo(s.distanceM - s.spec.lapM, 6);
      expect(span!.toM - span!.fromM, id).toBeCloseTo(s.spec.homeStretchM, 6);
    }
  });

  it('★② 見せるのは その直線の終わりまでの 200m（★直線をはみ出さない）', () => {
    expect(FIRST_PASS_SHOWN_M).toBe(200);
    for (const r of GRADED_RACES) {
      const course = courseOf(r.id);
      const straights = firstPassStraightsMOf(course);
      const shown = sideOnlyShownMetersOf(course).firstPassSpansM;
      expect(shown.length, r.id).toBe(straights.length);
      shown.forEach((s, i) => {
        expect(s.toM, r.id).toBeCloseTo(straights[i]!.toM, 6);
        expect(s.fromM, r.id).toBeGreaterThanOrEqual(straights[i]!.fromM - 1e-6);
        expect(s.toM - s.fromM, r.id).toBeCloseTo(Math.min(FIRST_PASS_SHOWN_M, straights[i]!.toM - straights[i]!.fromM), 6);
      });
    }
  });

  it('★③ 道中の直線を渡さなければ跳びは 1 か所のまま／渡すと 2 か所で、間に 200m を見せる（★対照）', () => {
    const course = courseOf('g1-ginga');
    const MPS = 16;
    const d = course.distance;
    const knots: PhaseKnots = { startSec: 0, spurtSec: (d - 800) / MPS, straightSec: (d - 400) / MPS, startRealSec: 1, goalSec: (d - 100) / MPS, finishSec: d / MPS };
    const { startShownM, straightShownM, firstPassSpansM } = sideOnlyShownMetersOf(course);
    const base = { cornerSpansM: [], raceSecAtMeters: (m: number) => m / MPS, distanceMeter: d, startShownM, straightShownM, homeStretchM: homeStretchMetersOf(course) };
    const without = raceEditElisionsFor(knots, base);
    const withMid = raceEditElisionsFor(knots, { ...base, midShownSpansM: firstPassSpansM });
    expect(without.length).toBe(1);
    expect(withMid.length).toBe(2);
    const shownMidM = (withMid[1]!.fromRaceSec - withMid[0]!.toRaceSec) * MPS;
    expect(shownMidM).toBeCloseTo(FIRST_PASS_SHOWN_M, 6);
    expect(withMid[0]!.toRaceSec * MPS).toBeCloseTo(firstPassSpansM[0]!.fromM, 6);
  });

  it('★④ 区間名: 発走の直線は「スタート後」・1 周目は「スタンド前」・最後だけ「最後の直線」', () => {
    const ginga = courseOf('g1-ginga');
    expect(broadcastV2SectionLabel(ginga, 700, 'side-drive')).toBe('スタンド前');
    expect(broadcastV2SectionLabel(ginga, 2800, 'side-drive')).toBe('最後の直線');
    /** ★天穹賞は発走が直線の中（直線[0-200]） */
    const tenkyu = courseOf('g1-tenkyu');
    expect(broadcastV2SectionLabel(tenkyu, 100, 'side-drive')).toBe('スタート後');
    expect(broadcastV2SectionLabel(tenkyu, 2000, 'side-drive')).toBe('最後の直線');
    /** ★対照: 桜星賞は変わらない */
    const ousei = courseOf('g1-ousei');
    expect(broadcastV2SectionLabel(ousei, 1500, 'side-drive')).toBe('最後の直線');
    expect(broadcastV2SectionLabel(ousei, 100, 'side-drive')).toBe('スタート後');
  });
});

describe('★時間帯（★発走の時刻から・日本時間）', () => {
  it('★⑤ 対応表は昇順・日本時間で固定・G1 の枠は 朝／昼／夜', () => {
    const froms = TIME_OF_DAY_BANDS.map((b) => b.fromMinute);
    expect([...froms].sort((a, b) => a - b)).toEqual(froms);
    expect(froms[0]).toBe(0);
    expect(JST_OFFSET_MINUTES).toBe(540);
    /** ★1 枠の分数は**サイクルから導く**（★2026-09-18・D-007 改訂。★10 と直書きすると 3 分で嘘になる） */
    expect(G1_SLOTS.map((s) => timeOfDayAtJstMinute(s * MINUTES_PER_SLOT))).toEqual(['morning', 'day', 'night']);
    /** ★UTC 2026-09-15 11:00 ＝ 日本時間 20:00 → 夜 ／ UTC 04:00 ＝ 日本時間 13:00 → 昼 */
    expect(timeOfDayOfScheduledAt(Date.UTC(2026, 8, 15, 11, 0))).toBe('night');
    expect(timeOfDayOfScheduledAt(Date.UTC(2026, 8, 15, 4, 0))).toBe('day');
    expect(timeOfDayOfScheduledAt(Date.UTC(2026, 8, 15, 8, 0))).toBe('dusk');
    expect(timeOfDayAtJstMinute(1439)).toBe('night');
    expect(() => timeOfDayOfScheduledAt(Number.NaN)).toThrow();
  });

  it('★⑥ 見比べの口: 省くと昼／知らない値は昼へ落として落ちたことを返す', () => {
    expect(DEMO_TIME_OF_DAY).toBe('day');
    expect(timeOfDayFromParam(null)).toEqual({ timeOfDay: 'day', fellBack: false });
    expect(timeOfDayFromParam('')).toEqual({ timeOfDay: 'day', fellBack: false });
    for (const t of TIME_OF_DAYS) expect(timeOfDayFromParam(t)).toEqual({ timeOfDay: t, fellBack: false });
    expect(timeOfDayFromParam('midnight')).toEqual({ timeOfDay: 'day', fellBack: true });
  });

  it('★⑦ 色の表: 名前が揃う・昼は何も重ねない・上限以下・介入の局面で弱まる', () => {
    expect(Object.keys(TIME_OF_DAY_LOOKS)).toEqual([...TIME_OF_DAYS]);
    expect(timeOfDayTintsOf('day')).toEqual({ ground: [], scenery: [] });
    for (const t of TIME_OF_DAYS) {
      const look = TIME_OF_DAY_LOOKS[t];
      for (const tint of [look.ground, look.scenery]) if (tint !== undefined) expect(tint.alpha, t).toBeLessThanOrEqual(TIME_OF_DAY_TINT_MAX);
    }
    const night = timeOfDayTintsOf('night');
    const weak = timeOfDayTintsOf('night', true);
    expect(night.scenery.length).toBe(1);
    expect(weak.scenery[0]!.alpha).toBeCloseTo(night.scenery[0]!.alpha * TIME_OF_DAY_INTERVENE_FACTOR, 9);
    expect(TIME_OF_DAY_INTERVENE_FACTOR).toBeLessThan(1);
  });

  it('★⑧ 画面は同じ関数から組む（★時間帯の口・色・1 周目のスタンド前）', () => {
    const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    for (const needle of [
      /**
       * ⚠️ 🔴 ★**引数の綴りを釘付けしていました**（★2026-09-26 に直しました）。
       *    ★旧: ★`"timeOfDayFromParam(typeof window === 'undefined' ? null"` ＋ ★`".get('tod')).timeOfDay"`
       *    🔴 ★これは ★**呼び方の文字列**を固定していたので、
       *      ★`?tod=` の ★`fellBack` を読むように直した便で ★**落ちました**
       *      （★`QS?.get('tod')` に寄せ、★`.timeOfDay` をその場で取らなくなったため）。
       *    ⚠️ ★この検査の趣旨は ★「★**画面が同じ関数から組む**」ことです。★綴りではありません。
       *    → ★**関数を呼んでいること**と ★**`?tod=` を読んでいること**を別々に見ます。
       *    ★`fellBack` を捨てていないかは ★`apps/cli/test/url-param-one-meaning.test.ts` の仕事です
       *      （★役割を混ぜると両方が甘くなります）。
       */
      'timeOfDayFromParam(',
      "get('tod')",
      'const { startShownM, straightShownM, firstPassSpansM } = sideOnlyShownMetersOf(course);',
      '...(sideOnlyBuild ? { midShownSpansM: firstPassSpansM } : {}),',
      'timeOfDayTintsOf(TIME_OF_DAY,',
      'sceneryTints: todTints.scenery,',
      '...todTints.ground,',
    ]) expect(page, `★画面に ${needle} が無い`).toContain(needle);
  });
});
