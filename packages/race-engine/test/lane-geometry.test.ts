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
 *
 * ─────────────────────────────────────────────────────────────
 * ★**2026-08-31: 1 場 → 44 通りに広げました**（指示書 §1-1・裁定 §6-1・正典 **R-33**）
 *
 * ⚠️ ★それまでは `ovalSegments(d)` / `ovalCourse(d)` と **`spec` を渡しておらず**、
 *    ★突き合わせていたのは ★**`DEFAULT_OVAL`（1周2000m / 直線400m / 幅20m）の 1 場だけ**でした。
 *    ★競馬場が 10 場・44 通りになったあともそのままで、
 *    → ★**`OvalSpec` を広げたとき、10 場のどこかで二重実装が離れても緑のまま**でした。
 *
 * ★**R-33**: 検査を 1 つの既定で書いたら、それは既定しか守りません。
 * ★**台帳 B-6 と同じ形**です（★製品の経路は塞いだが、検査の側は 1 つの既定のままだった）。
 *
 * ⚠️ ★**走路の形は `@star/scheduler` の `raceSetupById` から引きます。自前で組みません**（指示書 §1-1）。
 *    ★自前で組むと、★**「呼び出し側が渡す形」ではなく「検査が思っている形」**を突き合わせることになります。
 * ─────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, laneExtraMeters } from '@star/render';
import { GRADED_RACES, raceSetupById, VENUES } from '@star/scheduler';
import { laneAt, laneExtraM, ovalSegments, DEFAULT_OVAL, TRACK_WIDTH_M } from '../src/lane.js';

interface Case {
  readonly key: string;
  readonly label: string;
  readonly d: number;
  readonly spec: { readonly lapM: number; readonly homeStretchM: number; readonly widthM: number };
  readonly turn: 'left' | 'right';
}

/**
 * ★**10 場 × 実距離**。★同じ (競馬場, 距離) は芝とダートで 2 鞍あることがあるので畳みます
 *   （★幾何は馬場に依りません）。★件数は**数えて出します** — ★直書きしません。
 */
const CASES: readonly Case[] = (() => {
  const seen = new Map<string, Case>();
  for (const race of GRADED_RACES) {
    const s = raceSetupById(race.id);
    const key = `${s.venue.id}/${s.distanceM}`;
    if (seen.has(key)) continue;
    seen.set(key, { key, label: `${s.venue.name} ${s.distanceM}m`, d: s.distanceM, spec: s.spec, turn: s.turn });
  }
  return [...seen.values()];
})();

describe('★突き合わせの対象（★この検査が何場を見ているか）', () => {
  /**
   * ⚠️ ★**0 件・1 件で緑になるのがいちばん危ない**（R-21: 0 件は抽出器を疑う）。
   *    ★実際、これまでは**1 場**で緑でした。★件数そのものを見張ります。
   */
  it('★10 場すべてを見ている', () => {
    const venues = new Set(CASES.map((c) => c.key.split('/')[0]));
    expect(venues.size).toBe(VENUES.length);
    expect(VENUES.length).toBe(10);
  });

  it('★組まれている (競馬場, 距離) をすべて見ている（★1 通りも落とさない）', () => {
    const expected = new Set(GRADED_RACES.map((r) => {
      const s = raceSetupById(r.id);
      return `${s.venue.id}/${s.distanceM}`;
    }));
    expect(new Set(CASES.map((c) => c.key))).toEqual(expected);
    // ★下限。★1 場だけを見て緑だった過去に戻らないための歯止め
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  it('★形が実際にばらけている（★同じ形を 44 回見ても 1 通り分の意味しかない）', () => {
    const shapes = new Set(CASES.map((c) => `${c.spec.lapM}/${c.spec.homeStretchM}/${c.spec.widthM}`));
    expect(shapes.size).toBe(VENUES.length);
  });
});

describe('★エンジンと描画層の幾何が一致する（★44 通り）', () => {
  it('★★走路の幅が同じ（2か所で持っているので）', () => {
    for (const c of CASES) {
      const course = ovalCourse(c.d, { ...c.spec, turn: c.turn });
      expect(course.widthM, `★${c.label}`).toBe(c.spec.widthM);
    }
    // ★既定同士も揃っていること（★`spec` を渡さない呼び出しが残っている間の担保）
    expect(ovalCourse(1600).widthM).toBe(TRACK_WIDTH_M);
    expect(ovalCourse(1600).widthM).toBe(DEFAULT_OVAL.widthM);
  });

  it('★★区間の長さと種類と半径が一致する', () => {
    for (const c of CASES) {
      const mine = ovalSegments(c.d, c.spec);
      const theirs = ovalCourse(c.d, { ...c.spec, turn: c.turn }).segments;
      expect(mine.length, `★${c.label}: 区間の数`).toBe(theirs.length);
      mine.forEach((m, i) => {
        const t = theirs[i]!;
        expect(m.length, `★${c.label}: 区間 ${i} の長さ`).toBeCloseTo(t.length, 9);
        expect(m.corner, `★${c.label}: 区間 ${i} の種類`).toBe(t.type === 'corner');
        if (m.corner) expect(m.radius, `★${c.label}: 区間 ${i} の半径`).toBeCloseTo(t.radius ?? -1, 9);
      });
      expect(mine.reduce((s, x) => s + x.length, 0), `★${c.label}: 合計`).toBeCloseTo(c.d, 6);
    }
  });

  it('★★距離ロスが一致する（同じ `w` を与えたとき）', () => {
    /** ★44 通り × 3 枠で回すので刻みは 5m。★両辺に**同じ刻み**を渡すので比較は成り立ちます */
    const STEP = 5;
    for (const c of CASES) {
      const course = ovalCourse(c.d, { ...c.spec, turn: c.turn });
      for (const gate of [1, 6, 12]) {
        const seed = gate * 7919 + c.d;
        const mine = laneExtraM(gate, 12, c.d, seed, c.spec, STEP);
        // ★描画層の関数を、同じ `w` の列で積む
        let theirs = 0;
        for (let s = 0; s < c.d; s += STEP) {
          const len = Math.min(STEP, c.d - s);
          const w = laneAt(gate, 12, c.d - (s + len / 2), c.d, seed, c.spec.widthM, undefined, c.spec);
          theirs += laneExtraMeters(course, s, s + len, w);
        }
        // ★積み方の違い（区間の刻み方）で微差が出るので、相対で見る
        expect(Math.abs(mine - theirs), `★${c.label} ${gate}枠 （エンジン ${mine.toFixed(2)} / 描画 ${theirs.toFixed(2)}）`)
          .toBeLessThan(Math.max(0.5, Math.abs(theirs) * 0.02));
      }
    }
  });

  it('★内を通れば負・外を回れば正（符号の向き・44 通り）', () => {
    for (const c of CASES) {
      const course = ovalCourse(c.d, { ...c.spec, turn: c.turn });
      let inner = 0;
      let outer = 0;
      for (let s = 0; s < c.d; s += 5) {
        const e = Math.min(c.d, s + 5);
        inner += laneExtraMeters(course, s, e, 1);
        outer += laneExtraMeters(course, s, e, c.spec.widthM - 1);
      }
      expect(inner, `★${c.label}: 内を通ったのに正`).toBeLessThan(0);
      expect(outer, `★${c.label}: 外を回ったのに負`).toBeGreaterThan(0);
    }
    expect(TRACK_WIDTH_M / 2).toBe(10);
  });
});
