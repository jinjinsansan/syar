/**
 * ★**註記を落とす道具そのものを検査する**（★CK-1・2026-09-19）
 *
 * ⚠️ ★道具を作っただけでは ★**4 例目の再発は防げません**。
 *    ★**過去 4 例の形を、そのまま入力にして**検査します。
 */
import { describe, it, expect } from 'vitest';
import { stripSqlComments, lastFunctionBody, lastViewBody, allMigrationsBody } from './lib/sql-source.js';

describe('★過去 4 例の形', () => {
  it('③ ★行註記の中の語を拾わない（★`/60 minutes/` が自分の註記に一致した形）', () => {
    const sql = `-- ★締切は 60 minutes 前\nselect 1;`;
    expect(stripSqlComments(sql)).not.toContain('60 minutes');
    expect(stripSqlComments(sql)).toContain('select 1');
  });

  it('④ ★`comment on` の中の語を拾わない（★`達しています` が自分の註記に一致した形）', () => {
    const sql = `create function f() returns int language sql as $$ select 1 $$;\n`
      + `comment on function f() is '★旧は「達しています」と書いていた；直した';\n`
      + `select 2;`;
    const out = stripSqlComments(sql);
    expect(out, '★comment on の本文が残っている').not.toContain('達しています');
    expect(out, '★文字列の中の ; で切れて後続を落としている').toContain('select 2');
  });

  it('★文字列リテラルの中の語は**落とさない**（★本文の言葉は検査の対象）', () => {
    const sql = `raise exception '1レース1種の上限（30,000 EP）-- を超える';`;
    const out = stripSqlComments(sql);
    expect(out, '★文字列の中の -- 以降を落としてしまった').toContain('を超える');
    expect(out).toContain('30,000 EP');
  });

  it("★`''`（重ねた引用符）で文字列が終わったと誤らない", () => {
    const sql = `select 'a''b -- c', 1; -- ★これは註記`;
    const out = stripSqlComments(sql);
    expect(out).toContain("'a''b -- c'");
    expect(out, '★行註記が残っている').not.toContain('これは註記');
  });

  it('★dollar-quote の中の行註記は落とす（★関数本文の註記）', () => {
    const sql = `create function f() returns int language plpgsql as $fn$\nbegin\n  -- ★ここは註記\n  return 1;\nend $fn$;`;
    const out = stripSqlComments(sql);
    expect(out, '★関数本文の註記が残っている').not.toContain('ここは註記');
    expect(out).toContain('return 1');
  });

  it('★塊註記（`/* */`）も落とす', () => {
    expect(stripSqlComments('/* ★註記 */ select 1;')).not.toContain('註記');
  });
});

describe('★実物に当てる', () => {
  it('🔴 ★走査が空振りしていない（R-21）', () => {
    expect(lastFunctionBody('bet_allowance').body.length).toBeGreaterThan(500);
    expect(allMigrationsBody().length).toBeGreaterThan(10000);
  });

  it('★無いものは投げる（★0 件を「該当なし」と読まない・R-21）', () => {
    expect(() => lastFunctionBody('no_such_function_xyz')).toThrow();
    expect(() => lastViewBody('no_such_view_xyz')).toThrow();
  });

  it('🔴 ★実物の移行から日本語の註記が消えている', () => {
    /**
     * ⚠️ ★`0044` の `comment on function bet_allowance` には
     *    ★**「誰も気づかない」**という語が入っています。★本文には入っていません。
     */
    const body = lastFunctionBody('bet_allowance').body;
    expect(body, '★comment on が残っている').not.toContain('誰も気づかない');
    expect(body, '★本文が読めていない').toContain('bet_limits');
  });
});
