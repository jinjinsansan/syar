/**
 * ★斜め俯瞰の投影（Layer A）
 *
 * 【★この検査が守るもの】
 *   ⚠️ 「それらしく見える」ではなく、★**真横では不可能だったことが可能になったか**を数で見ます。
 *     ・**内/外が画面の y に出る**（D-065 の次元）
 *     ・**コーナーでラチが曲がる**（直線では曲がらない）
 *     ・**ゲートの12房が重ならずに散る**（真横では前後に重なって1頭しか見えなかった）
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, obliqueProject, railPolyline, gateStalls, type ObliqueCamera } from '../src/index.js';

const CAM = (over?: Partial<ObliqueCamera>): ObliqueCamera => ({
  s: 400, w: 12.5, pxPerM: 26, depth: 0.29, anchorX: 520, anchorY: 470, ...over,
});

describe('★斜め俯瞰の投影', () => {
  it('★カメラ地点そのものは、置いた場所に来る', () => {
    const c = ovalCourse(1600);
    const cam = CAM();
    const p = obliqueProject(c, cam, cam.s, cam.w);
    expect(p.x).toBeCloseTo(cam.anchorX, 6);
    expect(p.y).toBeCloseTo(cam.anchorY, 6);
    expect(p.forwardM).toBeCloseTo(0, 6);
    expect(p.lateralM).toBeCloseTo(0, 6);
  });

  it('★前に進むほど画面の右へ。1m = pxPerM px', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 1300 });   // 直線の中（1600m は残り400m から直線）
    const a = obliqueProject(c, cam, 1300, 12.5);
    const b = obliqueProject(c, cam, 1310, 12.5);
    expect(b.x - a.x).toBeCloseTo(10 * cam.pxPerM, 4);
    expect(b.y - a.y).toBeCloseTo(0, 4);
  });

  it('★★内/外が画面の y に出る（真横では原理的に不可能だったもの）', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 1300 });
    const inner = obliqueProject(c, cam, 1300, 2);    // 内ラチ沿い
    const outer = obliqueProject(c, cam, 1300, 22);   // 大外
    // 同じ位置なので x は同じ
    expect(outer.x).toBeCloseTo(inner.x, 4);
    // ★y は分かれる。20m 離れているので 20 × 26 × 0.29 ≒ 151px
    expect(outer.y - inner.y).toBeCloseTo(20 * cam.pxPerM * cam.depth, 4);
    expect(outer.y).toBeGreaterThan(inner.y);   // 外が下
  });

  it('★直線ではラチは曲がらない', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 1400 });
    const line = railPolyline(c, cam, 0, { fromM: -100, toM: 100, stepM: 10 });
    const ys = line.map((p) => p.y);
    const span = Math.max(...ys) - Math.min(...ys);
    expect(span).toBeLessThan(0.5);
  });

  it('★★コーナーではラチが曲がる（直線との差が出る）', () => {
    const c = ovalCourse(1600);
    // 1600m は 残り700〜400m が 4角
    const cam = CAM({ s: 1050 });
    const line = railPolyline(c, cam, 0, { fromM: -100, toM: 100, stepM: 10 });
    const ys = line.map((p) => p.y);
    const span = Math.max(...ys) - Math.min(...ys);
    // ★数十 px 単位で曲がること（「曲がって見える」の下限）
    expect(span).toBeGreaterThan(30);
  });

  it('★★ゲートの12房が、画面の y に重ならずに散る', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 0, w: c.widthM / 2 });
    const stalls = gateStalls(c, cam, 0, 12);
    expect(stalls).toHaveLength(12);
    const ys = stalls.map((s) => s.y);
    // 単調に増える（内から外へ）
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    // ★隣り合う房の間隔が、影が重ならない程度にあること
    const gap = ys[1]! - ys[0]!;
    expect(gap).toBeGreaterThan(10);
    // ★x はほぼ同じ（同じスタート地点なので）
    const xs = stalls.map((s) => s.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
  });

  it('★内側を上にするかを切り替えられる', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 1300 });
    const a = obliqueProject(c, cam, 1300, 22);
    const b = obliqueProject(c, { ...cam, innerUp: false }, 1300, 22);
    expect(b.y - cam.anchorY).toBeCloseTo(-(a.y - cam.anchorY), 6);
  });

  it('★コーナーでは前方の馬の向きがずれる（値を返すだけ）', () => {
    const c = ovalCourse(1600);
    const straight = CAM({ s: 1400 });
    const corner = CAM({ s: 1050 });
    const dStraight = Math.abs(obliqueProject(c, straight, 1480, 12.5).headingOffset);
    const dCorner = Math.abs(obliqueProject(c, corner, 1130, 12.5).headingOffset);
    expect(dStraight).toBeLessThan(1e-9);
    expect(dCorner).toBeGreaterThan(0.1);
  });

  it('★深さ 0 に近づけると真横（内外が潰れる）に戻る', () => {
    const c = ovalCourse(1600);
    const cam = CAM({ s: 1300, depth: 0.001 });
    const inner = obliqueProject(c, cam, 1300, 2);
    const outer = obliqueProject(c, cam, 1300, 22);
    expect(Math.abs(outer.y - inner.y)).toBeLessThan(1);
  });
});
