/**
 * 🔴 ★**0 行のビューの判定を、★落ちる形と通る形で 1 度ずつ走らせる**
 *   （★2026-09-27・裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md` §5-1）
 *
 * 【★なぜ要るか】
 *   ★`tools/verify-user-eyes.mjs` の「★0 行のビューが呼ぶ関数を直に呼ぶ」道は、★staging では ★1 度も走っていません
 *   （★0 行で関数を呼ぶビューが無い）。★仕組みは在るが ★動かしたことがない形です（★今週の主役）。
 *   → ★道具と同じ部品（`tools/lib/user-eyes.mjs` の `emptyViewVerdict`）に、★**合成の SQL から答える偽の DB** を渡して
 *     ★分かれ目（★対象外 ／ 不合格 ／ ok）を ★実際に通します。
 *
 * ⚠️ ★本物の PostgreSQL ではありません（★手元に無い・★staging に仮のビューを作るのは書き込みになる）。
 *    ★偽の DB は ★「★関数が definer でなく、★利用者から `revoke` した表に触れたら ★permission denied」だけを真似ます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- ★道具の部品は .mjs（★型は下で受ける）
import { emptyViewVerdict as emptyViewVerdictUntyped } from '../../../tools/lib/user-eyes.mjs';

interface Fn { readonly name: string; readonly sig: string; readonly vol: string; readonly args: readonly string[] }
type Verdict = { verdict: 'ok' | 'na' | 'fail'; note: string };
const emptyViewVerdict = emptyViewVerdictUntyped as (p: {
  viewDef: string; publicFns: readonly Fn[];
  callAs: (sql: string) => Promise<{ ok: boolean; error?: string }>; quote: (n: string) => string;
}) => Promise<Verdict>;

/** ★合成の SQL から ★「関数が definer か」「取り上げた表に触るか」を読む（★後の `alter` が勝つ） */
function fakeDb(sqls: readonly string[]): (sql: string) => Promise<{ ok: boolean; error?: string }> {
  const all = sqls.join('\n');
  const revoked = [...all.matchAll(/revoke\s+all\s+on\s+([a-z_]+)\s+from\s+[^;]*\b(anon|authenticated)\b/gi)].map((m) => m[1]!);
  const fns = new Map<string, { definer: boolean; body: string }>();
  for (const m of all.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$([^;]*);|alter\s+function\s+(?:public\.)?([a-z_]+)\s*\([^)]*\)\s+security\s+(definer|invoker)/gi)) {
    if (m[1] !== undefined) fns.set(m[1], { definer: /security\s+definer/i.test(`${m[2]} ${m[4]}`), body: m[3]! });
    else { const f = fns.get(m[5]!); if (f !== undefined) f.definer = m[6]!.toLowerCase() === 'definer'; }
  }
  return async (sql) => {
    const name = /select public\."?([a-z_]+)"?\(/i.exec(sql)?.[1];
    const f = name === undefined ? undefined : fns.get(name);
    if (f === undefined) return { ok: false, error: `function ${name ?? '?'} does not exist` };
    const hit = revoked.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(f.body));
    return !f.definer && hit !== undefined ? { ok: false, error: `permission denied for table ${hit}` } : { ok: true };
  };
}

/** ★0 行で ★関数を呼ぶビュー（★`where false` で行は必ず 0） */
const BASE = [
  'create table t (id uuid); revoke all on t from anon, authenticated;',
  'create or replace function public.f(p uuid) returns bigint language sql stable as $$ select count(*) from t where id = p $$;',
];
const VIEW_DEF = ' SELECT f(gen_random_uuid()) AS n FROM t0 WHERE false;';
const FN: Fn = { name: 'f', sig: 'f(uuid)', vol: 's', args: ['uuid'] };
const quote = (n: string): string => `"${n}"`;

describe('🔴 ★0 行のビューの判定（★落ちる形と通る形を 1 度ずつ）', () => {
  it('🔴 ① ★関数が invoker のまま ＝ ★不合格（★直に呼んで permission denied）', async () => {
    const r = await emptyViewVerdict({ viewDef: VIEW_DEF, publicFns: [FN], callAs: fakeDb(BASE), quote });
    expect(r.verdict).toBe('fail');
    expect(r.note).toContain('permission denied for table t');
  });

  it('✅ ② ★関数を definer にすると ＝ ★ok（★同じビュー・同じ呼び方）', async () => {
    const r = await emptyViewVerdict({
      viewDef: VIEW_DEF, publicFns: [FN], callAs: fakeDb([...BASE, 'alter function public.f(uuid) security definer;']), quote,
    });
    expect(r.verdict).toBe('ok');
    expect(r.note).toContain('f() ✓');
  });

  it('－ ③ ★関数を呼ばない 0 行のビュー ＝ ★対象外（★呼ばずに言う）', async () => {
    let calls = 0;
    const r = await emptyViewVerdict({
      viewDef: ' SELECT id FROM t0 WHERE false;', publicFns: [FN],
      callAs: async () => { calls += 1; return { ok: true }; }, quote,
    });
    expect(r.verdict).toBe('na');
    expect(calls, '★対象外なのに関数を呼んでいる').toBe(0);
  });

  it('🔴 ④ ★確かめられないものは ★不合格（★volatile・★引数を作れない）', async () => {
    const neverCalled = async (): Promise<{ ok: boolean }> => { throw new Error('★呼んではいけない'); };
    expect((await emptyViewVerdict({ viewDef: VIEW_DEF, publicFns: [{ ...FN, vol: 'v' }], callAs: neverCalled, quote })).verdict).toBe('fail');
    expect((await emptyViewVerdict({ viewDef: VIEW_DEF, publicFns: [{ ...FN, args: ['jsonb'] }], callAs: neverCalled, quote })).verdict).toBe('fail');
  });

  it('★道具は この部品を通っている（★写しを持たない）', () => {
    const tool = readFileSync(path.resolve(__dirname, '../../../tools/verify-user-eyes.mjs'), 'utf8');
    expect(tool).toContain("import { emptyViewVerdict } from './lib/user-eyes.mjs';");
    expect(tool).toMatch(/return emptyViewVerdict\(\{ viewDef, publicFns, callAs: \(sql\) => asRole\(role, sql\)/);
    expect(tool, '★道具に判定の写しが残っている').not.toMatch(/const DUMMY = \{/);
  });
});
