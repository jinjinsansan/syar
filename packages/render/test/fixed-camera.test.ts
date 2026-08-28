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
import {
  DEFAULT_RACE_SCRIPT, broadcastV2ScriptBoundariesM, broadcastV2ShotEndM,
} from '../src/broadcast-v2.js';
import type { BroadcastV2Script } from '../src/broadcast-v2.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const sceneAt = (s: number, script?: BroadcastV2Script) => {
  const horses = Array.from({ length: 12 }, (_, i) => ({
    gate: i + 1, s: s - i * 2, w: 2 + i * 1.4, staminaRatio: 1,
  }));
  return resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
    { forceShotId: 'fourth-corner-front', ...(script === undefined ? {} : { script }) });
};

/**
 * ★**走査する範囲を台本から引く**（2026-08-28）。
 *
 * ⚠️ ★この検査は **800〜1056m（v4 の 4 角正面）を直書き**していました。
 *    ★既定が v6 になった途端、★**カットの終わり（966m）を越えて走査**し、
 *    ★画角 14.3% 変化で落ちました。★**v6 の不具合ではありません**。
 *    実測（`tools/_fovscan.mjs`・各台本の自分の範囲）: v4 3.1% / v5 2.8% / v6 2.8%。
 * ★**値を直書きしない。台本から引く。**
 */
const rangeOf = (script: BroadcastV2Script): { start: number; end: number } => {
  const rows = broadcastV2ScriptBoundariesM(course, script);
  const i = rows.findIndex((r) => r.id === 'fourth-corner-front');
  const end = broadcastV2ShotEndM(course, 'fourth-corner-front', script);
  if (i < 0 || end === undefined) throw new Error(`★台本 ${script} に 4 角正面がありません`);
  return { start: i > 0 ? rows[i - 1]!.meters : 0, end };
};

/** ★既定は必ず見る。★v4 も残す（元の不具合が起きた台本） */
const SCRIPTS: readonly BroadcastV2Script[] = [DEFAULT_RACE_SCRIPT, 'v5', 'v4'];

describe('★固定カメラ（4 角正面）', () => {
  it('★★カットの範囲では視点が 1 mm も動かない', () => {
    /** ★元の不具合は v4 の 800〜1056m の途中（≈895m）で起きていた。 */
    for (const script of SCRIPTS) {
      const { start, end } = rangeOf(script);
      const eyes = [];
      for (let s = start; s <= end; s += 8) {
        const e = sceneAt(s, script).camera.eye;
        eyes.push(`${e.x.toFixed(3)},${e.y.toFixed(3)},${e.z.toFixed(3)}`);
      }
      expect(new Set(eyes).size, `台本 ${script}: カットの中で視点が動いています`).toBe(1);
    }
  });

  it('★★画角がカットの中で崩落しない（1 コマで 12% 超の変化がない）', () => {
    /**
     * ⚠️ ★元の不具合では **12.82° → 2.80°（−78%）** の崩落が起きた。
     *    画角は距離から自動で決まるので、視点が跳べば必ずここに出る。
     */
    for (const script of SCRIPTS) {
      const { start, end } = rangeOf(script);
      let prev: number | undefined;
      let worst = 0;
      for (let s = start; s <= end; s += 4) {
        const fov = (sceneAt(s, script).camera.fovY * 180) / Math.PI;
        if (prev !== undefined) worst = Math.max(worst, Math.abs(fov / prev - 1) * 100);
        prev = fov;
      }
      expect(worst, `台本 ${script}: 画角が 1 手で ${worst.toFixed(1)}% 変化しています`).toBeLessThan(12);
    }
  });

  it('★据え位置は台本のカットの終わりから決まる', () => {
    /** ★台本ごとに違う。★既定の値を直書きしない */
    expect(broadcastV2ShotEndM(course, 'fourth-corner-front', 'v4')).toBeCloseTo(1056, 6);
    expect(broadcastV2ShotEndM(course, 'fourth-corner-front', 'v6')).toBeCloseTo(966.4, 6);
    expect(broadcastV2ShotEndM(course, 'fourth-corner-front'))
      .toBe(broadcastV2ShotEndM(course, 'fourth-corner-front', DEFAULT_RACE_SCRIPT));
    // ★台本に無いショットは undefined（呼び出し側が区間の終点にフォールバックする）
    expect(broadcastV2ShotEndM(course, 'winner-follow')).toBeUndefined();
  });

  it('★注視点は馬群に追従して動く（カメラが固定でも画は止まらない）', () => {
    const a = sceneAt(820).camera.target;
    const b = sceneAt(1000).camera.target;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });
});
