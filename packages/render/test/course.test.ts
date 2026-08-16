/**
 * ★コース幾何（Layer A・PR1）
 *
 * 【★この検査が守るもの】
 *   ⚠️ 「楕円に見える」ではなく、**数で確かめられること**だけを見ます。
 *     ・1周が閉じる
 *     ・ゴール前が直線、その手前が4角
 *     ・★**外を回ると余計に走る**（90度で内2m外12mなら約15.7m）
 */
import { describe, it, expect } from 'vitest';
import {
  ovalCourse, posOf, segmentAt, laneExtraMeters, segmentStarts, HORSE_LENGTH_M,
  RUN_UP_M,
} from '../src/index.js';

describe('★コース幾何', () => {
  it('★区間の合計がレース距離と一致する', () => {
    for (const d of [1200, 1600, 2000, 2400, 3000]) {
      const c = ovalCourse(d);
      const total = c.segments.reduce((s, x) => s + x.length, 0);
      expect(total).toBeCloseTo(d, 6);
    }
  });

  it('★★ゴール前は直線、その手前は4角（順序が必ず成り立つ）', () => {
    for (const d of [1200, 1600, 2000, 2400]) {
      const c = ovalCourse(d);
      expect(segmentAt(c, d - 1).label).toBe('直線');
      // 直線の1つ手前は4角
      const labels = c.segments.map((s) => s.label);
      expect(labels[labels.length - 1]).toBe('直線');
      expect(labels[labels.length - 2]).toBe('4角');
    }
  });

  /**
   * ★★**2026-08-16 に、この検査の意味が変わりました。**
   *
   * 【旧】1周すると元の位置に戻る（コースが閉じている）
   * 【新】★**引き込み線があるレースは閉じません。それが引き込み線の意味です。**
   *
   * 【なぜ入れたか】D-071 / V-18
   *   ⚠️ ★**コーナーの途中から発走させると、外枠が発走直後に大きく外を回ります。** 実測で
   *      枠とロスの相関が 直線発走 0.117 に対し**コーナー発走 0.539**。
   *   ★**実際の競馬場が「コーナーの途中から発走させない」理由がこれ**で、
   *     短い距離は**引き込み線（チュート）**から発走します。
   *   → 引き込み線は**楕円の外**にあるので、★**経路は閉じません**（現実もそうです）。
   *
   * ★守るべきは「閉じること」ではなく、★**コーナーの幾何が正しいこと**です。
   */
  it('★★曲がる角度の合計が、引き込み線のぶんだけ減っている', () => {
    const c = ovalCourse(2000);
    let turned = 0;
    for (const seg of c.segments) {
      if (seg.type === 'corner' && seg.radius !== undefined) turned += seg.length / seg.radius;
    }
    const runUp = c.segments.find((x) => x.label === '発走');
    const radius = c.segments.find((x) => x.type === 'corner')?.radius ?? 1;
    // ★1周ぶんは 2π。引き込み線に置き換えた弧のぶんだけ減る
    const expected = 2 * Math.PI - (runUp?.length ?? 0) / radius;
    expect(turned).toBeCloseTo(expected, 6);
    expect(RUN_UP_M).toBeGreaterThan(0);
  });

  it('★丸ごと1つ残っているコーナーは 90度', () => {
    const c = ovalCourse(2400);
    const radius = c.segments.find((x) => x.type === 'corner')?.radius ?? 1;
    const full = c.segments.filter((x) => x.type === 'corner')
      .find((x) => Math.abs(x.length / radius - Math.PI / 2) < 1e-6);
    expect(full).toBeDefined();
  });

  it('★★引き込み線ぶんを戻せば、経路は閉じる（幾何は壊れていない）', () => {
    const c = ovalCourse(2000);
    const a = posOf(c, 0, 10);
    const b = posOf(c, 2000, 10);
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    // ★引き込み線（発走の直線）に置き換えたぶんだけ開く。その量が説明できること
    const runUp = c.segments.find((x) => x.label === '発走');
    if (runUp === undefined) {
      expect(gap).toBeLessThan(1);
    } else {
      // 置き換えた弧長ぶん、円弧が足りない → 開きは弦の長さ程度に収まる
      expect(gap).toBeGreaterThan(1);
      expect(gap).toBeLessThan(runUp.length * 1.2);
    }
  });

  it('★★外を回ると余計に走る — 90度で内2m・外12mなら約15.7m', () => {
    /**
     * ★これが**この層でいちばん大事な数**です。
     *   `Δs_actual = Δs_center + (w − w_center)·Δθ`
     *   90度（Δθ = π/2）で 10m 外なら `10 × π/2 ≒ 15.7m ≒ 6.5馬身`。
     */
    const c = ovalCourse(2000);
    // 4角ぶん（=90度）だけ走る区間を取る
    const starts = segmentStarts(c);
    const corner4 = starts.find((s) => s.label === '4角');
    expect(corner4).toBeDefined();
    const seg = segmentAt(c, corner4!.s + 1);
    const from = corner4!.s;
    const to = from + seg.length;

    const inner = laneExtraMeters(c, from, to, 2);
    const outer = laneExtraMeters(c, from, to, 12);
    const diff = outer - inner;
    expect(diff).toBeCloseTo(10 * (Math.PI / 2), 1);
    expect(diff / HORSE_LENGTH_M).toBeGreaterThan(6);
    expect(diff / HORSE_LENGTH_M).toBeLessThan(7);
  });

  it('★直線では、外を回っても余計に走らない', () => {
    const c = ovalCourse(1600);
    const from = 1600 - c.homeStretchM;
    expect(laneExtraMeters(c, from, 1600, 2)).toBeCloseTo(0, 9);
    expect(laneExtraMeters(c, from, 1600, 18)).toBeCloseTo(0, 9);
  });

  it('★内を通れば中心線より短い（符号が正しい）', () => {
    const c = ovalCourse(2000);
    expect(laneExtraMeters(c, 0, 2000, 2)).toBeLessThan(0);
    expect(laneExtraMeters(c, 0, 2000, 10)).toBeCloseTo(0, 6);
    expect(laneExtraMeters(c, 0, 2000, 18)).toBeGreaterThan(0);
  });

  it('★横位置は座標を動かすが、s は動かさない（混ぜない）', () => {
    const c = ovalCourse(1600);
    const a = posOf(c, 500, 2);
    const b = posOf(c, 500, 18);
    // 位置は違う
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
    // ★進行方向は同じ（同じ s なので）
    expect(a.heading).toBeCloseTo(b.heading, 6);
  });

  it('★純粋関数（同じ入力から同じ出力）', () => {
    const c = ovalCourse(1600);
    expect(JSON.stringify(posOf(c, 777, 7))).toBe(JSON.stringify(posOf(c, 777, 7)));
  });

  it('★不正な入力は止める', () => {
    expect(() => ovalCourse(0)).toThrow();
    expect(() => ovalCourse(1600, { lapM: 500, homeStretchM: 400 })).toThrow();
  });
});

describe('★コースの向き（俯瞰の作法）', () => {
  it('★★ゴール前の直線は水平・右向き', () => {
    /**
     * ⚠️ これが無いとコースが**斜めに寝ます**（実際に寝ました）。
     *   競馬場の俯瞰は、**決勝線のある直線を手前・水平**に置くのが作法です。
     */
    for (const d of [1200, 1600, 2000, 2400]) {
      const c = ovalCourse(d);
      const a = posOf(c, d - 100, 10);
      const b = posOf(c, d, 10);
      // ★右向き
      expect(b.x - a.x).toBeGreaterThan(90);
      // ★水平（縦のずれがほぼ無い）
      expect(Math.abs(b.y - a.y)).toBeLessThan(1);
      expect(Math.abs(b.heading)).toBeLessThan(1e-6);
    }
  });

  it('★右回りでも成り立つ', () => {
    const c = ovalCourse(1600, { turn: 'right' });
    const a = posOf(c, 1500, 10);
    const b = posOf(c, 1600, 10);
    expect(b.x - a.x).toBeGreaterThan(90);
    expect(Math.abs(b.y - a.y)).toBeLessThan(1);
  });
});
