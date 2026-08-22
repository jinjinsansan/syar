/**
 * ★**満員のスタンド**（設計 2-1・デザイナー依頼 D-1 の代替）
 *
 * 【★この検査が見ているのは「人が出るか」ではなく、出ていても壊れている 4 つの形です】
 *   ① 格子で並べる → **砂嵐**になる（観客席は段なので、人は段に沿って横一列に並ぶ）
 *   ② 屋根の上に人が乗る → 数字を手で書いていると、素材を差し替えた瞬間に黙って起きる
 *   ③ 樹木の上に人が乗る → 緑の判定が甘いと抜ける（実際に抜けた）
 *   ④ 屋根の下と外を同じ密度・同じ明るさで塗る → スタンドが**平らな 1 枚の面**になる
 */
import { describe, it, expect } from 'vitest';
import { paintCrowd, seatBandFromPixels, seatMaskFromPixels } from '../src/crowd.js';

/** 置かれた点の座標と色を記録する */
function recorder() {
  const dots: { x: number; y: number; style: unknown; alpha: number }[] = [];
  const state = { globalAlpha: 1, fillStyle: '' as unknown };
  const target: Record<string, unknown> = {
    fillRect: (x: number, y: number) => dots.push({ x, y, style: state.fillStyle, alpha: state.globalAlpha }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'globalAlpha' ? state.globalAlpha : key === 'fillStyle' ? state.fillStyle
      : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number;
      else if (key === 'fillStyle') state.fillStyle = value;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, dots };
}

/** 人（頭）だけを取り出す。頭の下の「体」は暗い固定色なので除く */
const heads = <T extends { style: unknown }>(dots: readonly T[]): T[] => dots.filter((d) => String(d.style).startsWith('#'));

/**
 * 合成素材: 上 20px が明るい屋根、その下が座席（明るさを 2 段に分ける）、
 * 右端 20px は緑（樹木）。
 */
function fakeStand(width = 200, height = 100): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  const put = (i: number, r: number, g: number, b: number) => {
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (x >= width - 20) put(i, 40, 78, 42);              // 樹木（緑）
      else if (y < 20) put(i, 150, 152, 155);               // 屋根（明るい）
      else if (y < 60) put(i, 20, 21, 24);                  // 屋根の下（暗い座席）
      else put(i, 38, 39, 43);                              // 開放スタンド（明るい座席）
    }
  }
  return px;
}

describe('満員のスタンド', () => {
  const W = 200, H = 100;
  const px = fakeStand(W, H);
  const band = seatBandFromPixels(px, W, H);
  const mask = seatMaskFromPixels(px, W, H, band);

  /** ★②: 屋根の帯を素材から見つけていること */
  it('★屋根を素材から見つけ、その下だけを使う', () => {
    expect(band.minY).toBeGreaterThanOrEqual(19);
    expect(band.minY).toBeLessThanOrEqual(21);
    expect(band.maxY).toBe(H);
    // 対照: 屋根の中は座席と判定されない
    expect(mask(10, 5)).toBe(0);
    expect(mask(10, 70)).toBeGreaterThan(0);
  });

  /** ★③: 樹木には置かない */
  it('★樹木の上には人を置かない', () => {
    expect(mask(W - 5, 70)).toBe(0);
    const { ctx, dots } = recorder();
    paintCrowd(ctx as never, W, H, mask);
    expect(heads(dots).every((d) => d.x < W - 20)).toBe(true);
  });

  /** ★①: 段に沿って並んでいること（格子でも一様でもない） */
  it('★人は段に沿って横一列に並ぶ（砂嵐にしない）', () => {
    const { ctx, dots } = recorder();
    paintCrowd(ctx as never, W, H, mask, { rowPitchPx: 5 });
    const ys = new Set(heads(dots).map((d) => d.y));
    /**
     * 段の間隔 5px・上下のゆらぎ ±1px なので、y は「5 の倍数」か「その +1」だけ。
     * ★一様に散らしていれば、この集合は 5 の倍数以外で埋まります。
     */
    for (const y of ys) expect([0, 1]).toContain(y % 5);
    expect(ys.size).toBeGreaterThan(4);      // 段が 1 本だけ、ではない
  });

  /** ★④: 暗いところは自動的にまばら・暗くなること */
  it('★屋根の下は外よりまばらで暗い（平らな面にしない）', () => {
    const { ctx, dots } = recorder();
    paintCrowd(ctx as never, W, H, mask);
    const inside = heads(dots).filter((d) => d.y < 60);
    const outside = heads(dots).filter((d) => d.y >= 60);
    expect(inside.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
    const density = (rows: number, list: unknown[]) => list.length / rows;
    expect(density(40, inside)).toBeLessThan(density(40, outside));
    const meanAlpha = (list: { alpha: number }[]) => list.reduce((a, b) => a + b.alpha, 0) / list.length;
    expect(meanAlpha(inside)).toBeLessThan(meanAlpha(outside));
  });

  it('★決定論 — 同じシードなら何度焼いても同じ（憲法4）', () => {
    const a = recorder(); paintCrowd(a.ctx as never, W, H, mask);
    const b = recorder(); paintCrowd(b.ctx as never, W, H, mask);
    expect(a.dots).toEqual(b.dots);
    // 対照: シードを変えれば別の群衆になる
    const c = recorder(); paintCrowd(c.ctx as never, W, H, mask, { seed: 4242 });
    expect(c.dots).not.toEqual(a.dots);
  });

  it('座席が無ければ 1 人も置かない（対照）', () => {
    const { ctx, dots } = recorder();
    const placed = paintCrowd(ctx as never, W, H, () => 0);
    expect(placed).toBe(0);
    expect(dots).toEqual([]);
  });
});
