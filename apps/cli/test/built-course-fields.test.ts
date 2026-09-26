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
   * 🔴 ★**段 B: ★null 判定の内側だけが `built.*` に置き換わっている**（★2026-09-27）
   *
   * ⚠️ ★A の段では ★「★`built.*` をまだ読んでいない」を見ていました。★指示どおり ★**消さずに書き換え**ました。
   *
   * 【★測ってから置き換えました（★引き算していません）】
   *   ★`render` の ★`if (… || built === null) return;` より ★**後ろ**にあるものだけを置換:
   *     ★`DIST` … ★38 件 ／ ★`COURSE_SPEC` … ★4 件 ＝ ★**42 件**
   *   ★残した（★段 C）: ★`DIST` 1 件（★JSX・`built` が null でも描く所）・★`RACE_TURN` 3 件（★判定より前）
   *   ✔ ★別名の `built`（★`const built = new Map<…>` が :3005 / :3219）とは ★**衝突 0 件**（★測って確認）。
   * ✔ ★**型検査が 1 件 捕まえました** — ★`built` が null でも描く JSX で、★そこは戻しました（★守りとして働いた）。
   */
  it('🔴 ★段 B: null 判定の内側は built.* を読み、外側は読んでいない', () => {
    const src = strip(read(RACE_PAGE));
    const lines = src.split('\n');
    const guard = lines.findIndex((l) => /built === null\) return;/.test(l));
    expect(guard, '🔴 ★`render` の null 判定が見つからない（★走査が壊れている）').toBeGreaterThan(0);

    /** ★① ★内側は ★`built.*` を読んでいる（★置き換えが進んだこと） */
    const after = lines.slice(guard + 1).join('\n');
    const reads = (after.match(/built\.(distanceM|spec)\b/g) ?? []).length;
    expect(reads, '🔴 ★null 判定の内側で ★`built.*` を読んでいません（★B が巻き戻っています）')
      .toBeGreaterThan(30);

    /**
     * ★② 🔴 ★**外側では読んでいない**（★これが本命 — ★null を踏む道を作らない）。
     *   ⚠️ ★型検査も捕まえますが、★網でも見ます（★`?.` や `!` で黙らせる道があるため）。
     */
    const before = lines.slice(0, guard + 1).join('\n');
    const outside = (before.match(/built\.(distanceM|spec|turn)\b/g) ?? []).length;
    expect(outside, '🔴 ★null 判定の ★**外側**で `built.*` を読んでいます（★null を踏みます）。\n'
      + '  ★`?.` や `!` で黙らせないこと。★外側は ★段 C（★引数で渡す）で直します').toBe(0);

    /** ★③ ★`build()` は ★モジュール定数を詰めるまま（★A の約束を保つ） */
    expect(src, '🔴 ★`build()` が ★そのまま詰めるのをやめています')
      .toContain('distanceM: DIST, spec: COURSE_SPEC, turn: RACE_TURN,');
  });
});
