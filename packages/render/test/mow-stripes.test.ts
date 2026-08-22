/**
 * ★**芝の縞刈り**（設計 1-3）が、絵に出る形で描かれていることを留める
 *
 * 【参考で確かめたこと】
 *   ★近寄りのカット（62s / 104s）には**縞は見えません**。被写体ブラーと逆光で潰れます。
 *   見えるのは**引きのカット**（`out/judge/ref-high.png` 67s / 69s）で、
 *   芝に明暗の帯が並びます。★つまりこの機構は**引きの画のためのもの**です。
 *
 * 【★この検査が生まれた実害（2026-08-22）】
 *   最初、間引きを「**頂点のどれかが画面内か**」で書きました。帯は走路の内外へ 140m 伸びるので、
 *   ★**画面を横切っていても頂点は全部画面外**です。結果、**帯が 1 本しか描かれませんでした。**
 *   ⚠️ α を 0.05 にしていたので「薄すぎて見えないのだろう」と誤読しかけました。
 *      α を 0.6 に振って**機構が動いているかを先に確かめて**気づきました（R-21）。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { posOf } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawMowStripes, MOW_STRIPE_ALPHA, MOW_STRIPE_PERIOD_M } from '../src/mow-stripes.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** fill された多角形の色とαを記録する */
function recorder() {
  const fills: { style: unknown; alpha: number }[] = [];
  const state = { globalAlpha: 1, fillStyle: '' as unknown };
  const target: Record<string, unknown> = {
    beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
    fill: () => fills.push({ style: state.fillStyle, alpha: state.globalAlpha }),
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
  return { ctx, fills };
}

function projectorFor(shotId: string, focusS: number) {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: focusS - i * 3, w: 2 + i * 1.4, staminaRatio: 1 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
  const basis = cameraBasis(scene.camera);
  return {
    scene,
    projectGround: (s: number, w: number) => {
      const p = posOf(course, s, w);
      const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      return { x: q.x, y: q.y, depth: q.depth };
    },
  };
}

function stripesAt(shotId: string, focusS: number, opts = {}) {
  const { projectGround } = projectorFor(shotId, focusS);
  const { ctx, fills } = recorder();
  drawMowStripes(ctx as never, course, projectGround, VIEWPORT, { focusS, ...opts });
  return fills;
}

describe('芝の縞刈り', () => {
  /**
   * ★**帯が複数本出ること。**
   *   ⚠️ 「1 本以上」では駄目です。実害のときも**ちょうど 1 本**出ていました（R-16）。
   */
  it('★引きのカットで帯が何本も並ぶ（頂点が全部画面外でも描く）', () => {
    const fills = stripesAt('fourth-corner-front', 894);
    expect(fills.length).toBeGreaterThanOrEqual(6);
  });

  it('★明部と暗部が交互で、濃さは同じ（芝全体の明るさを変えない）', () => {
    const fills = stripesAt('fourth-corner-front', 894);
    const styles = new Set(fills.map((f) => String(f.style)));
    expect(styles.size).toBe(2);
    for (const f of fills) expect(f.alpha).toBeCloseTo(MOW_STRIPE_ALPHA, 9);
  });

  it('★止めれば 1 本も描かない（対照）', () => {
    expect(stripesAt('fourth-corner-front', 894, { alpha: 0 })).toHaveLength(0);
    expect(stripesAt('fourth-corner-front', 894, { periodM: 0 })).toHaveLength(0);
  });

  it('★周期は実寸で一定 — 寄っても引いても本数は画角なりに変わる', () => {
    const wide = stripesAt('fourth-corner-front', 894).length;
    const close = stripesAt('homestretch-side', 1200).length;
    // 寄りのカット（走路方向の視野が 8m 弱）では、10m 周期の帯はほとんど入らない
    expect(close).toBeLessThan(wide);
    expect(MOW_STRIPE_PERIOD_M).toBeGreaterThan(0);
  });

  it('★決定論 — 同じ入力なら同じ描画（憲法4）', () => {
    const a = stripesAt('fourth-corner-front', 894);
    const b = stripesAt('fourth-corner-front', 894);
    expect(a.map((f) => String(f.style))).toEqual(b.map((f) => String(f.style)));
  });

  it('★注視点が進むと帯も進む（世界に固定されている・その場に貼り付かない）', () => {
    const a = stripesAt('fourth-corner-front', 894);
    const b = stripesAt('fourth-corner-front', 894 + MOW_STRIPE_PERIOD_M / 2);
    // 明暗の並びが同じ位相のまま動かない＝画面に貼り付いている、を弾く
    expect(a.map((f) => String(f.style)).join('')).not.toEqual(b.map((f) => String(f.style)).join(''));
  });
});
