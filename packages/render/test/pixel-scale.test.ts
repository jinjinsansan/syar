/**
 * ★**画面の物理画素で描く — その倍率と、地面の走査線**（★2026-09-12）
 *
 * 【★経緯】★オーナー評「★絵が滲んでいます」。★測ると ★**1280 の絵を 1728 物理画素へ
 *   1.35 倍に引き伸ばして**表示していました（★引継ぎ書 `HANDOVER_P4_RENDER_SCALE_20260912.md` F-1）。
 *   ★画布を `1280 × dpr` で持ち、★地面の走査線も物理画素の行数で回します（★§2 ①②）。
 *
 * 【★何を留めるか】
 *   ⚠️ ★定数を読むだけの検定にしません。★倍率を上げても ★**呼び出し側が渡し忘れれば
 *      地面だけ 720 段のまま**になります（★実際にそこが F-3 の問題でした・★R-16 の家族）。
 *   → ★`drawTexturedWorld` が ★**実際に何行貼るか**を数えます。
 *
 *   ①★倍率そのもの（★上限 2・★下限 1・★戻し口 `?dpr=1`）
 *   ②★**倍率 1 なら 1 画素も変わらない**（★貼る指示が 1 つ残らず一致すること）
 *   ③★**倍率 1.5 なら地面の行数が 1.5 倍**になり、★貼る高さがその逆数になる
 *   ④★**貼る先が物理画素の格子に乗る**（★半画素ずれると、かえって滲む）
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { drawTexturedWorld } from '../src/world-textured.js';
import { pixelScaleOf, pixelScaleFromSearch, MAX_PIXEL_SCALE } from '../src/pixel-scale.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const CAM = {
  eye: { x: 0, y: -60, z: 12 },
  target: { x: 120, y: 0, z: 0 },
  fovY: (30 * Math.PI) / 180,
  width: 1280, height: 720,
};
const tile = { image: 'turf' as never, width: 256, height: 256, pxPerM: 32 };
const ASSETS = {
  turf: tile,
  panorama: { image: 'pano' as never, width: 2048, height: 512, horizonY: 300 },
};

/** ★地面のタイルを貼った指示だけを拾う（★`drawImage` の引数をそのまま控える） */
function groundStrips(opts: { readonly pixelScale?: number } = {}): number[][] {
  const strips: number[][] = [];
  const target: Record<string, unknown> = {
    drawImage: (img: unknown, ...rest: unknown[]) => {
      if (img === 'turf') strips.push(rest as number[]);
    },
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  drawTexturedWorld(ctx as never, course, CAM, ASSETS, {
    focusS: 400, focusW: 10,
    ...(opts.pixelScale === undefined ? {} : { pixelScale: opts.pixelScale }),
  });
  return strips;
}

/** ★1 行ぶんの貼り付けを「行」にまとめる（★1 行は横に複数回に分けて貼られる） */
const rowsOf = (strips: number[][]): number[] => [...new Set(strips.map((s) => s[5]!))];

describe('★① 倍率そのもの', () => {
  it('★上限は 2（★4K 機で画素数が 9 倍にならない）', () => {
    expect(pixelScaleOf(3)).toBe(MAX_PIXEL_SCALE);
    expect(pixelScaleOf(2.5)).toBe(2);
  });

  /** ⚠️ ★頁を縮小表示していると 1 未満が返ります。★こちらから絵を粗くしないこと */
  it('★下限は 1（★1 未満でも画布を 1280 より小さくしない）', () => {
    expect(pixelScaleOf(0.75)).toBe(1);
    expect(pixelScaleOf(Number.NaN)).toBe(1);
  });

  it('★等倍でない画面ではその倍率を使う', () => {
    expect(pixelScaleOf(1.5)).toBe(1.5);
  });

  it('★戻し口 `?dpr=1` … ★端末が 1.5 でも 1 で描く', () => {
    expect(pixelScaleFromSearch('?dpr=1', 1.5)).toBe(1);
  });

  it('★指定が無ければ端末の値から決める', () => {
    expect(pixelScaleFromSearch('', 1.5)).toBe(1.5);
    expect(pixelScaleFromSearch('?seed=42', 2)).toBe(2);
  });

  it('★数でない指定は無視して端末の値に戻る（★壊れた URL で真っ白にしない）', () => {
    expect(pixelScaleFromSearch('?dpr=abc', 1.5)).toBe(1.5);
  });
});

describe('★②③④ 地面の走査線', () => {
  /**
   * ②★**倍率 1 は、指定なしと 1 つ残らず同じ。**
   * ⚠️ ★ここが「壊していないこと」の担保です。★開始行・刻み・貼る高さのどれかが
   *    ★式ごと変わっていれば、★この検定が落ちます。
   */
  it('★倍率 1 なら、貼る指示が指定なしと完全に一致する', () => {
    expect(groundStrips({ pixelScale: 1 })).toEqual(groundStrips());
  });

  /** ③★**行数が倍率ぶん増え、貼る高さがその逆数になる。** */
  it('★倍率 1.5 なら、地面の行数が 1.5 倍・貼る高さが 1/1.5 になる', () => {
    const one = rowsOf(groundStrips({ pixelScale: 1 }));
    const half = groundStrips({ pixelScale: 1.5 });
    expect(one.length, '★元が 1 行も貼っていないと、この検定は何も見ていない').toBeGreaterThan(100);
    expect(rowsOf(half).length / one.length).toBeCloseTo(1.5, 1);
    for (const s of half) expect(s[7]).toBeCloseTo(1 / 1.5, 6);
  });

  /**
   * ④★**貼る先が物理画素の格子に乗る。**
   * ⚠️ ★半画素ずれたまま貼ると、★ブラウザが縁を混ぜて ★**かえって滲みます**。
   *    ★細かくしたつもりで滲ませる、という形の失敗をここで止めます。
   */
  it('★倍率 1.5 で、貼る先の y が物理画素の整数行に乗る', () => {
    for (const s of groundStrips({ pixelScale: 1.5 })) {
      const physical = s[5]! * 1.5;
      expect(Math.abs(physical - Math.round(physical))).toBeLessThan(1e-6);
    }
  });
});
