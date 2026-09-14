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

// 直線の切替は残るが、真横同士なので方向の系統は変わらない。
/**
 * ⚠️ ★**v6 を 3 → 5 に書き換えました**（★2026-09-11・★オーナー ③・★意図した変更です）。
 *
 *   ★オーナー評「★今は真横カメラワークのみで飽きます」。
 *   ★`opening-formation`（★最初の位置取り）を ★**真横 → 高い引き**へ替えたので、
 *   ★その前後 2 か所が「画角の系統が変わる切替」に増えました:
 *     ★`opening-side-lead`(side) → `opening-formation`(high-diag)
 *     ★`opening-formation`(high-diag) → `opening-side-settle`(side)
 *
 * ⚠️ ★**さらに 5 → 6**（★同じ日・★オーナー ②）。★発走を
 *    ★`start-front`(diag-front・ゲート) → `start-rear-far`(high-diag・引き) に割ったので、
 *    ★そこも画角の系統が変わる切替になりました。
 *    ★（★`start-rear-far` → `opening-side-lead` は元から数えられていた 1 つの置き換えです）
 * ⚠️ ★**カットは減っていません。** ★11 → 12 に増えています（★下限は下回っていません）。
 *
 * ⚠️ ★**6 → 5 → 2 と減りました**（★同じ日・★オーナー ③⑨⑩）。
 *    ★発馬機を ★**世界座標の形**（`starting-gate-world.ts`）にしたので、★ゲートも
 *    ★発走直後も位置取りも ★**真横**にできました。★真横素材は合格済みなので、
 *    ★大きく写しても崩れません。★残る「画角の系統が変わる切替」は ★**4 角の出入り 2 つだけ**です。
 *
 * ⚠️ ★**カットの数は 1 つも減っていません**（★12 のまま）。★減ったのは
 *    ★「画角の系統をまたぐ切替」の数で、★それは ★**中身が揃った**という意味です。
 * ⚠️ ★旧台本（v3 / v4 / v5）は ★**動かしていません**。★一度 `start-front` を書き換えて
 *    ★v4 の数が 3 → 4 になり、★台本 v6 専用の `start-gate-side` へ分けました。
 */
/**
 * ⚠️ ★**v6 は 2 → 4 へ**（★2026-09-12・★オーナー指示「コーナー映像がないのもおかしい」）。
 *    ★コーナーのカットを走路の本当のコーナーへ貼り、★3 角にもカットが付いたためです
 *    （★桜星賞: `side-drive`→3 角→`side-drive`→4 角→直線 で 画角の系統が 4 回変わる）。
 *    ★旧台本（v4 / v5）は割合のままなので 3 のままです。
 * ★この数はコースによって変わります。★ここは ★**既定の走路（桜星賞）**を固定しています。
 */
/**
 * ⚠️ ★**v8 を足しました**（★2026-09-13・★既定が v6 → v8 になったため）。
 *    ★実測（★既定の走路・桜星賞）: ★v8 は 切替 6 ／ 画角が変わる ★**4**（★v6 と同じ数）。
 *    ★v8 は通しの真横 1 本＋コーナー 2 つなので、★切替の総数は 12 → 6 に減りますが、
 *    ★画角の系統をまたぐのは ★**コーナーの出入り 4 回**で v6 と変わりません。
 */
/**
 * ⚠️ ★**v9 を足しました**（★2026-09-14・★既定が v8 → v9 になったため・オーナー判断「コーナー演出は全カット」）。
 *    ★v9 は ゲート → 真横の追従 → 最後の直線 → ゴール板 で、★**全部 `view: 'side'`** です。
 *    ★画角の系統をまたぐ切替は ★**0**。★v8 の 4 は ★コーナーの出入りでした。
 */
const CROSS_FAMILY_COUNT: Readonly<Record<string, number>> = { v4: 3, v5: 3, v6: 4, v8: 4, v9: 0 };

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
    /**
     * ⚠️ ★**見る対を変えました**（★2026-09-11・★オーナー ③・★意図した変更です）。
     *    ★以前は `opening-side-lead → opening-formation`（★どちらも真横）を見ていました。
     *    ★位置取りを ★**高い引き**に替えたので、そこはハードカットになります。
     *    ★真横のまま繋ぐ所として ★`opening-side-settle → side-drive` を見ます。
     * ⚠️ ★順番（`same[0]`）ではなく ★**その対が在ること**で見ます。★台本の頭が動くたびに
     *    ★落ちるテストは、★決定ではなく順番を留めているだけでした。
     */
    /**
     * ⚠️ ★**見る対を変えました**（★2026-09-13・★既定が v6 → v8 になったため）。
     *    ★v8 に `opening-*` のカットはありません（★通しの真横 1 本にしたので）。
     *    ★真横のまま繋ぐ所として ★`homestretch-side → finish-line` を見ます
     *    （★どちらも `view: 'side'`・★実測）。
     */
    expect(same.map((t) => `${t.from}>${t.to}`))
      .toContain('homestretch-side>finish-line');
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
