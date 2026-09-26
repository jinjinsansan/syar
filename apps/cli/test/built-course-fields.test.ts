/**
 * 🔴 ★**`Built` の走路は、見本の道では モジュール定数と同じもの**（★段 2 の A・2026-09-26）
 *   ★裁定 `REVIEW_RACE_WIRING_20260926.md`・計画 `PLAN_RACE_REAL_WIRING_20260926.md`
 *
 * 【★この段（A）が約束していること】
 *   ★`Built` に ★`distanceM` / `spec` / `turn` を足しましたが、★**振る舞いは変えていません**。
 *   ★`build()` は ★モジュール定数（★`DIST` / `COURSE_SPEC` / `RACE_TURN`）を ★**そのまま詰めるだけ**です。
 *
 * 【🔴 ★なぜ固定するか — ★離れたら着順に効きます】
 *   ★`spec` は ★`RaceConditions.course` → ★`laneExtraM` → ★**着順**（★憲法 3・D-071）。
 *   ⚠️ ★走路の形を 2 か所で持って ★実際に離れた前科があります（★幅 20m / 25m・台帳 B-6）。
 *   → ★B 以降で ★描画側を ★`built.*` に置き換えていくので、★**A の時点で「同じもの」**を釘付けします。
 *     ★これが無いと ★B の途中で ★**片方だけ別の値**になっても気づけません。
 *
 * ⚠️ ★`build()` は ★export されていないので ★**原文で見ます**（★この画面の既存の検査と同じ作法）。
 *    ★引用は ★**その行が「そのまま詰める」ことを数えている**ものを選びます（★AU-7・2 段の条件）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const RACE_PAGE = 'apps/web/src/app/race/page.tsx';
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
/** ★註記を空白にする（★行の位置を保つ・★註記の中の語で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

describe('🔴 ★Built の走路（段 A: モジュール定数と同じもの）', () => {
  it('★走査が空振りしていない', () => {
    const src = strip(read(RACE_PAGE));
    expect(src.length, '★`/race` が読めていない').toBeGreaterThan(10000);
    expect(src).toContain('interface Built');
  });

  /** 🔴 ★`Built` が 3 欄を持っていること（★B 以降の置き換え先） */
  it('🔴 ★Built が distanceM / spec / turn を持っている', () => {
    const src = strip(read(RACE_PAGE));
    const m = src.match(/interface Built \{[\s\S]*?\n\}/);
    expect(m, '🔴 ★`interface Built` が見つからない（★走査が壊れている）').not.toBeNull();
    const body = m![0];
    for (const field of [
      'readonly distanceM: number;',
      'readonly spec: typeof COURSE_SPEC;',
      "readonly turn: 'left' | 'right';",
    ]) {
      expect(body, `🔴 ★\`Built\` に ${field} がありません`).toContain(field);
    }
  });

  /**
   * 🔴 ★**本命**: ★`build()` が ★**モジュール定数をそのまま詰めている**こと。
   *   ⚠️ ★ここが別の値になると ★`built.spec` と 画面の `COURSE_SPEC` が離れ、
   *      ★**着順に効く値が 2 通り**になります（★台帳 B-6）。
   */
  it('🔴 ★build() は DIST / COURSE_SPEC / RACE_TURN をそのまま詰める', () => {
    const src = strip(read(RACE_PAGE));
    const quote = 'distanceM: DIST, spec: COURSE_SPEC, turn: RACE_TURN,';
    /** ★① ★引用が 1 か所（★消しても通る形にしない） */
    const hits = src.split(quote).length - 1;
    expect(hits, `🔴 ★\`${quote}\` が ${hits} か所（★1 か所であること）`).toBe(1);
    /** ★② ★その行が `build()` の中に在ること（★別の関数に在っても意味がない） */
    const build = src.match(/function build\([\s\S]*?\n\}/);
    expect(build, '🔴 ★`build()` が見つからない').not.toBeNull();
    expect(build![0], '🔴 ★`build()` の外で詰めています').toContain(quote);
  });

  /**
   * 🔴 ★**A の約束**: ★この段では ★`built.distanceM` 等を ★**まだ読んでいない**こと。
   *   ⚠️ ★読み始めたら ★それは ★B です。★B に入ったら ★この検査を ★**書き換える**こと
   *      （★消すのではなく、★「B の範囲だけ置き換わっている」に変える）。
   *   ★これが無いと ★A と B が混ざり、★**どこまで置き換えたか分からなくなります**。
   */
  it('★A の段では built.distanceM / built.spec / built.turn を読んでいない', () => {
    const src = strip(read(RACE_PAGE));
    const reads = ['built.distanceM', 'built.spec', 'built.turn']
      .filter((r) => src.includes(r));
    expect(reads, '⚠️ ★`built.*` を読み始めています ＝ ★段 B に入っています。\n'
      + '  ★この検査を ★**書き換えてください**（★消さずに「B の範囲だけ置き換わっている」へ）。\n'
      + '  ★A と B を混ぜると ★どこまで置き換えたか分からなくなります').toEqual([]);
  });
});
