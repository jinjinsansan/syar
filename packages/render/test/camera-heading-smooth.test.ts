/**
 * ★**コーナーの継ぎ目でカメラの回り方が跳ばない**（設計 §3 の案 B・2026-08-22）
 *
 * 【何が起きていたか】
 *   コース模型は直線と円弧をそのまま繋いでいるので、曲率が継ぎ目で
 *   ★**0 → 0.300°/m へ一瞬で切り替わります**（`tools/_curvature.mjs`・600m と 1200m）。
 *   16m/s なら **0 → 4.8°/秒**。オーナー評「**コーナーから直線に入る時、かくっと曲がっている**」。
 *
 * 【★ここで測るもの】
 *   カメラの向きの **2 階差分**（回り方の変化）が継ぎ目で跳ねないこと。
 *   ⚠️ 1 階（向きそのもの）は元から連続なので、それを見ても**何も検出できません**。
 *      跳んでいるのは**変化の速さ**のほうです。
 *
 * ⚠️ ★走路の幾何は直していません。直すと `laneExtraM` が変わり着順が変わります（憲法 3・Q-3）。
 *    ここが直すのは**カメラの向け方**だけです。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse, posOf } from '../src/course.js';
import { broadcastCamera } from '../src/perspective-draw.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

/** カメラの向き（度）。目標から視点へのベクトルで測る */
function headingDegAt(atS: number): number {
  const cam = broadcastCamera(course, {
    atS, atW: 10, width: 1280, height: 720, view: 'side',
    preset: { backM: 44, upM: 3.5, sideM: 9, fovDeg: 12 },
  });
  return (Math.atan2(cam.eye.y - cam.target.y, cam.eye.x - cam.target.x) * 180) / Math.PI;
}

/** 継ぎ目をまたぐ範囲での「回り方の変化」の最大値（度/m^2） */
function worstJerk(from: number, to: number, step = 1): { worst: number; at: number } {
  const unwrap = (d: number): number => {
    let v = d;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  };
  let prevH: number | null = null, prevD: number | null = null;
  let worst = 0, at = from;
  for (let s = from; s <= to; s += step) {
    const h = headingDegAt(s);
    const d = prevH === null ? null : unwrap(h - prevH);
    if (d !== null && prevD !== null) {
      const j = Math.abs(d - prevD);
      if (j > worst) { worst = j; at = s; }
    }
    prevH = h; prevD = d;
  }
  return { worst, at };
}

describe('カメラの向きの滑らかさ', () => {
  /**
   * ★直線 → コーナー（600m）と コーナー → 直線（1200m）の両方。
   *   ⚠️ 片方だけ見ると、入口だけ直して出口を見落とします（R-2: 境界は両側）。
   */
  it('★継ぎ目で回り方が跳ばない（600m・1200m の両方）', () => {
    for (const joint of [600, 1200]) {
      const { worst, at } = worstJerk(joint - 60, joint + 60);
      expect(worst, `${joint}m の継ぎ目で跳んでいる（${at}m・${worst.toFixed(4)} 度/m^2）`)
        .toBeLessThan(0.02);
    }
  });

  /**
   * ★対照: **走路そのもの**は跳んだままであること。
   *
   *   ここが跳んでいなければ、この検査は「そもそも跳びの無い場所」を見ていることになり、
   *   カメラの平滑化が効いているかを判定できません（R-21）。
   *   ★同時に「幾何は直していない」ことの記録にもなります。
   */
  it('★対照: 走路の曲率は跳んだまま（幾何は直していない）', () => {
    const head = (m: number): number => {
      const a = posOf(course, m, 10), b = posOf(course, m + 0.5, 10);
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    };
    let prevH: number | null = null, prevD: number | null = null, worst = 0;
    for (let m = 560; m <= 660; m += 1) {
      const h = head(m);
      const d = prevH === null ? null : h - prevH;
      if (d !== null && prevD !== null) worst = Math.max(worst, Math.abs(d - prevD));
      prevH = h; prevD = d;
    }
    // ★実測 0.225 度/m。ここが 0 なら、上の検査は跳びの無い場所を見ていることになる
    expect(worst).toBeGreaterThan(0.1);
  });

  it('直線の途中では元から滑らか（対照）', () => {
    expect(worstJerk(300, 450).worst).toBeLessThan(0.02);
  });
});
