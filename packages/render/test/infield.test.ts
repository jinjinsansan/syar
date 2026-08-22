/**
 * ★**内馬場とダートコース**（設計 2-2）
 *
 * 【★この検査が生まれた実害（2026-08-22）】
 *   帯を「内側の縁を往き、外側の縁を復る」1 枚の多角形で描いていました。
 *   帯は前後 700m あるので★**必ずどこかがカメラの後ろに回ります。**
 *   1 点でも後ろなら帯ごと捨てていたので、★**ダートが 1 度も描かれませんでした。**
 *   ⚠️ 例外も警告も出ません。**ただ何も出ない**ので、色や配置を疑って時間を使いかけました。
 *
 * 【★もうひとつ見るもの】
 *   ここが**走路の幾何に触れていない**こと。触れると着順が変わります（憲法 3）。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, posOf } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { INFIELD_COLORS, INFIELD_LAYOUT, drawInfield } from '../src/infield.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

function recorder() {
  const fills: unknown[] = [];
  const state = { fillStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
    fill: () => fills.push(state.fillStyle),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'fillStyle' ? state.fillStyle : key === 'globalAlpha' ? state.globalAlpha
      : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'fillStyle') state.fillStyle = value;
      else if (key === 'globalAlpha') state.globalAlpha = value as number;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, fills };
}

function drawAt(shotId: string, leaderS: number, opts = {}) {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: leaderS - i * 3, w: 2 + (i % 4) * 2.2 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
  const basis = cameraBasis(scene.camera);
  const groundOf = (s: number, w: number) => {
    const p = posOf(course, s, w);
    const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    return { x: q.x, y: q.y, depth: q.depth };
  };
  const { ctx, fills } = recorder();
  drawInfield(ctx as never, course, groundOf, VIEWPORT, { focusS: scene.focusS, ...opts });
  return fills.map(String);
}

describe('内馬場とダートコース', () => {
  /**
   * ★本題: **描かれること**。
   *   前後 700m のうち一部がカメラの後ろでも、見えている区間は描く。
   */
  it('★ダート・内馬場・生垣がすべて描かれる（後ろに回った区間だけを飛ばす）', () => {
    /**
     * ★内側が広く映るカットで見ること。
     *   ⚠️ 寄りのカット（`aerial` は画角 11.1° の**上からの望遠**）は、
     *      走路しか画面に入らないので内馬場が出ないのが**正しい**。
     *      そこで「出ない」を不合格にすると、正しい実装を落とします。
     */
    const fills = drawAt('third-corner-rear', 400);
    expect(fills).toContain(INFIELD_COLORS.dirt);
    expect(fills).toContain(INFIELD_COLORS.infield);
    expect(fills).toContain(INFIELD_COLORS.hedge);
  });

  /**
   * ★どのカットでも**何かは描かれる**こと（＝丸ごと落ちていない）。
   *   実害のときは、どのカットでも 0 枚でした。
   */
  it('★どのカットでも内側の帯が描かれる（丸ごと落ちない）', () => {
    for (const shot of ['aerial', 'fourth-corner-front', 'second-corner-high', 'fourth-corner-wide']) {
      const fills = drawAt(shot, 1000);
      expect(fills, `${shot} で何も描かれていない`).not.toHaveLength(0);
      expect(fills, `${shot} にダートが無い`).toContain(INFIELD_COLORS.dirt);
    }
  });

  /**
   * ★ダートは**のっぺりした面にしない**（ハロー目が入る）。
   *   ⚠️ 対照を置くこと — 間隔を巨大にすれば筋は消える。
   */
  it('★ダートにハロー目が入る（対照: 間隔を広げれば消える）', () => {
    const fine = drawAt('third-corner-rear', 400, { harrowM: 9 });
    const coarse = drawAt('third-corner-rear', 400, { harrowM: 100000 });
    const harrowOf = (f: string[]): number =>
      f.filter((c) => c === INFIELD_COLORS.dirtLight || c === INFIELD_COLORS.dirtDark).length;
    expect(harrowOf(fine)).toBeGreaterThan(20);
    expect(harrowOf(coarse)).toBe(0);
  });

  /**
   * ★**走路の幾何に触れていない**こと（憲法 3）。
   *   内側の断面はすべて w < 0、つまり内ラチの外側にある。
   *   ⚠️ ここが 0 以上になると、走路の上に帯を塗って**馬が地面の下に潜ります**。
   */
  it('★断面はすべて内ラチの外側（走路には掛からない）', () => {
    for (const [name, w] of Object.entries(INFIELD_LAYOUT)) {
      expect(w, `${name} が走路に掛かっている`).toBeLessThan(0);
    }
    // 内側ほど値が小さい（順序が崩れると帯が入れ替わる）
    expect(INFIELD_LAYOUT.hedgeInnerW).toBeGreaterThan(INFIELD_LAYOUT.hedgeOuterW);
    expect(INFIELD_LAYOUT.dirtOuterW).toBeGreaterThan(INFIELD_LAYOUT.dirtInnerW);
    expect(INFIELD_LAYOUT.innerHedgeOuterW).toBeGreaterThan(INFIELD_LAYOUT.innerHedgeInnerW);
    expect(INFIELD_LAYOUT.innerHedgeInnerW).toBeGreaterThan(INFIELD_LAYOUT.infieldInnerW);
  });

  it('★決定論 — 同じ入力なら同じ描画（憲法4）', () => {
    expect(drawAt('third-corner-rear', 400)).toEqual(drawAt('third-corner-rear', 400));
  });
});
