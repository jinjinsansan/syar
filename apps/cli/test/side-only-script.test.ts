/**
 * ★**真横の直線だけ（台本 v9）— ★どの鞍でもコーナーを映さない**（★2026-09-14・オーナー判断）
 *
 *   > ★「コーナー演出はクオリティが悪いので全カットすることにします。★つまり真横カメラワークの直線のみ」
 *   > ★O-1「見せ方を変えます」（★観戦だけの人と、自馬で介入する人）
 *
 * 【★守るもの】（★3 者のまとめ `SYNTHESIS_RACE_SIDE_ONLY_20260914.md` §5）
 *   ★① 既定の台本は v9 で、★**どの鞍でも**コーナーのカットを 1 本も持たない
 *   ★② 観戦の見せ方で、★見せる区間が ★**どのコーナーにも掛からない**（★R-33・全 50 鞍）
 *   ★③ 跳びの見出しに、★見せていないコーナーの名前が出ない
 *   ★④ 介入する人の見せ方で、★飛ばす区間 ∩［残り 900m, ゴール］＝ 空（★D-066・§8b）
 *   ★⑤ 切り戻しの道（v8）はコーナーのカットを持ったまま
 */
import { describe, it, expect } from 'vitest';
import { GRADED_RACES, raceSetupFromParam } from '@star/scheduler';
import {
  ovalCourse, broadcastV2ScriptBoundariesM, broadcastV2ScriptFromSearch, broadcastV2SectionLabel,
  DEFAULT_RACE_SCRIPT, homeStretchMetersOf, raceEditElisionsFor, raceEditSweepRaceSec,
  STRAIGHT_SHOWN_M, type Course, type PhaseKnots, type RaceElision,
} from '@star/render';
import { DEFAULT_INTERVENTION_BALANCE } from '@star/race-engine';

/** ★合成の位置（★毎秒 16m の等速）。★見る区間の境目だけを確かめるので、速さは何でもよい */
const MPS = 16;

interface Plan {
  readonly course: Course;
  readonly distance: number;
  readonly elisions: readonly RaceElision[];
}

function planFor(raceId: string, keep: boolean): Plan {
  const setup = raceSetupFromParam(raceId).setup;
  const course = ovalCourse(setup.distanceM, { ...setup.spec, turn: setup.turn });
  const distance = setup.distanceM;
  /** ★画面と同じ作り方: ★台本の境界の `-corner-` の行が「見せるコーナー」 */
  const rows = broadcastV2ScriptBoundariesM(course, DEFAULT_RACE_SCRIPT);
  const cornerSpansM: { fromM: number; toM: number }[] = [];
  let prev = 0;
  for (const row of rows) {
    if (row.id.includes('-corner-')) cornerSpansM.push({ fromM: prev, toM: row.meters });
    prev = row.meters;
  }
  const knots: PhaseKnots = {
    startSec: 0, spurtSec: (distance - 800) / MPS, straightSec: (distance - 400) / MPS,
    startRealSec: 1, goalSec: (distance - 100) / MPS, finishSec: distance / MPS,
  };
  const elisions = raceEditElisionsFor(knots, {
    cornerSpansM, raceSecAtMeters: (m) => m / MPS, distanceMeter: distance,
    startShownM: course.segments[0]?.length ?? 0, straightShownM: STRAIGHT_SHOWN_M,
    homeStretchM: homeStretchMetersOf(course),
    ...(keep ? { keepFromMetersLeft: DEFAULT_INTERVENTION_BALANCE.EARLY_SPURT_METER } : {}),
  });
  return { course, distance, elisions };
}

/** ★コーナーの区間（m） */
function cornerRangesM(course: Course): { from: number; to: number; label: string }[] {
  const out: { from: number; to: number; label: string }[] = [];
  let acc = 0;
  for (const seg of course.segments) {
    if (seg.type === 'corner') out.push({ from: acc, to: acc + seg.length, label: seg.label });
    acc += seg.length;
  }
  return out;
}

/** ★見せる区間（m）＝ 全体から飛ばす区間を抜いたもの */
function shownRangesM(plan: Plan): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let at = 0;
  for (const e of plan.elisions) {
    out.push({ from: at, to: e.fromRaceSec * MPS });
    at = e.toRaceSec * MPS;
  }
  out.push({ from: at, to: plan.distance });
  return out.filter((r) => r.to > r.from + 1e-9);
}

describe('★真横の直線だけ（台本 v9）', () => {
  it('★① 既定は v9 で、どの鞍でもコーナーのカットを持たない', () => {
    expect(DEFAULT_RACE_SCRIPT).toBe('v9');
    expect(broadcastV2ScriptFromSearch('')).toBe('v9');
    expect(GRADED_RACES.length, '★鞍の一覧が空（★検査が空回り）').toBeGreaterThan(40);
    for (const r of GRADED_RACES) {
      const { course } = planFor(r.id, false);
      const corners = broadcastV2ScriptBoundariesM(course, 'v9').filter((row) => row.id.includes('-corner-'));
      expect(corners.map((row) => row.id), `${r.id}`).toEqual([]);
    }
  });

  it('★★② 観戦の見せ方で、見せる区間はどのコーナーにも掛からない（★全鞍）', () => {
    const bad: string[] = [];
    for (const r of GRADED_RACES) {
      const plan = planFor(r.id, false);
      for (const shown of shownRangesM(plan)) {
        for (const c of cornerRangesM(plan.course)) {
          const overlap = Math.min(shown.to, c.to) - Math.max(shown.from, c.from);
          if (overlap > 0.5) bad.push(`${r.id}: 見せる ${shown.from.toFixed(0)}–${shown.to.toFixed(0)}m が ${c.label} ${c.from.toFixed(0)}–${c.to.toFixed(0)}m に ${overlap.toFixed(1)}m 掛かる`);
        }
      }
      /** ★対照: ★跳びは 1 か所で、★発走と最後の直線は見せている（★全部飛ばして通していない） */
      expect(plan.elisions.length, `${r.id} の跳びの数`).toBe(1);
      expect(shownRangesM(plan).at(-1)!.to, `${r.id}`).toBeCloseTo(plan.distance, 6);
    }
    expect(bad).toEqual([]);
  });

  it('★③ 跳びの見出しに、見せていないコーナーの名前が出ない（★全鞍）', () => {
    for (const r of GRADED_RACES) {
      const plan = planFor(r.id, false);
      for (const e of plan.elisions) {
        /** ★画面と同じ関数で、跳んだ先の区間名を引く（`page.tsx` の `editJumps`） */
        const label = broadcastV2SectionLabel(plan.course, e.toRaceSec * MPS, 'side-drive');
        expect(label, `${r.id}`).not.toMatch(/コーナー/);
      }
    }
  });

  it('★★④ 介入する人の見せ方で、残り 900m からゴールまでは飛ばさない（★全鞍）', () => {
    const keepM = DEFAULT_INTERVENTION_BALANCE.EARLY_SPURT_METER;
    expect(keepM).toBe(900);
    for (const r of GRADED_RACES) {
      const plan = planFor(r.id, true);
      for (const e of plan.elisions) {
        const overlap = Math.min(e.toRaceSec * MPS, plan.distance) - Math.max(e.fromRaceSec * MPS, plan.distance - keepM);
        expect(overlap, `${r.id}: 飛ばす ${(e.fromRaceSec * MPS).toFixed(0)}–${(e.toRaceSec * MPS).toFixed(0)}m`).toBeLessThanOrEqual(1e-6);
      }
    }
    /** ★対照: ★観戦の見せ方では、★同じ区間を飛ばしている（★渡し忘れを通さない） */
    const spectate = planFor(GRADED_RACES[0]!.id, false);
    const skipsNearGoal = spectate.elisions.some((e) => e.toRaceSec * MPS > spectate.distance - keepM);
    expect(skipsNearGoal).toBe(true);
  });

  it('★⑤ 切り戻しの道（v8）はコーナーのカットを持ったまま', () => {
    expect(broadcastV2ScriptFromSearch('?cinematography=v8')).toBe('v8');
    const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
    expect(broadcastV2ScriptBoundariesM(course, 'v8').some((row) => row.id.includes('-corner-'))).toBe(true);
  });

  it('★コース図で馬群を進める秒は、窓の入口と出口で世界と一致する', () => {
    expect(raceEditSweepRaceSec(12, 70, 0)).toBe(12);
    expect(raceEditSweepRaceSec(12, 70, 1)).toBe(70);
    let prev = -Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const r = raceEditSweepRaceSec(12, 70, p);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});
