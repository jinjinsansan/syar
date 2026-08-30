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
import { ovalCourse, posOf, laneExtraMeters } from '@star/render';
import { ovalSegments, laneAt, laneExtraM } from '@star/race-engine';

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

/**
 * ★**競馬場の形を通したとき、エンジンと描画層が一致しているか**（2026-08-30）
 *
 * 【★なぜ足すか】★`packages/race-engine/test/lane-geometry.test.ts` は
 *   ★**`DEFAULT_OVAL` しか突き合わせていません。**
 *   ⚠️ ★B案 ② で競馬場ごとの形を通した瞬間、★**そこには守りが 1 つも無くなります。**
 *   ★走路の幾何は 2 か所（エンジンの `ovalSegments` / 描画層の `ovalCourse`）にあり、
 *   ★**2 か所に持つものは必ず離れます**（`jostle` 0.06/0.25・走路の幅 20m/25m の前科）。
 *
 * ⚠️ ★引き込み線（`RUN_UP_M = 250`）も 2 か所にあります。★そこも一緒に見ます。
 */
describe('★競馬場の形を通してもエンジンと描画層の幾何が一致する', () => {
  it('★★10 場 × 実際の距離で、区間の長さと種類が一致する', () => {
    for (const v of VENUES) {
      const opts = { lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM, turn: v.turn };
      const dists = GRADED_RACES.filter((r) => r.venueId === v.id).map((r) => r.distanceM);
      for (const d of [...new Set(dists)]) {
        const mine = ovalSegments(d, { lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM });
        const theirs = ovalCourse(d, opts).segments;
        expect(mine.length, `★${v.name} ${d}m の区間の数`).toBe(theirs.length);
        mine.forEach((m, i) => {
          const t = theirs[i]!;
          expect(m.length, `★${v.name} ${d}m の区間 ${i} の長さ`).toBeCloseTo(t.length, 9);
          expect(m.corner, `★${v.name} ${d}m の区間 ${i} の種類`).toBe(t.type === 'corner');
          if (m.corner) expect(m.radius, `★${v.name} ${d}m の区間 ${i} の半径`).toBeCloseTo(t.radius ?? -1, 9);
        });
        expect(mine.reduce((s, x) => s + x.length, 0), `★${v.name} ${d}m の合計`).toBeCloseTo(d, 6);
      }
    }
  });

  it('★★10 場で、距離ロスが一致する（同じ `w` を与えたとき）', () => {
    for (const v of VENUES) {
      const spec = { lapM: v.lapM, homeStretchM: v.homeStretchM, widthM: v.widthM };
      const opts = { ...spec, turn: v.turn };
      const d = GRADED_RACES.find((r) => r.venueId === v.id)!.distanceM;
      const course = ovalCourse(d, opts);
      for (const gate of [1, 6, 12]) {
        const seed = gate * 7919 + d;
        const mine = laneExtraM(gate, 12, d, seed, spec, 1);
        let theirs = 0;
        for (let s = 0; s < d; s += 1) {
          const len = Math.min(1, d - s);
          /** ⚠️ ★`spec` を渡します。★渡さないと `w` だけ 1周2000m 前提になります */
          const w = laneAt(gate, 12, d - (s + len / 2), d, seed, spec.widthM, undefined, spec);
          theirs += laneExtraMeters(course, s, s + len, w);
        }
        expect(Math.abs(mine - theirs), `★${v.name} ${d}m 枠${gate}`)
          .toBeLessThan(Math.max(0.5, Math.abs(theirs) * 0.02));
      }
    }
  });
});
