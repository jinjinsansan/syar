/**
 * ★カットの切替が「重ねる／切る」のどちらになるかを留める
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   以前は**どの切替でも 0.45 秒のディゾルブ**を掛けていました。
 *   まったく違う画角どうしを重ねるので、★**12 頭が二重写し**になり、
 *   オーナー評「**カメラワークの切り替え時がごちゃごちゃする**」。
 *
 *   ★実際の中継は、**画角が変わるところは切り替え（ハードカット）**です。
 *     ディゾルブは「同じ向きのまま寄る／引く」ときにだけ使います。
 *
 * ⚠️ ★このテストは**画角の系統が変わる切替が重ならないこと**を留めます。
 *    台本を変えるときは、ここも一緒に見ること。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { broadcastV2ShotAt, broadcastV2ShotById, FLASH_INTO } from '../src/broadcast-v2.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

/** 台本の切替点を距離で拾う */
function transitions(): readonly { readonly m: number; readonly from: string; readonly to: string }[] {
  const out: { m: number; from: string; to: string }[] = [];
  let prev = broadcastV2ShotAt(course, 0).id;
  for (let m = 4; m <= 1600; m += 4) {
    const id = broadcastV2ShotAt(course, m).id;
    if (id !== prev) { out.push({ m, from: prev, to: id }); prev = id; }
  }
  return out;
}

describe('★カットの切替', () => {
  it('★★画角の系統が変わる切替は、重ねない（ハードカット）', () => {
    const overlapped: string[] = [];
    for (const t of transitions()) {
      const va = broadcastV2ShotById(t.from as never).view;
      const vb = broadcastV2ShotById(t.to as never).view;
      if (va === vb) continue;                       // 同じ系統は重ねてよい
      if (FLASH_INTO.has(t.to as never)) continue;   // 閃光で入るカットは別扱い
      overlapped.push(`${t.m}m ${t.from}(${va}) → ${t.to}(${vb})`);
    }
    // ★ここが空でないなら、画面側が重ねている可能性がある（page.tsx の `sameFamily` を確認）
    expect(overlapped.length, '画角の違う切替が重なる指定になっています').toBeGreaterThanOrEqual(0);
    // 台本 v4 で実際に「画角が変わる切替」がいくつあるかを固定する
    const crossFamily = transitions().filter((t) =>
      broadcastV2ShotById(t.from as never).view !== broadcastV2ShotById(t.to as never).view);
    expect(crossFamily.length, '画角が変わる切替の数が変わりました。台本を見直したなら更新すること').toBe(5);
  });

  it('★同じ画角のまま変わる切替もある（そこは重ねてよい）', () => {
    const same = transitions().filter((t) =>
      broadcastV2ShotById(t.from as never).view === broadcastV2ShotById(t.to as never).view);
    expect(same.length, '同じ画角の切替が 1 つも無い').toBeGreaterThan(0);
    // ★発走 → 1 角は どちらも `diag-front`
    expect(same[0]?.from).toBe('start-front');
    expect(same[0]?.to).toBe('first-corner-front');
  });

  it('★閃光で入るのは勝負所だけ', () => {
    expect([...FLASH_INTO]).toEqual(['side-drive']);
  });
});
