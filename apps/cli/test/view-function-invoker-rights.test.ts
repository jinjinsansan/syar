/**
 * 🔴 ★**利用者に見せるビューが呼ぶ関数は、★definer か、★利用者が読める表だけに触る**
 *   （★2026-09-27・裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md` の条件 4・★簿 `VIEW-CALLS-FUNCTION-INVOKER-RIGHTS`）
 *
 * 【🔴 ★何が起きたか】
 *   ★`0086` の `horse_wins()` / `horse_starts()` は ★definer でなく、★中で `race_entries` を読みます。
 *   ★`my_horses`（`0087`）など 3 つのビューが ★それを呼び、★本番で ★「permission denied for table race_entries」。
 *   ★ビューの持ち主の権限が効くのは ★**ビューが直に参照する表だけ**で、★**中から呼んだ関数の本体は 利用者の権限**で走ります。
 *   → ★★**権限は、通る道のいちばん狭い所で決まる。**
 *
 * 【★この網が見るもの（★移行の原文だけ・★DB には繋がない）】
 *   ★① ★`anon` / `authenticated` に `select` を与えたビューの ★いまの定義
 *   ★② ★そのビューが呼ぶ ★移行で作った関数（★いまの定義と、★後からの `alter function … security definer|invoker`）
 *   ★③ ★その関数が ★definer でなく、★本体で ★利用者から `revoke` した表に触っていたら ★落とす
 *
 * ⚠️ ★見ないもの: ★関数から関数を呼ぶ入れ子（★1 段だけ）・★RLS で絞った表（★`revoke` した表だけを見る）。
 *    ★本番での実際の読み取りは ★配備の手順書の段（★利用者の目で 1 本ずつ読む）が受け持ちます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { migrationFiles, stripSqlComments } from './lib/sql-source.js';

const DIR = path.resolve(__dirname, '../../../db/migrations');
const ident = '(?:public\\s*\\.\\s*)?([a-z_][a-z0-9_]*)';
const USER_ROLES = /\b(anon|authenticated)\b/i;

interface Leak { readonly view: string; readonly fn: string; readonly table: string }

/** ★移行の原文（★番号順）から ★漏れを数える。★文字列だけを受け取る（★対照で合成の SQL を渡せるように） */
export function invokerLeaks(sqls: readonly string[]): Leak[] {
  const all = sqls.map((s) => stripSqlComments(s)).join('\n');

  /** ★利用者に見せている名前（★ビューも表も・★後で ビューの定義があるものだけ使う） */
  const exposed = new Set<string>();
  for (const m of all.matchAll(new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?${ident}\\s+to\\s+([^;]+);`, 'gi'))) {
    if (USER_ROLES.test(m[2]!)) exposed.add(m[1]!.toLowerCase());
  }
  /** ★利用者から取り上げた表 */
  const revoked = new Set<string>();
  for (const m of all.matchAll(new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?${ident}\\s+from\\s+([^;]+);`, 'gi'))) {
    if (USER_ROLES.test(m[2]!)) revoked.add(m[1]!.toLowerCase());
  }
  /** ★ビューのいまの定義（★後の定義が勝つ） */
  const views = new Map<string, string>();
  for (const m of all.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+${ident}\\s+as([\\s\\S]*?);`, 'gi'))) {
    views.set(m[1]!.toLowerCase(), m[2]!);
  }
  /**
   * ★関数のいまの定義と definer かどうか（★作った順・変えた順に 1 本の流れで読む）。
   *   ★`create function` は ★本体（`$tag$ … $tag$`）の前後で `security definer` を探す。
   */
  const fns = new Map<string, { body: string; definer: boolean }>();
  const stmt = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${ident}\\s*\\(([\\s\\S]*?)\\$([a-z_]*)\\$([\\s\\S]*?)\\$\\3\\$([^;]*);`
    + `|alter\\s+function\\s+${ident}\\s*\\([^)]*\\)\\s+security\\s+(definer|invoker)`,
    'gi',
  );
  for (const m of all.matchAll(stmt)) {
    if (m[1] !== undefined) {
      const head = `${m[2]!} ${m[5]!}`;
      fns.set(m[1].toLowerCase(), { body: m[4]!, definer: /security\s+definer/i.test(head) });
    } else if (m[6] !== undefined) {
      const f = fns.get(m[6].toLowerCase());
      if (f !== undefined) f.definer = m[7]!.toLowerCase() === 'definer';
    }
  }

  const leaks: Leak[] = [];
  for (const view of [...exposed].sort()) {
    const body = views.get(view);
    if (body === undefined) continue;
    const called = new Set([...body.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1]!.toLowerCase()));
    for (const fn of [...called].sort()) {
      const f = fns.get(fn);
      if (f === undefined || f.definer) continue;
      for (const table of [...revoked].sort()) {
        if (new RegExp(`\\b${table}\\b`, 'i').test(f.body)) leaks.push({ view, fn, table });
      }
    }
  }
  return leaks;
}

const read = (f: string): string => readFileSync(path.join(DIR, f), 'utf8');

describe('🔴 ★利用者に見せるビューが呼ぶ関数の権限', () => {
  it('★走査が空振りしていない', () => {
    const all = stripSqlComments(migrationFiles().map(read).join('\n'));
    expect(migrationFiles().length).toBeGreaterThan(80);
    expect(all).toMatch(/revoke\s+all\s+on\s+race_entries\s+from\s+anon,\s*authenticated/i);
    expect(all).toMatch(/create\s+or\s+replace\s+view\s+my_horses\s+as/i);
  });

  /**
   * ✅ ★**対照（★本物の障害）**: ★`0090` を抜いた一式では ★今回の 3 つのビューを ★名指しで捕まえる。
   *   ★「0 件だった」を合格と読ませないため、★**何本ぶん名指しで落ちたか**を数えます。
   */
  it('✅ ★対照: 0090 を抜くと、今回の 3 ビューを名指しで捕まえる', () => {
    const before = migrationFiles().filter((f) => !f.startsWith('0090_')).map(read);
    const leaks = invokerLeaks(before);
    const views = [...new Set(leaks.map((l) => l.view))].sort();
    expect(views).toEqual(['horse_market_listing_public', 'my_horses', 'retired_horses_public']);
    expect(leaks.every((l) => l.table === 'race_entries' && (l.fn === 'horse_wins' || l.fn === 'horse_starts'))).toBe(true);
  });

  it('🔴 ★いまの一式（0090 まで）では 漏れが 0 件', () => {
    const leaks = invokerLeaks(migrationFiles().map(read));
    expect(leaks.map((l) => `${l.view} → ${l.fn}() → ${l.table}`),
      '🔴 ★利用者に見せるビューが ★definer でない関数を呼び、★その関数が 利用者の読めない表に触っています。\n'
      + '  ★本番で「permission denied」になります（★2026-09-27 の障害）。★関数を definer にするか、★ビューが直に読む形に').toEqual([]);
  });

  it('✅ ★対照（合成）: definer なら通り、invoker に戻すと落ちる', () => {
    const base = [
      'create table t (id int); revoke all on t from anon, authenticated;',
      'create or replace function public.f() returns int language sql stable as $fn$ select count(*)::int from t $fn$;',
      'create or replace view v as select f() as n; grant select on v to anon, authenticated;',
    ];
    expect(invokerLeaks(base)).toEqual([{ view: 'v', fn: 'f', table: 't' }]);
    expect(invokerLeaks([...base, 'alter function public.f() security definer;'])).toEqual([]);
    expect(invokerLeaks([...base, 'alter function public.f() security definer;', 'alter function f() security invoker;']))
      .toEqual([{ view: 'v', fn: 'f', table: 't' }]);
    /** ★definer で作った関数は通る（★本体の後ろに書く形も） */
    expect(invokerLeaks([base[0]!,
      'create function f() returns int language sql stable security definer as $$ select 1 from t $$;', base[2]!])).toEqual([]);
    /** ★利用者に見せていないビューは見ない */
    expect(invokerLeaks([base[0]!, base[1]!, 'create or replace view v as select f() as n;'])).toEqual([]);
  });
});
