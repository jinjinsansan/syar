/**
 * ★エンジンの距離ロスと、描画層のコース幾何が**一致していること**
 *
 * 【なぜ要るか】
 *   D-071 で **`w` はエンジンが引く**ことになりました。ところが
 *   コース幾何（`ovalCourse` / `laneExtraMeters`）は `@star/render` にあり、
 *   ★**層の向きの都合でエンジンから参照できません**（描画→エンジンの一方向）。
 *   → エンジン側に**同じ規則**を持ちます。
 *
 * ⚠️ ★**2か所に持つものは必ず離れます。** この案件では実際に
 *      `jostle` が判定 0.06 / 製品 0.25 で離れ、
 *      走路の幅が `ovalCourse` 20m / `formation` 25m で離れていました。
 *   → ★**この検査が、離れた瞬間に落とします。**
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, laneExtraMeters } from '@star/render';
import { laneAt, laneExtraM, ovalSegments, DEFAULT_OVAL, TRACK_WIDTH_M } from '../src/lane.js';

describe('★エンジンと描画層の幾何が一致する', () => {
  it('★★走路の幅が同じ（2か所で持っているので）', () => {
    for (const d of [1200, 1600, 2400]) {
      expect(ovalCourse(d).widthM).toBe(TRACK_WIDTH_M);
      expect(ovalCourse(d).widthM).toBe(DEFAULT_OVAL.widthM);
    }
  });

  it('★★区間の長さと種類が一致する', () => {
    for (const d of [1000, 1200, 1600, 2000, 2400, 3000]) {
      const mine = ovalSegments(d);
      const theirs = ovalCourse(d).segments;
      expect(mine.length).toBe(theirs.length);
      mine.forEach((m, i) => {
        const t = theirs[i]!;
        expect(m.length).toBeCloseTo(t.length, 9);
        expect(m.corner).toBe(t.type === 'corner');
        if (m.corner) expect(m.radius).toBeCloseTo(t.radius ?? -1, 9);
      });
      expect(mine.reduce((s, x) => s + x.length, 0)).toBeCloseTo(d, 6);
    }
  });

  it('★★距離ロスが一致する（同じ `w` を与えたとき）', () => {
    for (const d of [1200, 1600, 2400]) {
      const course = ovalCourse(d);
      for (const gate of [1, 4, 8, 12]) {
        const seed = gate * 7919 + d;
        const mine = laneExtraM(gate, 12, d, seed, DEFAULT_OVAL, 1);
        // ★描画層の関数を、同じ `w` の列で積む
        let theirs = 0;
        for (let s = 0; s < d; s += 1) {
          const len = Math.min(1, d - s);
          const w = laneAt(gate, 12, d - (s + len / 2), d, seed);
          theirs += laneExtraMeters(course, s, s + len, w);
        }
        // ★積み方の違い（区間の刻み方）で微差が出るので、相対で見る
        expect(Math.abs(mine - theirs)).toBeLessThan(Math.max(0.5, Math.abs(theirs) * 0.02));
      }
    }
  });

  it('★内を通れば負・外を回れば正（符号の向き）', () => {
    const d = 1600;
    const centre = TRACK_WIDTH_M / 2;
    const course = ovalCourse(d);
    // 全周を内ラチ沿い（w=1）で回れば、余計に走る距離は負
    let inner = 0;
    let outer = 0;
    for (let s = 0; s < d; s += 5) {
      inner += laneExtraMeters(course, s, Math.min(d, s + 5), 1);
      outer += laneExtraMeters(course, s, Math.min(d, s + 5), TRACK_WIDTH_M - 1);
    }
    expect(inner).toBeLessThan(0);
    expect(outer).toBeGreaterThan(0);
    expect(centre).toBe(10);
  });
});
