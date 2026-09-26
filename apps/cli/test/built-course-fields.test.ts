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
      /** ★2026-09-27（段 2 D）: ★モジュール定数 `COURSE_SPEC` が無くなったので ★型の名前で */
      'readonly spec: RaceCourseSpec;',
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
  /**
   * ⚠️ ★2026-09-27（段 2 D）: ★モジュール定数が無くなり、★`build()` は ★**引数の `setup` から**受け取ります。
   *    ★見る中身は同じ — ★「★エンジンへ渡す走路」と「★`Built` に詰める走路」が ★**同じ 1 つの値**であること。
   */
  it('🔴 ★build() は setup の走路を受け取り、そのまま詰める', () => {
    const src = strip(read(RACE_PAGE));
    const build = src.match(/function build\(setup: PageSetup,[\s\S]*?\n\}/);
    expect(build, '🔴 ★`build(setup: PageSetup, …)` が見つからない').not.toBeNull();
    const body = build![0];
    /** ★① ★走路と頭数は ★`setup` から（★別の出どころを持たない） */
    for (const line of [
      'const DIST = setup.distanceM;',
      'const COURSE_SPEC = setup.spec;',
      'const RACE_TURN = setup.turn;',
      'const FIELD = setup.fieldSize;',
    ]) expect(body, `🔴 ★\`build()\` に ${line} がありません`).toContain(line);
    /** ★② ★エンジンへ渡す走路（★着順に効く）と ★`Built` に詰める走路が ★同じ名前 */
    expect(body, '🔴 ★エンジンへ `COURSE_SPEC` を渡していません').toContain('course: COURSE_SPEC,');
    expect(body, '🔴 ★`Built` に そのまま詰めていません').toContain('distanceM: DIST, spec: COURSE_SPEC, turn: RACE_TURN,');
    /** ★③ ★モジュールの走路の定数は ★もう在らない（★2 つ目の出どころを作らない） */
    for (const name of ['DIST', 'COURSE_SPEC', 'RACE_TURN', 'COURSE_OPTS', 'FIELD', 'VENUE_LOOK', 'GRADE_LOOK', 'RACE_META']) {
      expect(new RegExp(`^const ${name}\\b`, 'm').test(src), `🔴 ★モジュールに \`const ${name}\` が戻っています`).toBe(false);
    }
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

  /**
   * 🔴 ★**段 C: ★画面の中で走路のモジュール定数を読む所は ★この 4 か所だけ**（★2026-09-27）
   *
   * ⚠️ ★上の段 B の網は ★**行の位置**で内外を分けていて、★`render` の外の JSX（★判定より後ろの行）を
   *    ★「内側」に数えていました。★ここは ★**`RacePage` の本体**を構文で切り出して数えます。
   *
   * 【★段 C で直したもの】
   *   ★出馬札の距離（★JSX）… ★`DIST` → ★`built.distanceM`（★組む前は札ごと出さない）
   *   🔴 ★**段 B の置き換え漏れ 1 件**（★`render` の内側）… ★`climaxHudFade(DIST - visualLead)`。
   *     ★行頭が ★`*`（★掛け算の続き）で、★手の grep が ★**註記の行と誤認して外していました**。
   *     ★この網は ★初回 ★「5 か所（既知 4）」で落ちて ★これを捕まえました。
   *
   * 【🔴 ★残した 4 か所 — ★`built` がまだ無い時点で ★1 回だけ決まる所】
   *   ★引継ぎ書は ★「残り 4 行（DIST 1・RACE_TURN 3）」でしたが、★測ると ★`DIST` がもう 1 つ
   *   ★（★素材読み込みの中の決勝線の位置）在りました。★どれも ★**依存 `[]` の読み込みか state の初期値**で、
   *   ★`built`（★読み込みの後に組む）からは ★**原理的に取れません**。
   *   → ★段 D で ★「走路が決まってから読み込む」形にするまで ★**ここで釘付け**します。
   *
   * 【✅ ★2026-09-27（段 2 D の 1）: ★4 か所とも ★`setup` から読む形になりました】
   *   ★画面の本体を ★`RaceView({ setup })` にし、★`setup` が決まってから開きます（★見本の道は同期で決まる）。
   *   ★本体の先頭で ★`const DIST = setup.distanceM;` 等と受け直すので、★4 か所の式は ★1 文字も変わっていません。
   *   → ★網の見るものを ★「既知の 4 か所」から ★**「本体がモジュールの設定を直に読まない」**へ替えました（★消していません）。
   */
  it('🔴 ★段 C/D: 画面の本体は 走路・頭数・場を setup から受け、モジュールの設定を直に読まない', () => {
    const src = strip(read(RACE_PAGE));
    const view = src.match(/function RaceView\(\{ setup \}: \{ readonly setup: PageSetup \}\)[\s\S]*?\n\}\n/);
    expect(view, '🔴 ★`RaceView` の本体が切り出せない（★走査が壊れている）').not.toBeNull();
    const body = view![0];
    expect(body.length, '★`RaceView` が短すぎる（★切り出しが途中で止まっている）').toBeGreaterThan(50000);

    /** ★① ★本体の先頭で ★`setup` から受け直している（★4 か所の式はこの名前を読む） */
    for (const line of [
      'const DIST = setup.distanceM;',
      'const RACE_TURN = setup.turn;',
      'const FIELD = setup.fieldSize;',
      'const RACE_META = setup.meta;',
      'const VENUE_LOOK = venueLookOf(setup.venue.id);',
    ]) expect(body, `🔴 ★\`RaceView\` に ${line} がありません`).toContain(line);

    /** ★② 🔴 ★本体は ★モジュールの設定（★見本の鞍・見本の頭数・見本の名簿）を ★直に読まない */
    const leaks = (body.match(/\b(RACE_SETUP|SAMPLE_FIELD|HORSE_NAMES|JOCKEY_NAMES|DEMO_WIN_ODDS|COAT_BY_GATE)\b/g) ?? []);
    expect(leaks, `🔴 ★\`RaceView\` が モジュールの見本の設定を直に読んでいます: ${leaks.join(', ')}\n`
      + '  ★実レースでは ★見本の値が混ざります。★`setup` から読むこと').toEqual([]);
    /** ★③ ★毛色は ★出走表から（★枠番の表から引かない） */
    expect(/(?<![A-Za-z0-9_])coatOf\(/.test(body), '🔴 ★`RaceView` が ★枠番の毛色表（`coatOf`）を直に読んでいます').toBe(false);

    /** ★④ ★出馬札の距離は ★`built` から（★段 C の本体） */
    expect(body).toContain("{built !== null && <span className=\"a-chip\">{surface === 'turf' ? '芝' : 'ダート'} {built.distanceM}m");
  });

  /**
   * 🔴 ★**対照**: ★上の ②③ が ★本当に噛むこと（★「0 件だった」を合格と読ませない）。
   *   ★本体に 1 行 混ぜた文字列で ★同じ判定が落ちることを確かめます。
   */
  it('🔴 ★対照: 見本の設定を 1 つ混ぜると 上の判定が落ちる', () => {
    const detect = (body: string): string[] => body.match(/\b(RACE_SETUP|SAMPLE_FIELD|HORSE_NAMES|JOCKEY_NAMES|DEMO_WIN_ODDS|COAT_BY_GATE)\b/g) ?? [];
    for (const probe of ['RACE_SETUP.race.month', 'SAMPLE_FIELD', 'HORSE_NAMES[0]', 'JOCKEY_NAMES[0]', 'DEMO_WIN_ODDS[0]', 'COAT_BY_GATE[0]']) {
      expect(detect(`const x = ${probe};`).length, `★対照 ${probe} を捕まえない`).toBe(1);
    }
    expect(/(?<![A-Za-z0-9_])coatOf\(/.test('const c = coatOf(1);')).toBe(true);
    expect(/(?<![A-Za-z0-9_])coatOf\(/.test('const c = coatOfGate(1);'), '★`coatOfGate` を誤って捕まえる').toBe(false);
  });
});
