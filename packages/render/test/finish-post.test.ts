/**
 * ★**ゴール板と決勝線**（設計 2-3）
 *
 * 【★見ているのは 3 つの壊れ方】
 *   ① ゴール前でないのに出す → コースの途中にゴール板が立つ
 *   ② 横視点（パララックス）でも出す → プレートの決勝線と**二重**になる
 *   ③ 決勝線を両端 2 点で結ぶ → 曲率のある区間で線が走路からずれる
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene, drawBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { FINISH_POST_COLORS, FINISH_POST_INSET_M, drawFinishPost } from '../src/finish-post.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

function recorder() {
  const ops: string[] = [];
  const state = { fillStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    fillRect: () => ops.push(`fillRect:${String(state.fillStyle)}`),
    fill: () => ops.push('fill'),
    beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
    closePath: () => undefined, drawImage: () => undefined, stroke: () => undefined,
    ellipse: () => undefined, fillText: () => ops.push('fillText'),
    measureText: () => ({ width: 10 }),
    save: () => undefined, restore: () => undefined, transform: () => undefined,
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
  return { ctx, ops };
}

function postAt(leaderS: number) {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: leaderS - i * 3, w: 2 + (i % 4) * 2.2 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'fourth-corner-front' });
  const { ctx, ops } = recorder();
  drawFinishPost(ctx as never, course, scene.camera, { focusS: scene.focusS });
  return ops;
}

describe('ゴール板と決勝線', () => {
  it('★ゴール前では柱と決勝線が描かれる', () => {
    const ops = postAt(1560);
    expect(ops.filter((o) => o === 'fill').length).toBeGreaterThan(3);   // ③ 決勝線が刻まれている
    expect(ops).toContain(`fillRect:${FINISH_POST_COLORS.post}`);        // 柱・板
  });

  /** ★①: 遠く離れた場所では出さない */
  it('★コースの途中では出さない（対照）', () => {
    expect(postAt(600)).toEqual([]);
    expect(postAt(1000)).toEqual([]);
  });

  it('★柱は内ラチの外側に立つ（走路には掛からない）', () => {
    expect(FINISH_POST_INSET_M).toBeLessThan(0);
  });

  /**
   * ★②: 横視点では描かない（プレートに既に決勝線・審判塔の絵がある）。
   *   ⚠️ 対照として、透視ワールドのときは描くことも見ます。
   */
  it('★横視点では描かない／透視ワールドでは描く', () => {
    const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 1560 - i * 3, w: 2 + (i % 4) * 2.2 }));
    const draw = (texturedWorld: unknown) => {
      const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false,
        { forceShotId: texturedWorld === undefined ? 'finish-line' : 'fourth-corner-front' });
      const { ctx, ops } = recorder();
      drawBroadcastV2Scene(ctx as never, course, scene, {
        palette: {},
        // ★馬の素材は要らないが、口だけは埋めないと描画側が落ちる
        libraries: new Proxy({}, {
          get: () => ({ sheet: 'x', sheetWidth: 800, spec: { frames: 8, cellH: 100 } }),
        }) as never,
        fieldSize: 12,
        frameOf: () => 0, frameRoleOf: () => 'frame-1',
        surface: 'turf', condition: 'good', kickupColor: '#738b43',
        mowStripes: false, distancePoles: false,
        texturedWorld: texturedWorld as never,
      });
      return ops;
    };
    const world = {
      turf: { image: 'x', width: 64, height: 64, pxPerM: 90 },
      panorama: { image: 'x', width: 64, height: 64, horizonY: 32 },
      scenery: {},
    };
    /**
     * ★**色で見分ける。**「fillRect が呼ばれたか」では駄目です — 世界の描画自体が
     *   何百回も fillRect を呼ぶので、ゴール板の有無を区別できません（実際に区別できず落ちた）。
     */
    const postFills = (ops: string[]): number => ops.filter((o) => o === `fillRect:${FINISH_POST_COLORS.post}`).length;
    expect(postFills(draw(world))).toBeGreaterThan(0);
    expect(postFills(draw(undefined))).toBe(0);
  });
});
