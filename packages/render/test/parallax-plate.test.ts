import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../src/oblique-draw.js';
import { drawParallaxPlate, parallaxLayerShiftPx, type ParallaxPlate } from '../src/parallax-plate.js';

interface Call { readonly img: string; readonly dx: number; readonly dy: number; readonly dw: number; readonly dh: number }

function recorder(): { ctx: Ctx2D<string>; calls: Call[] } {
  const calls: Call[] = [];
  const noop = (): void => {};
  const ctx: Ctx2D<string> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', globalAlpha: 1,
    fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop, stroke: noop,
    ellipse: noop, fillText: noop, measureText: () => ({ width: 0 }),
    drawImage: (img, _sx, _sy, _sw, _sh, dx, dy, dw, dh) => { calls.push({ img, dx, dy, dw, dh }); },
  };
  return { ctx, calls };
}

const plate: ParallaxPlate<string> = {
  plateWidth: 1672, plateHeight: 941,
  layers: [
    { image: 'stand', width: 1450, height: 154, plateY0: 188, plateY1: 342, depthOffsetM: 70 },
    { image: 'turf', width: 1500, height: 94, plateY0: 578, plateY1: 672, depthOffsetM: -3 },
    { image: 'front', width: 835, height: 179, plateY0: 762, plateY1: 941, depthOffsetM: -13 },
  ],
};
const base = { viewport: { width: 1280, height: 720 }, zoom: 1.14, verticalAnchor: 0.48, packPxPerM: 80, packDepthM: 29 } as const;

describe('parallax plate', () => {
  it('scrolls nearer layers faster than farther layers, against the direction of travel', () => {
    const opts = { scrollM: 10, packPxPerM: 80, packDepthM: 29, direction: 1 as const };
    const stand = parallaxLayerShiftPx({ depthOffsetM: 70 }, opts);
    const turf = parallaxLayerShiftPx({ depthOffsetM: 0 }, opts);
    const front = parallaxLayerShiftPx({ depthOffsetM: -13 }, opts);
    // 注視点の層は px/m そのまま: 10m × 80px/m = 800px、進行が右なら世界は左へ
    expect(turf).toBeCloseTo(-800, 6);
    expect(Math.abs(stand)).toBeLessThan(Math.abs(turf));
    expect(Math.abs(front)).toBeGreaterThan(Math.abs(turf));
    // 進行が左なら世界は右へ
    expect(parallaxLayerShiftPx({ depthOffsetM: 0 }, { ...opts, direction: -1 })).toBeCloseTo(800, 6);
    // 位置から決まる（進んでいなければ動かない）
    expect(parallaxLayerShiftPx({ depthOffsetM: -13 }, { ...opts, scrollM: 0 }) === 0).toBe(true);
  });

  it('covers the whole viewport width with tiles for every layer, at the plate framing', () => {
    for (const scrollM of [0, 3.7, 250, 1599.9]) {
      const { ctx, calls } = recorder();
      drawParallaxPlate(ctx, plate, { ...base, scrollM, direction: 1 });
      for (const layer of plate.layers) {
        const mine = calls.filter((c) => c.img === layer.image).sort((a, b) => a.dx - b.dx);
        expect(mine.length).toBeGreaterThan(0);
        // 左端は画面外から始まり、右端は画面幅を超える（隙間なし）
        expect(mine[0]!.dx).toBeLessThanOrEqual(0);
        expect(mine[mine.length - 1]!.dx + mine[mine.length - 1]!.dw).toBeGreaterThanOrEqual(1280);
        for (let i = 1; i < mine.length; i++) {
          expect(mine[i]!.dx).toBeLessThanOrEqual(mine[i - 1]!.dx + mine[i - 1]!.dw);
        }
        // 縦の位置は旧プレートのクロップと同じ式（zoom 1.14・anchor 0.48）
        const scale = 1280 / (1672 / 1.14);
        const cropY0 = (941 - 720 / scale) * 0.48;
        expect(mine[0]!.dy).toBeCloseTo((layer.plateY0 - cropY0) * scale, 6);
      }
    }
  });

  it('is deterministic for the same scroll distance', () => {
    const a = recorder(); const b = recorder();
    drawParallaxPlate(a.ctx, plate, { ...base, scrollM: 812.25, direction: 1 });
    drawParallaxPlate(b.ctx, plate, { ...base, scrollM: 812.25, direction: 1 });
    expect(a.calls).toEqual(b.calls);
  });
});
