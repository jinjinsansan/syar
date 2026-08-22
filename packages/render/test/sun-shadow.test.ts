/**
 * ★**影は世界の太陽から落ちる**（設計 1-8・参考映像 1.2 #13）
 *
 * 【★この検査が生まれた理由】
 *   旧実装は影を**画面座標の傾き**（`skew = 0.28 × 進行方向`）で描いていました。
 *   進行方向を基準にしているので、★**馬がコーナーを回ると影も一緒に回ります。**
 *   引きのカットでは、同じ画の中で**馬ごとに影の向きが違う**ことになります。
 *   ⚠️ 真横のカットだけを見ていると気づけません（全馬が同じ向きに走っているので）。
 *      **コーナーで初めて出る**壊れ方です。
 *
 * 【何を見るか】
 *   影の先端が「地面を `高さ / tan(高度)` だけ太陽の方位へ進んだ点」を
 *   **同じカメラで投影した点**に一致すること。これが成り立てば、
 *   コースのどこにいても向きは 1 つです。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, posOf } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import {
  HORSE_HEIGHT_M, SUN_AZIMUTH_RAD, SUN_SHADOW_ALPHA, drawPerspectiveHorses, sunShadowLengthPerM,
} from '../src/perspective-draw.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** シルエット影の分岐を通すための、最低限の高解像度コマ */
const FRAME = {
  image: 'horse' as never,
  source: { x: 0, y: 0, width: 300, height: 200 },
  referenceHeight: 200,
  bodyAnchorSourcePx: { x: 150, y: 120 },
  bodyLiftSourcePx: 0,
  shadow: { image: 'shadow' as never, width: 300, height: 200 },
};

/** `transform` の引数を拾う（影の変形はこれ 1 回だけ） */
function transformArgs(horse: { gate: number; s: number; w: number }, cameraS: number) {
  const scene = resolveBroadcastV2Scene(
    course, [horse], VIEWPORT, false, { forceShotId: 'fourth-corner-front' },
  );
  void cameraS;
  const calls: number[][] = [];
  const alphas: number[] = [];
  const state = { globalAlpha: 1 };
  const target: Record<string, unknown> = {
    save: () => alphas.push(state.globalAlpha),
    restore: () => undefined,
    transform: (...a: number[]) => { calls.push(a); alphas[alphas.length - 1] = state.globalAlpha; },
    drawImage: () => undefined, beginPath: () => undefined, fill: () => undefined,
    ellipse: () => undefined, fillRect: () => undefined, moveTo: () => undefined,
    lineTo: () => undefined, closePath: () => undefined, stroke: () => undefined,
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'globalAlpha' ? state.globalAlpha : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number; else obj[key as string] = value;
      return true;
    },
  });
  drawPerspectiveHorses(ctx as never, course, scene.camera, [horse], {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    // ★馬番ぶん用意すること（足りないと影の分岐に入らず、検査が「呼ばれていない」で落ちる）
    frameImagesByGate: [[FRAME], [FRAME]],
    fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
  });
  const basis = cameraBasis(scene.camera);
  const ground = posOf(course, horse.s, horse.w);
  const foot = project(scene.camera, basis, { x: ground.x, y: ground.y, z: 0 });
  const reach = HORSE_HEIGHT_M * sunShadowLengthPerM();
  const expectedTip = project(scene.camera, basis, {
    x: ground.x + Math.cos(SUN_AZIMUTH_RAD) * reach,
    y: ground.y + Math.sin(SUN_AZIMUTH_RAD) * reach,
    z: 0,
  });
  return { calls, alphas, foot, expectedTip, pxPerM: foot.pxPerM };
}

/** 変形から、スプライト上端（y=−hpx）が落ちる先＝影の先端を復元する */
function impliedTip(t: number[], foot: { x: number; y: number }, hpx: number) {
  const [, , c, d] = t as [number, number, number, number];
  return { x: c! * -hpx + foot.x, y: d! * -hpx + foot.y };
}

describe('太陽と影', () => {
  it('影の長さは高度から決まる（低いほど長い）', () => {
    expect(sunShadowLengthPerM((45 * Math.PI) / 180)).toBeCloseTo(1, 6);
    expect(sunShadowLengthPerM((18 * Math.PI) / 180)).toBeCloseTo(3.0777, 3);
    // ★高度 0 で発散しないこと（下限を持たせている）
    expect(Number.isFinite(sunShadowLengthPerM(0))).toBe(true);
  });

  /**
   * ★本題: 影の先端が**世界で決めた点**に一致すること。
   */
  it('★影の先端は「地面を太陽の方位へ 高さ/tan(高度) 進んだ点」の投影と一致する', () => {
    const horse = { gate: 1, s: 900, w: 6 };
    const r = transformArgs(horse, 1056);
    expect(r.calls.length).toBeGreaterThan(0);
    const hpx = HORSE_HEIGHT_M * r.pxPerM;
    const tip = impliedTip(r.calls[0]!, r.foot, hpx);
    expect(tip.x).toBeCloseTo(r.expectedTip.x, 3);
    expect(tip.y).toBeCloseTo(r.expectedTip.y, 3);
  });

  /**
   * ★コーナーの内と外で、影が**世界では同じ方向**を向いていること。
   *
   *   画面上の向きは遠近で変わるので比べられません。**世界へ戻して**比べます:
   *   足元と先端はどちらも投影後の点なので、それぞれに対応する世界点の差を見ます。
   *   ⚠️ 対照として「旧実装（進行方向基準）ならどうなるか」も置きます。
   *      旧実装では 2 頭の**進行方向が違う**ので、この一致は成り立ちません。
   */
  it('★コースのどこにいても影は同じ世界方向へ伸びる（太陽は 1 つ）', () => {
    const inner = { gate: 1, s: 880, w: 2.5 };
    const outer = { gate: 2, s: 940, w: 17.5 };
    for (const horse of [inner, outer]) {
      const r = transformArgs(horse, 1056);
      expect(r.calls.length, `gate ${horse.gate} の影が描かれていない`).toBeGreaterThan(0);
      const hpx = HORSE_HEIGHT_M * r.pxPerM;
      const tip = impliedTip(r.calls[0]!, r.foot, hpx);
      expect(tip.x).toBeCloseTo(r.expectedTip.x, 3);
      expect(tip.y).toBeCloseTo(r.expectedTip.y, 3);
    }
    /**
     * ★対照: 2 頭の**進行方向**は違う（＝旧実装なら影の向きも違っていた）。
     *   これが同じなら、この検査はコーナーを見ていないことになります（R-21）。
     */
    const headingOf = (h: { s: number; w: number }): number => {
      const a = posOf(course, h.s, h.w); const b = posOf(course, h.s + 1, h.w);
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    expect(Math.abs(headingOf(inner) - headingOf(outer))).toBeGreaterThan(0.05);
  });

  it('影の濃さは長さと対の定数から引く', () => {
    const r = transformArgs({ gate: 1, s: 900, w: 6 }, 1056);
    expect(r.alphas[0]).toBeCloseTo(SUN_SHADOW_ALPHA, 6);
  });
});
