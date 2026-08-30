/**
 * ★**競馬場 10 場が、実際に走路として成立するか**（2026-08-30）
 *
 * 【★なぜここに置くか】
 *   ★`@star/scheduler` は **依存ゼロ**のパッケージなので、★あちらから `@star/render` を引けません。
 *   ★`apps/cli` は両方を引けるので、★**実際に `ovalCourse` を作る検査はここ**に置きます。
 *
 * 【★何を守るか】
 *   ⚠️ ★「形の数字が入っている」と「★**走路として成立する**」は別です（R-21 の形）。
 *   ★10 場 × 代表的な距離で**実際にコースを作り**、★幾何が壊れていないことを見ます。
 *
 * ⚠️ ★オーナー要望「種類豊富にしたい」の実体は ★**場ごとにコーナーの深さと直線が違うこと**です。
 *    ★そこも数字で押さえます（全部同じ半径なら「10 場ある」意味がありません）。
 */
import { describe, it, expect } from 'vitest';
import { VENUES, GRADED_RACES, venueById } from '@star/scheduler';
import { ovalCourse, posOf } from '@star/render';

describe('★競馬場が走路として成立する', () => {
  it('★10 場すべてで `ovalCourse` が作れる', () => {
    for (const v of VENUES) {
      const course = ovalCourse(1600, {
        lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM, turn: v.turn,
      });
      expect(course.widthM, `★${v.name}`).toBe(v.widthM);
      expect(course.distance, `★${v.name}`).toBe(1600);
      /** ★ゴールから内ラチ上の点が引ける（★幾何が壊れていない） */
      const p = posOf(course, 0, 0);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), `★${v.name} の座標が数でない`).toBe(true);
    }
  });

  it('★50 鞍すべてが、その競馬場の形で作れる', () => {
    for (const r of GRADED_RACES) {
      const v = venueById(r.venueId);
      const course = ovalCourse(r.distanceM, {
        lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM, turn: v.turn,
      });
      expect(course.distance, `★${r.name}`).toBe(r.distanceM);
      /** ★走り切れる（★終点の座標が引ける） */
      const goal = posOf(course, r.distanceM, 0);
      expect(Number.isFinite(goal.x) && Number.isFinite(goal.y), `★${r.name} の終点が数でない`).toBe(true);
    }
  });

  it('⚠️ ★**場ごとにコーナーの深さが違う**（★同じなら 10 場ある意味がありません）', () => {
    /**
     * ★`ovalCourse` は「曲がりの合計 = 1周 − 直線×2」で半径を決めます。
     * ★半径が同じ場が並んでいると、★**コーナーの見え方が同じ**になります。
     */
    const radii = VENUES.map((v) => Math.round(((v.lapM - v.homeStretchM * 2) / (2 * Math.PI)) * 10) / 10);
    expect(new Set(radii).size, `★同じ半径の場がある: ${radii.join(', ')}`).toBe(VENUES.length);
    /** ★いちばん深い場といちばん浅い場で、★**1.5 倍以上**開いていること */
    const min = Math.min(...radii), max = Math.max(...radii);
    expect(max / min, '★どの場もコーナーがほぼ同じ深さ').toBeGreaterThan(1.5);
  });

  it('★直線の長さも散っている', () => {
    const straights = VENUES.map((v) => v.homeStretchM);
    expect(new Set(straights).size).toBe(VENUES.length);
    expect(Math.max(...straights) / Math.min(...straights), '★直線の長さが揃いすぎ').toBeGreaterThan(1.8);
  });
});
