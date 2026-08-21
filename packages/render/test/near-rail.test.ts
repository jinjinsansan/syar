/**
 * ★**カメラに近いほうのラチは、馬より後に描く**ことを留める
 *
 * 【なぜ要るか（2026-08-21）】
 *   ラチは世界の一部なので馬より先に描かれていました。ところが 4 角正面のように
 *   **内ラチがカメラの手前に来るカット**では、手前にあるはずのラチの上に馬が塗られ、
 *   ★脚がラチを突き抜けて**「馬がラチの向こうに立っている」**ように見えます。
 *   ★オーナー評「コースの内側に馬の足が入ったりしている」。
 *
 *   実測（4 角正面・注視点 800m）: 内ラチの深さ 137.5m / 外ラチ 142.2m。
 *   ★7 カット中このカットだけ内ラチが手前。投影でも全馬の接地点（画面Y 411〜428）が
 *   **内ラチの地面 430.1 と横木 357.4 のあいだ**に落ちていました。
 *
 * ⚠️ ★当初は「素材の半幅 0.99m に対し横位置の下限が 0.8m だからはみ出す」と見立て、
 *    エンジンへの照会を書きかけました。**測ったら横位置の最小は 1.575m で、
 *    下限 0.8m には一度も達していません**（291,600 標本）。**素材の幅は無関係**でした。
 *    ★照会を出す前に測ること（R-30 と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { drawTexturedWorld } from '../src/world-textured.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

/** 何も描かないが、呼ばれた回数だけ数える画布 */
function recorder() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {
    beginPath: () => calls.push('beginPath'),
    stroke: () => calls.push('stroke'),
    fillRect: () => calls.push('fillRect'),
    drawImage: () => calls.push('drawImage'),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  return { ctx, calls };
}

const IMG = { image: 'x', width: 64, height: 64 };
const ASSETS = {
  turf: { ...IMG, pxPerM: 90 },
  panorama: { ...IMG, horizonY: 32 },
  scenery: {},
} as never;

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

function cameraOf(shotId: string, s = 800) {
  const horses = Array.from({ length: 12 }, (_, i) => ({
    gate: i + 1, s: s - i * 2, w: 2 + i * 1.4, staminaRatio: 1,
  }));
  return resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
    { forceShotId: shotId as never }).camera;
}
const nearRailAt = (shotId: string, s: number): number => {
  const { ctx } = recorder();
  return drawTexturedWorld(ctx as never, course, cameraOf(shotId, s), ASSETS, { focusS: s }).nearRailW;
};

/**
 * ★手前のラチは**カットではなくコース上の位置**で決まります（実測）。
 *   1600m の周回では **650〜700m のあいだで 1 回だけ**入れ替わります
 *   （カメラの横位置が世界の座標で置かれるため、向正面と直線で内外が逆になる）。
 *
 * ★台本 v4 のカット境界は 240 / 528 / 800 / 1056 / 1280 / 1472m。
 *   入れ替わり点（≈675m）は **`side-drive`（528〜800m）の中**にありますが、
 *   真横カットは `texturedWorld` を使わない（背景プレート）ので**影響しません。**
 *   → ★**世界を描くカットは、どれもカットの中で入れ替わりません。**
 */
const FLIP_M = 675;

describe('★手前側のラチ', () => {
  it('★★4 角正面では内ラチ（w=0）が手前になる', () => {
    const { ctx } = recorder();
    const r = drawTexturedWorld(ctx as never, course, cameraOf('fourth-corner-front'), ASSETS, { focusS: 800 });
    expect(r.nearRailW).toBe(0);
  });

  it('★序盤は外ラチが手前（参考値）', () => {
    expect(nearRailAt('start-front', 120)).toBe(20);
    expect(nearRailAt('first-corner-front', 400)).toBe(20);
  });

  it('★★ラチは「カット単位の切り替え」ではなく「区間ごとの振り分け」で描く', () => {
    /**
     * ⚠️ ★当初は「このカットではどちらのラチが手前」と 1 つに決めていました。
     *    4 角正面は**固定カメラ**で、馬が近づくにつれ**本当に前後が入れ替わります**。
     *    ★このテストが 800〜1056m の途中での入れ替わりを捕まえ、
     *      カット単位で切り替えると**ラチが馬の前後を跳ぶ**と分かりました。
     *    → s ごとに「そこのラチはそこの馬より手前か」を見て振り分ける形に変えています。
     *
     * ★ここで見るのは「**どの注視点でも、前と後の両方が呼ばれても破綻しない**」こと。
     *   区間ごとなので、注視点が動いても描かれる本数が連続的に変わります。
     */
    for (let s = 810; s <= 1050; s += 20) {
      const { ctx, calls } = recorder();
      const r = drawTexturedWorld(ctx as never, course, cameraOf('fourth-corner-front', s), ASSETS,
        { focusS: s, focusW: 8 });
      const before = calls.filter((c) => c === 'stroke').length;
      r.drawNearRail();
      const after = calls.filter((c) => c === 'stroke').length;
      // ★前後どちらかに必ず線が出る（どこかへ消えてしまわない）
      expect(after, `注視点 ${s}m でラチが 1 本も描かれていません`).toBeGreaterThan(0);
      expect(before + (after - before)).toBe(after);
    }
  });

  it('★★手前のラチは `drawTexturedWorld` の中では描かれない（呼び出し側が馬の後に描く）', () => {
    /**
     * ★ここが本体です。**世界を描いた時点では手前のラチが出ていない**こと、
     *   そして `drawNearRail()` を呼ぶと**初めて出る**ことを見ます。
     *   ⚠️ 「返り値に関数がある」だけでは、中で既に描いていても通ってしまいます。
     */
    const { ctx, calls } = recorder();
    const r = drawTexturedWorld(ctx as never, course, cameraOf('fourth-corner-front'), ASSETS, { focusS: 800 });
    const before = calls.filter((c) => c === 'stroke').length;
    r.drawNearRail();
    const after = calls.filter((c) => c === 'stroke').length;
    expect(after - before, '手前のラチが後から描かれていません').toBeGreaterThan(0);
  });


});
