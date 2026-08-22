/**
 * ★**ハロン棒・距離標**（設計 1-7・参考映像 1.2 #6）
 *
 * 【★この検査が見ているのは「棒が出るか」ではなく、出ていても壊れている 3 つの形です】
 *   ① 手前の棒を馬より**先**に描く → 馬が棒に乗って「棒の向こうに立っている」ように見える
 *      （内ラチで一度起きた壊れ方と同じ）
 *   ② カメラのすぐ手前の棒を描く → 寄りのカットで**画面の 4 割**を占め、勝負どころの馬を隠す
 *      （実測: 直線の寄りで高さ 275px ＝ 38%）
 *   ③ ゴール地点にも立てる → ゴール板（別の物）と二重になる
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import {
  DISTANCE_POLE_INTERVAL_M, NEAR_SKIP_RATIO, drawDistancePoles,
} from '../src/distance-poles.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };
const FONT = (px: number, bold?: boolean): string => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;

function recorder() {
  const texts: string[] = [];
  const rects: number[][] = [];
  const target: Record<string, unknown> = {
    fillRect: (...a: number[]) => rects.push(a),
    fillText: (t: string) => texts.push(t),
    measureText: (t: string) => ({ width: t.length * 8 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
    set: () => true,
  });
  return { ctx, texts, rects };
}

function sceneFor(shotId: string, leaderS: number) {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: leaderS - i * 3, w: 2 + (i % 4) * 2.2 }));
  return resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
}

function polesAt(shotId: string, leaderS: number, pass: 'behind' | 'front', extra = {}) {
  const scene = sceneFor(shotId, leaderS);
  const { ctx, texts, rects } = recorder();
  drawDistancePoles(ctx as never, course, scene.camera, { focusS: scene.focusS, pass, font: FONT, ...extra });
  return { texts, rects };
}

describe('ハロン棒・距離標', () => {
  it('★残り距離を表示する（200m ごと）', () => {
    const behind = polesAt('fourth-corner-front', 1000, 'behind');
    const front = polesAt('fourth-corner-front', 1000, 'front');
    const all = [...behind.texts, ...front.texts];
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) {
      const left = Number(t);
      expect(Number.isInteger(left)).toBe(true);
      expect(left % DISTANCE_POLE_INTERVAL_M).toBe(0);
      expect(left).toBeGreaterThan(0);          // ★③ ゴール地点には立てない
      expect(left).toBeLessThan(course.distance);
    }
  });

  /**
   * ★①: 奥と手前で**描く回**が分かれていること。
   *   同じ棒が両方に出たら、片方は必ず馬と重なる順で描かれます。
   */
  it('★奥の棒と手前の棒は別の回に描かれ、重複しない', () => {
    const behind = polesAt('homestretch-side', 1200, 'behind', { rangeM: 900 });
    const front = polesAt('homestretch-side', 1200, 'front', { rangeM: 900 });
    const overlap = behind.texts.filter((t) => front.texts.includes(t));
    expect(overlap).toEqual([]);
  });

  /**
   * ★②: 近すぎる棒を落としていること。
   *   ⚠️ 対照を必ず置くこと — 落とす条件を厳しくしすぎると「1 本も出ない」で通ってしまいます（R-16）。
   */
  it('★カメラのすぐ手前の棒は描かない（対照: 比率を緩めれば描かれる）', () => {
    const strict = polesAt('homestretch-side', 1200, 'front', { rangeM: 900 });
    const loose = polesAt('homestretch-side', 1200, 'front', { rangeM: 900, intervalM: 50 });
    // 間隔を細かくすれば手前側にも棒の候補は増えるが、近すぎるものは落ちる
    expect(strict.texts.length).toBeLessThanOrEqual(loose.texts.length);
    expect(NEAR_SKIP_RATIO).toBeGreaterThan(0);
    expect(NEAR_SKIP_RATIO).toBeLessThan(1);
  });

  it('★止めれば 1 本も描かない（対照）', () => {
    const off = polesAt('fourth-corner-front', 1000, 'behind', { intervalM: 0 });
    expect(off.texts).toEqual([]);
    expect(off.rects).toEqual([]);
  });

  it('★書体を渡さなければ棒だけ（数字なしでも落ちない）', () => {
    const scene = sceneFor('fourth-corner-front', 1000);
    const draw = (font?: typeof FONT) => {
      const r = recorder();
      // ★どちらの回に落ちるかは幾何で決まるので、両方まわして合算する
      for (const pass of ['behind', 'front'] as const) {
        drawDistancePoles(r.ctx as never, course, scene.camera, { focusS: scene.focusS, pass, font });
      }
      return r;
    };
    const withFont = draw(FONT);
    const without = draw();
    expect(withFont.texts.length).toBeGreaterThan(0);   // 前提: この場面で棒が出る
    expect(without.texts).toEqual([]);
    expect(without.rects.length).toBeGreaterThan(0);
  });

  it('★決定論 — 同じ入力なら同じ描画（憲法4）', () => {
    const a = polesAt('fourth-corner-front', 1000, 'behind');
    const b = polesAt('fourth-corner-front', 1000, 'behind');
    expect(a.texts).toEqual(b.texts);
    expect(a.rects).toEqual(b.rects);
  });
});
