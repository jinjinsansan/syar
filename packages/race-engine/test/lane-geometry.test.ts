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
import {
  laneAt, laneExtraM, ovalSegments, DEFAULT_OVAL, TRACK_WIDTH_M,
  ovalCornerPlan, ovalSpecFromCornerRadii,
} from '../src/lane.js';

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

/**
 * ★**段階①「器」— コーナーごとの半径**（2026-08-31・指示書 §1-4・正典 D-092）
 *
 * 【★なぜ要るか】★いまの模型は ★**コーナー 4 本が同一半径の楕円**しか作れません。
 *   ★10 場を作っても違うのは「大きさ」だけでした（`tools/_terrain.mjs`）。
 *   ★スパイラルカーブ・下りの 3〜4 角という**型**は、★半径を独立に持てないと出せません。
 *
 * ⚠️ ★**この便で 10 場の数値は決めません**（指示書 §3）。★運べることと、
 *    ★**省いたときに 1 ビットも変わらないこと**を固定します。
 * ⚠️ ★**勾配（段階②）は入れません**（正典 D-092）。
 */
describe('★段階①「器」— コーナーごとの半径', () => {
  const STRAIGHT = 400;
  const WIDTH = 20;

  it('★★省くと従来どおり（★明示的な均等半径と完全に一致する）', () => {
    for (const c of CASES) {
      const implicit = ovalSegments(c.d, c.spec);
      const plan = ovalCornerPlan(c.spec);
      const explicitSpec = { ...c.spec, cornerRadiiM: plan.radii as [number, number, number, number] };
      const explicit = ovalSegments(c.d, explicitSpec);
      expect(explicit.length, `★${c.label}`).toBe(implicit.length);
      implicit.forEach((m, i) => {
        expect(explicit[i]!.length, `★${c.label}: 区間 ${i} の長さ`).toBeCloseTo(m.length, 9);
        expect(explicit[i]!.radius, `★${c.label}: 区間 ${i} の半径`).toBeCloseTo(m.radius, 9);
        expect(explicit[i]!.corner).toBe(m.corner);
      });
    }
  });

  it('★★コーナーごとに違う半径を持てる（★エンジンと描画層が一致する）', () => {
    // ★3〜4 角がきつく、1〜2 角がゆるい形（★スパイラルの逆・下りの 3〜4 角の型）
    const radii = [220, 200, 150, 140] as const;
    const spec = ovalSpecFromCornerRadii(STRAIGHT, radii, WIDTH);
    for (const d of [1200, 1600, 2400]) {
      const mine = ovalSegments(d, spec);
      const theirs = ovalCourse(d, { ...spec, turn: 'left' }).segments;
      expect(mine.length, `★${d}m: 区間の数`).toBe(theirs.length);
      mine.forEach((m, i) => {
        const t = theirs[i]!;
        expect(m.length, `★${d}m: 区間 ${i} の長さ`).toBeCloseTo(t.length, 9);
        expect(m.corner).toBe(t.type === 'corner');
        if (m.corner) expect(m.radius, `★${d}m: 区間 ${i} の半径`).toBeCloseTo(t.radius ?? -1, 9);
      });
      expect(mine.reduce((a, x) => a + x.length, 0)).toBeCloseTo(d, 6);
    }
    // ★半径が実際に 4 通り出ていること（★均されていたらこの器は意味がない）
    const rs = new Set(ovalSegments(2400, spec).filter((x) => x.corner).map((x) => Math.round(x.radius)));
    expect(rs.size, '★半径が 1 種類しか出ていません').toBeGreaterThan(1);
  });

  it('★★1 周と半径が食い違えば投げる（★黙って辻褄を合わせない・R-27）', () => {
    const spec = ovalSpecFromCornerRadii(STRAIGHT, [200, 200, 200, 200], WIDTH);
    const broken = { ...spec, lapM: spec.lapM + 50 };
    expect(() => ovalSegments(1600, broken)).toThrow();
    expect(() => ovalCourse(1600, { ...broken, turn: 'left' })).toThrow();
    // ★正しい組では投げない（★何でも投げているのではないことの担保・R-21）
    expect(() => ovalSegments(1600, spec)).not.toThrow();
  });

  it('★ovalSpecFromCornerRadii が 1 周を導く（★手計算させない）', () => {
    const radii = [180, 190, 200, 210] as const;
    const spec = ovalSpecFromCornerRadii(STRAIGHT, radii, WIDTH);
    expect(spec.lapM).toBeCloseTo(STRAIGHT * 2 + (Math.PI / 2) * (180 + 190 + 200 + 210), 9);
    expect(() => ovalSpecFromCornerRadii(STRAIGHT, [180, 0, 200, 210], WIDTH)).toThrow();
  });

  it('★★距離ロスが半径に反応する（★器が着順の経路まで通っている）', () => {
    const tight = ovalSpecFromCornerRadii(STRAIGHT, [150, 150, 150, 150], WIDTH);
    const wide = ovalSpecFromCornerRadii(STRAIGHT, [230, 230, 230, 230], WIDTH);
    const spread = (spec: typeof tight): number => {
      const xs = Array.from({ length: 12 }, (_, i) => laneExtraM(i + 1, 12, 1600, 4242, spec));
      return Math.max(...xs) - Math.min(...xs);
    };
    // ★小回りのほうが内外差は大きい（★半径の地図 `tools/_radiusmap.mjs` と同じ向き）
    expect(spread(tight), '★半径を変えても内外差が動かないなら、器が経路に通っていません')
      .toBeGreaterThan(spread(wide));
  });

  /**
   * ⚠️ ★**この便では 10 場の数値を決めていません**（指示書 §3）。
   *    ★上限 12 の見直しが段階①の完了時に控えており、★いま決めると選び直しになります。
   *    → ★**「まだ 0 場」であることを検査で言います。** ★数を入れた便で、この検査を直すこと。
   */
  it('★いまはどの競馬場もコーナーごとの半径を持っていない（★数はまだ決めていない）', () => {
    const withRadii = VENUES.filter((v) => v.cornerRadiiM !== undefined);
    expect(withRadii.map((v) => v.name), '★数を入れたなら、この検査と venues.ts の註記を一緒に直すこと').toEqual([]);
  });
});
