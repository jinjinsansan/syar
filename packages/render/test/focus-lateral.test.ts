/**
 * ★カメラの注視点（横位置）が、順位の入れ替わりで跳ばないことを留める
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   注視点の横位置は「**上位 5 頭の単純平均**」でした。順位が入れ替わると
 *   **集合ごと入れ替わる**ので、平均が 1 コマで跳びます。実測（`front-close` 23.13 秒）:
 *     注視点の横位置 **3.36m → 5.87m（1 コマで 2.51m）** → ★**画面が 237px 飛ぶ**
 *   ★オーナー評「順位を抜く時、様々な場面で滑らかさがなく、**馬が飛ぶ**印象があります」。
 *
 * → 重みを「入る／入らない」ではなく**連続**にする。順位が入れ替わっても重みが少しずつ移るだけ。
 *
 * ⚠️ ★これは**カメラの向け先**の話で、馬の位置ではありません。着順にも位置にも触れません。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

/** ★2 頭が入れ替わる場面を作る。横位置は大きく違う（入れ替われば平均が動く） */
function focusWAt(swap: number) {
  const horses = [
    { gate: 1, s: 1300 + swap, w: 2.0, staminaRatio: 1 },
    { gate: 2, s: 1300 - swap, w: 14.0, staminaRatio: 1 },
    { gate: 3, s: 1290, w: 3.0, staminaRatio: 1 },
    { gate: 4, s: 1288, w: 4.0, staminaRatio: 1 },
    { gate: 5, s: 1286, w: 5.0, staminaRatio: 1 },
    { gate: 6, s: 1284, w: 13.0, staminaRatio: 1 },
  ];
  return resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
    { forceShotId: 'front-close' }).focusW;
}

describe('★注視点の横位置', () => {
  it('★★順位が入れ替わっても連続に動く（跳ばない）', () => {
    let prev = focusWAt(-0.6);
    let worst = 0;
    for (let d = -0.6; d <= 0.6; d += 0.02) {
      const cur = focusWAt(d);
      worst = Math.max(worst, Math.abs(cur - prev));
      prev = cur;
    }
    // ★1 手あたり 0.1m 未満。元の形では 2.51m 跳んだ
    expect(worst, `注視点が 1 手で ${worst.toFixed(2)}m 跳んでいます`).toBeLessThan(0.1);
  });

  it('★★6 頭目が上位 5 頭に入っても跳ばない（集合の出入りが原因だった）', () => {
    /**
     * ★元の実装は「上位 5 頭」の**単純平均**なので、6 頭目が 5 位に上がった瞬間に
     *   5 位だった馬が集合から外れ、平均が不連続に動きました。
     */
    const at = (s6: number) => {
      const horses = [
        { gate: 1, s: 1300, w: 2.0, staminaRatio: 1 },
        { gate: 2, s: 1298, w: 3.0, staminaRatio: 1 },
        { gate: 3, s: 1296, w: 4.0, staminaRatio: 1 },
        { gate: 4, s: 1294, w: 5.0, staminaRatio: 1 },
        { gate: 5, s: 1292, w: 6.0, staminaRatio: 1 },
        { gate: 6, s: s6, w: 18.0, staminaRatio: 1 },   // ★横位置が大きく違う馬
      ];
      return resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, false,
        { forceShotId: 'front-close' }).focusW;
    };
    let prev = at(1288), worst = 0;
    for (let s = 1288; s <= 1296; s += 0.2) {
      const cur = at(s);
      worst = Math.max(worst, Math.abs(cur - prev));
      prev = cur;
    }
    expect(worst, `6 頭目の浮上で ${worst.toFixed(2)}m 跳んでいます`).toBeLessThan(0.1);
  });

  it('★先頭を狙うカットは、先頭の横位置をそのまま向く', () => {
    const horses = [
      { gate: 1, s: 1500, w: 2.5, staminaRatio: 1 },
      { gate: 2, s: 1480, w: 18.0, staminaRatio: 1 },
    ];
    const sc = resolveBroadcastV2Scene(course, horses, { width: 1280, height: 720 }, true,
      { forceShotId: 'winner-follow' });
    expect(sc.focusW).toBeCloseTo(2.5, 6);
  });
});
