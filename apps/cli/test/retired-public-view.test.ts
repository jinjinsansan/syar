/**
 * 🔴 ★**引退馬の公開の一覧が、出してよい列だけを出す**
 *   ★裁定 `REVIEW_RETIRED_SCREEN_PORTS_20260925.md` §4・移行 `0083_retired_horses_public.sql`
 *
 * 【★なぜ要るか】
 *   ★正典 **LR-6** は「★他人の馬の物語も見える。★ただし持ち主の個人情報は出さない
 *   ★（★**表示名・牧場名まで**）」と決めています。
 *   ★`horse_story_event_public`（`0043`）は在ったのに、★**一覧の口が無く**、
 *   ★`/stable/retired` は ★見本のデータで埋まっていました（★D-119 の族）。
 *
 * 【★この網が見るもの】
 *   ★① ★**`display_name` を 1 文字も出していない**（★LR-6）
 *   ★② ★素質・能力・発見度を出していない（★**D-114**）
 *   ★③ ★戦績の式が ★`my_retired_horses()`（`0075`）と ★**同じ**（★D-052）
 *   ★④ ★`anon` に開いている（★裁定 §4 条件 ②）
 *   ★⑤ ★並びが ★**決定論**（★同じ週の馬の順が呼ぶたびに変わらない・条件 ①）
 *   ★⑥ ★件数の上限を持つ（★条件 ①）
 *   ★⑦ ★画面の「準備しています」が ★**外れている**（★条件 ④）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lastFunctionBody, lastViewBody, stripSqlComments } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(ROOT, 'db/migrations/0083_retired_horses_public.sql');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

/** ★view の本体（★註記を落としたもの） */
function viewBody(): string {
  const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
  const m = sql.match(/create or replace view retired_horses_public as([\s\S]*?);/i);
  if (m === null) throw new Error('★view の定義が読めません（★切り出しが壊れている）');
  return m[1]!;
}

describe('🔴 ★引退馬の公開の一覧（★LR-6）', () => {
  it('★切り出せている（★空振りしていない）', () => {
    expect(viewBody().length, '★view の本体が短すぎる').toBeGreaterThan(200);
  });

  /**
   * 🔴 ★**いちばん大事な 1 本**。★持ち主が誰かを出さないこと。
   * ⚠️ ★`stable_name` は出してよい（★LR-6 の上限）。★`display_name` は駄目です。
   */
  it('🔴 ★持ち主の表示名を出していない（★LR-6）', () => {
    const body = viewBody();
    for (const bad of ['display_name', 'email', 'user_id', 'owner_id as']) {
      expect(body, `🔴 ★持ち主の個人情報が出ています: ${bad}`).not.toContain(bad);
    }
    expect(body, '★牧場名は出すこと（★LR-6 の上限）').toContain('stable_name');
  });

  it('🔴 ★素質・能力・発見度を出していない（★D-114）', () => {
    const body = viewBody();
    for (const bad of ['potential', 'ability', 'speed', 'stamina', 'guts', 'wisdom', 'discovery', 'gene']) {
      expect(body, `🔴 ★見せない値が出ています: ${bad}`).not.toContain(bad);
    }
  });

  /**
   * 🔴 ★**戦績の数え方を 2 通りにしない**（★D-052）。
   *   ★自分の馬（`my_retired_horses()`）と他人の馬（この view）で ★違う戦績が出ると、
   *   ★同じ馬が ★2 つの画面で違う成績に見えます。
   */
  /**
   * 🔴 ★**戦績は関数 1 つを呼ぶ**（★`0086`・D-052）。
   *
   * ⚠️ ★ここは最初 ★**字面を突き合わせる**網でした。
   *    ★レビュー側の判断: ★**「突き合わせの網より 1 つにするほうが強い」**。
   *    ★「関数の外で数えていないか」は ★`horse-record-one-place.test.ts` が見ます。
   */
  it('🔴 ★戦績は horse_starts / horse_wins を呼んでいる（★0086）', () => {
    const { file, body } = lastViewBody('retired_horses_public');
    expect(file, '★最後の定義が 0086 ではない（★寄せ替えが漏れた）').toBe('0086_horse_record_one_place.sql');
    expect(body, '★勝数は horse_wins を呼ぶこと').toMatch(/horse_wins\(h\.id\)/);
    expect(body, '★出走数は horse_starts を呼ぶこと').toMatch(/horse_starts\(h\.id\)/);
    expect(body, '🔴 ★自分で数えています（★関数に寄せること）')
      .not.toMatch(/count\(\*\)[\s\S]{0,80}race_entries/i);
    const { body: mine } = lastFunctionBody('my_retired_horses');
    expect(mine, '★my_retired_horses も関数を呼ぶこと').toMatch(/horse_wins\(h\.id\)/);
  });

  it('★anon に開いている（★裁定 §4 条件 ②）', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
    expect(sql, '★anon への grant がありません').toMatch(/grant select on retired_horses_public to anon, authenticated/i);
  });

  /**
   * 🔴 ★**並びが決定論**（★裁定 §4 条件 ①）。
   *   ⚠️ ★`order` が 1 つだけだと、★同じ週の馬の並びが ★**呼ぶたびに変わりえます**。
   */
  it('🔴 ★並びが決定論で、件数の上限が在る（★条件 ①）', () => {
    const lib = read('apps/web/src/lib/retired-screen.ts');
    expect(lib, '★引退した週で並べること').toMatch(/\.order\('retired_at_week'/);
    expect(lib, '🔴 ★同じ週の馬の順が決まりません（★`horse_id` でも並べること）')
      .toMatch(/\.order\('horse_id'/);
    expect(lib, '★件数の上限が在ること').toMatch(/PUBLIC_RETIRED_LIMIT/);
    expect(lib, '★上限を渡していること').toMatch(/\.limit\(limit\)/);
  });

  /**
   * 🔴 ★**条件 ④: ★口が出来たら「準備しています」を同じ便で外す**。
   *   ⚠️ ★外し忘れると、★出来ているのに ★「まだです」と言い続けます（★逆向きの嘘）。
   */
  it('🔴 ★画面の「準備しています」が外れている（★条件 ④）', () => {
    const page = read('apps/web/src/app/stable/retired/page.tsx');
    expect(page, '🔴 ★口は出来たのに「準備しています」が残っています')
      .not.toContain('他の牧場の引退馬を並べる準備をしています');
    expect(page, '🔴 ★「いまは自分の馬だけ出ます」が残っています')
      .not.toContain('いまは自分の馬だけ出ます');
    expect(page, '★公開の一覧を読むこと').toMatch(/loadPublicRetired\(\)/);
    expect(page, '★他人の馬に牧場名を出すこと').toMatch(/h\.stableName/);
  });

  /**
   * ⚠️ ★**自分の馬の失敗が、公開の一覧を道連れにしないこと**
   *   ✔ ★2026-09-25 に `/entry` で同じ形の事故を起こしています
   *     （★`my_horses` の失敗で ★公開のレース一覧まで消え、★「今週は出走できるレースがありません」と嘘を出した）。
   */
  it('🔴 ★自分の馬の失敗で、公開の一覧を道連れにしない', () => {
    const page = read('apps/web/src/app/stable/retired/page.tsx');
    // ★`loadRetiredScreen()` の失敗を ★その場で受け止めて `[]` に落としていること
    expect(page, '🔴 ★自分の馬の口の失敗を受け止めていません')
      .toMatch(/loadRetiredScreen\(\)[\s\S]{0,400}\.catch\(/);
    expect(page, '★公開の一覧と一緒に待つこと').toMatch(/Promise\.all\(\[minePromise, loadPublicRetired\(\)\]\)/);
  });
});
