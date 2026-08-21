/**
 * ★固定カメラの据え位置が、カットの中で動かないことを留める
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   固定カメラは `broadcastV2SegmentSpan(course, leaderS).end`＝
 *   **先頭の現在位置が属するコース区間の終点**に据えていました。
 *   カットの途中で馬が区間の境界を跨ぐと、★**カメラが次の区間の終点へ瞬間移動**します。
 *
 *   実測（4 角正面・注視点 890m→900m）:
 *     画角 **12.82° → 2.80°（−78%）**、馬が **1 コマで 517px** 跳び、大きさが **33% 変わる**。
 *   ★オーナー評「カーブから曲がってくる時が雑、滑らかに走っていない」。
 *
 * → **台本のカットの終わり**を基準にする。カットの中では動かないので跳ばない。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { broadcastV2ShotEndM } from '../src/broadcast-v2.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const sceneAt = (s: number) => {
  const horses = Array.from({ length: 12 }, (_, i) => ({
    gate: i + 1, s: s - i * 2, w: 2 + i * 1.4, staminaRatio: 1,
  }));
  return resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
    { forceShotId: 'fourth-corner-front' });
};

describe('★固定カメラ（4 角正面）', () => {
  it('★★カットの範囲では視点が 1 mm も動かない', () => {
    /**
     * ★台本 v4 で 4 角正面は 800〜1056m。★**元の不具合はこの範囲の途中（≈895m）で起きていた。**
     */
    const eyes = [];
    for (let s = 800; s <= 1056; s += 8) {
      const e = sceneAt(s).camera.eye;
      eyes.push(`${e.x.toFixed(3)},${e.y.toFixed(3)},${e.z.toFixed(3)}`);
    }
    expect(new Set(eyes).size, 'カットの中で視点が動いています').toBe(1);
  });

  it('★★画角がカットの中で崩落しない（1 コマで 12% 超の変化がない）', () => {
    /**
     * ⚠️ ★元の不具合では **12.82° → 2.80°（−78%）** の崩落が起きた。
     *    画角は距離から自動で決まるので、視点が跳べば必ずここに出る。
     */
    let prev: number | undefined;
    let worst = 0;
    for (let s = 800; s <= 1056; s += 4) {
      const fov = (sceneAt(s).camera.fovY * 180) / Math.PI;
      if (prev !== undefined) worst = Math.max(worst, Math.abs(fov / prev - 1) * 100);
      prev = fov;
    }
    expect(worst, `画角が 1 手で ${worst.toFixed(1)}% 変化しています`).toBeLessThan(12);
  });

  it('★据え位置は台本のカットの終わりから決まる', () => {
    expect(broadcastV2ShotEndM(course, 'fourth-corner-front')).toBeCloseTo(1056, 6);
    // ★台本に無いショットは undefined（呼び出し側が区間の終点にフォールバックする）
    expect(broadcastV2ShotEndM(course, 'winner-follow')).toBeUndefined();
  });

  it('★注視点は馬群に追従して動く（カメラが固定でも画は止まらない）', () => {
    const a = sceneAt(820).camera.target;
    const b = sceneAt(1000).camera.target;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });
});
