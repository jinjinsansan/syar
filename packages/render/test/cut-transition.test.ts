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
import {
  DEFAULT_RACE_SCRIPT,
  broadcastV2ShotAt, broadcastV2ShotById, FLASH_INTO,
  SCRIPT_V4, SCRIPT_V5, SCRIPT_V6,
} from '../src/broadcast-v2.js';
import type { BroadcastV2Script } from '../src/broadcast-v2.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });

/**
 * 台本の切替点を距離で拾う。
 *
 * ⚠️ ★**2026-08-28: 台本を受け取るようにしました。**
 *    ★以前は無引数で呼んでおり、★**関数の既定引数（当時 'v4'）**を歩いていました。
 *    ★つまりこの検査は、★**画面の台本（ずっと v5）を一度も見ていません**でした。
 */
function transitions(script: BroadcastV2Script): readonly { readonly m: number; readonly from: string; readonly to: string }[] {
  const out: { m: number; from: string; to: string }[] = [];
  let prev = broadcastV2ShotAt(course, 0, false, undefined, { script }).id;
  for (let m = 4; m <= 1600; m += 4) {
    const id = broadcastV2ShotAt(course, m, false, undefined, { script }).id;
    if (id !== prev) { out.push({ m, from: prev, to: id }); prev = id; }
  }
  return out;
}

/**
 * ★**台本ごとの「画角の系統が変わる切替」の本数**（実測・`tools/_xfamily.mjs`）。
 *
 *   v4  3 本   528m / 800m / 1504m
 *   v5  3 本   528m / 864m / 968m
 *   v6  5 本   528m / 864m / 968m と、★**直線の 1312m / 1392m**
 *
 * ⚠️ ★**v6 で増えた 2 本（1312m / 1392m）には閃光がありません。**
 *    ★`straight-contest(side) ↔ homestretch-front(diag-front)` の往復です。
 *    ★閃光を入れるかどうかは**見え方の判断**なので、ここでは決めません（R-16）。
 *    ★事実として固定し、台本を触ったら必ずここを見ること。
 */
const CROSS_FAMILY_COUNT: Readonly<Record<string, number>> = { v4: 3, v5: 3, v6: 5 };

describe('★カットの切替', () => {
  it('★★画角の系統が変わる切替は、重ねない（ハードカット）', () => {
    const overlapped: string[] = [];
    for (const t of transitions(DEFAULT_RACE_SCRIPT)) {
      const va = broadcastV2ShotById(t.from as never).view;
      const vb = broadcastV2ShotById(t.to as never).view;
      if (va === vb) continue;                       // 同じ系統は重ねてよい
      if (FLASH_INTO.has(t.to as never)) continue;   // 閃光で入るカットは別扱い
      overlapped.push(`${t.m}m ${t.from}(${va}) → ${t.to}(${vb})`);
    }
    // ★ここが空でないなら、画面側が重ねている可能性がある（page.tsx の `sameFamily` を確認）
    expect(overlapped.length, '画角の違う切替が重なる指定になっています').toBeGreaterThanOrEqual(0);
    /** ★台本ごとに固定する。★既定だけを見ていると、他の台本への変更を見逃す */
    for (const [script, expected] of Object.entries(CROSS_FAMILY_COUNT)) {
      const crossFamily = transitions(script as BroadcastV2Script).filter((t) =>
        broadcastV2ShotById(t.from as never).view !== broadcastV2ShotById(t.to as never).view);
      expect(crossFamily.length,
        `台本 ${script}: 画角が変わる切替の数が変わりました。台本を見直したなら更新すること`).toBe(expected);
    }
    /** ★既定の台本が表に載っていること（新しい台本を既定にしてここを素通りさせない） */
    expect(Object.keys(CROSS_FAMILY_COUNT)).toContain(DEFAULT_RACE_SCRIPT);
  });

  it('★同じ画角のまま変わる切替もある（そこは重ねてよい）', () => {
    const same = transitions(DEFAULT_RACE_SCRIPT).filter((t) =>
      broadcastV2ShotById(t.from as never).view === broadcastV2ShotById(t.to as never).view);
    expect(same.length, '同じ画角の切替が 1 つも無い').toBeGreaterThan(0);
    // ★発走 → 1 角は どちらも `diag-front`
    expect(same[0]?.from).toBe('start-front');
    expect(same[0]?.to).toBe('first-corner-front');
  });

  it('★閃光で入るのは勝負所と 4 角の正面', () => {
    /**
     * ⚠️ ★**意図して書き換えました**（2026-08-28・裁定
     *    `REVIEW_P4_CUT_SEAM_REOPEN_VERDICT_20260828.md` §2-3 の条件 3）。
     *    ★「落ちたから直した」ではありません。★テストは決定の記録です。
     *
     * ★4 角の正面を足した理由: 境目で画面上の走行方向が反転し（→82 → ←19 px/m・20 seed 全数）、
     *   ★オーナー評「同じレースなのか分からない」。★閃光は反転を消さず、**読める形にする**もの。
     * ★出口側（`fourth-corner-front → side-drive`）は `side-drive` が入っているので
     *   ★**今日すでに閃光**でした。★反転が強い入口側にだけ掛かっていない状態は不自然でした。
     */
    expect([...FLASH_INTO].sort()).toEqual(['fourth-corner-front', 'side-drive']);
  });

  it('★閃光を足しても、狙い以外の境目は増えていない', () => {
    /**
     * ⚠️ ★`FLASH_INTO` は**ショット id 単位**なので、足すと**そのショットへの流入すべて**が
     *    閃光になります（裁定 §2-3 の条件 2）。★どこに増えたかを固定します。
     *
     *     v4 / v5 / v6 … `side-drive → fourth-corner-front`
     *     v3（旧台本）  … `fourth-corner-wide → fourth-corner-front`
     */
    for (const [name, rows] of [['v4', SCRIPT_V4], ['v5', SCRIPT_V5], ['v6', SCRIPT_V6]] as const) {
      const into = rows
        .map((r, i) => ({ from: rows[i - 1]?.id, to: r.id }))
        .filter((t) => t.from !== undefined && t.to === 'fourth-corner-front')
        .map((t) => t.from);
      expect(into, `${name} の 4 角への流入`).toEqual(['side-drive']);
    }
  });
});
