/**
 * ★**初回設定の失敗の理由が、嘘をつかないこと**（★2026-09-24・オーナー申告）
 *
 * 【🔴 何が起きていたか】
 *   ★登録済みの人が `/setup` を開き直すと、★**「この牧場名はすでに使われています」**と出ていました。
 *   ✔ ★実測（staging の `pg_indexes`）: ★`users` の一意な索引は ★**`users_pkey`（id）だけ**。
 *      ★`stable_name` にも `display_name` にも一意制約は在りません。
 *   → ★**牧場名の重複では、そもそもエラーになりません。**
 *      ★`users_pkey`（＝その人の行が既に在る）を「牧場名の重複」と読み替えていたので、
 *      ★**出る理由が 100% 嘘**でした。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**在りもしない理由を出す**（★利用者は牧場名を変えて何度もやり直すことになる）
 *   ② ★**原因の語を推測で言い換える**（★当てはまるものだけ言い換える・UI1-9）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const LIB = readFileSync(path.join(ROOT, 'apps/web/src/lib/setup.ts'), 'utf8');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/setup/page.tsx'), 'utf8');
const MIGRATIONS = path.join(ROOT, 'db/migrations');

describe('★初回設定の失敗の理由（★嘘をつかない）', () => {
  it('① 🔴 ★「牧場名が使われています」を出さない（★一意制約が無いので起きない）', () => {
    expect(strip(PAGE)).not.toMatch(/牧場名.*使われ/);
    expect(strip(LIB)).not.toMatch(/'duplicate'/);
  });

  it('★`users_pkey` は「既に登録が済んでいる」に写す', () => {
    const live = strip(LIB);
    expect(live).toMatch(/users_pkey/);
    expect(live).toMatch(/error: 'already'/);
    expect(strip(PAGE)).toMatch(/すでに登録が済んでいます/);
  });

  /**
   * 🔴 ★**対照**: ★`stable_name` / `display_name` に一意制約を足した日には、この検査が落ちる。
   *   ★そのときは「牧場名が使われています」を**正しい理由として**戻してよい。
   *   ★いま落ちないことが、★「その理由は起きない」の根拠です。
   */
  it('🔴 ★対照: 名前の列に一意制約が無いことを、移行から確かめる', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf8'))
      .join('\n')
      .replace(/--[^\n]*/g, ' ');
    // ★`users` の名前の列に対する unique index / constraint が無い
    expect(all).not.toMatch(/unique[\s\S]{0,80}users[\s\S]{0,40}stable_name/i);
    expect(all).not.toMatch(/stable_name[\s\S]{0,40}unique/i);
  });
});
