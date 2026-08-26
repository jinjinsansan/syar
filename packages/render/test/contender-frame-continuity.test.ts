/**
 * ★**争っている馬を画角に収める仕組みが、1 コマで跳ばないこと**
 *
 * ⚠️ ★以前は「先頭から `withinM` 以内か否か」の**在/不在**で数えていました。
 *    馬が境目をまたぐと画角が 1 コマで変わり、画面上の馬が大きく後ろへ跳びます。
 *    実測（seed 42・`homestretch-side` 19.83→19.86 秒）: 画角 13.00° → 5.96°、
 *    先頭 3 頭のうち 1 頭が **1113px 後退**。オーナー評「まるで巻き戻しを見ているよう」。
 *
 * ★ここでは**馬を 1 頭ずつ後ろへ動かして**、境目をまたぐ前後で画角が連続かどうかを見ます。
 *   レース結果・着順には触れていません（憲法 3）。
 */
import { describe, expect, it } from 'vitest';
import { ovalCourse } from '../src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';

const DIST = 1600;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★`frameContenders` を持つショット（`withinM` は 16m と 11m） */
const SHOTS = ['homestretch-side', 'side-drive'] as const;

/** ★先頭 1300m、2 番手が `gap` m 後ろ、残りはさらに後ろ */
function fieldWithGap(gap: number): BroadcastV2Horse[] {
  return [
    { gate: 1, s: 1300, w: 5 },
    { gate: 2, s: 1300 - gap, w: 7 },
    ...Array.from({ length: 10 }, (_, i) => ({ gate: i + 3, s: 1300 - 40 - i * 3, w: 6 + (i % 3) })),
  ];
}

const fovOf = (shotId: (typeof SHOTS)[number], gap: number): number =>
  resolveBroadcastV2Scene(course, fieldWithGap(gap), VIEWPORT, false,
    { forceShotId: shotId }).camera.fovY * 180 / Math.PI;

describe('争っている馬を収める画角', () => {
  it('★2 番手が境目をまたいでも、画角が跳ばない', () => {
    for (const shotId of SHOTS) {
      /**
       * ★**刻みの取り方に左右されない形で見ます**＝ 先頭差 1m あたり画角が何度変わるか。
       *   在/不在で数えていたときは、境目でここが**不連続**でした（0.5m の移動で 7.04°）。
       */
      const STEP = 0.05;
      let prev = fovOf(shotId, 4);
      let worst = 0;
      let worstGap = 0;
      for (let gap = 4; gap <= 30; gap += STEP) {
        const now = fovOf(shotId, gap);
        const slope = Math.abs(now - prev) / STEP;
        if (slope > worst) { worst = slope; worstGap = gap; }
        prev = now;
      }
      expect(worst, `${shotId}: 先頭差 ${worstGap.toFixed(1)}m で ${worst.toFixed(1)}°/m`)
        .toBeLessThan(3);
    }
  });

  it('★離れていくほど画角は広がる（向きが逆でない）', () => {
    for (const shotId of SHOTS) {
      const near = fovOf(shotId, 2);
      const far = fovOf(shotId, 10);
      expect(far, `${shotId}: 離れたのに寄っている`).toBeGreaterThanOrEqual(near);
    }
  });

  it('★遠く離れた馬は画角を広げない（際限なく引かない）', () => {
    for (const shotId of SHOTS) {
      /* ★十分に離れた 2 番手は「争っている馬」ではないので、画角に効かない */
      expect(Math.abs(fovOf(shotId, 40) - fovOf(shotId, 60)), shotId).toBeLessThan(0.01);
    }
  });
});
