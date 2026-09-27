/**
 * ★**0 行のビューの判定**（★`tools/verify-user-eyes.mjs` の部品・★2026-09-27・裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md` §5 / §5-1）
 *
 * 🔴 ★行が無ければ ★列の式は評価されないので、★`select *` でも ★「読める」は未証明です（★`count(*)` と同じ理屈の双子）。
 *   → ★そのビューが呼ぶ `public` の関数を ★**同じ役で直に呼び**、★実行権と ★関数の中の表まで通ることを見ます。
 *   ★関数を 1 つも呼ばないビューは ★「対象外」（★「判定不能」という 3 つ目の状態を作らない・TL-1）。
 *   ⚠️ ★状態を変えうる関数（`volatile`）は ★直に呼びません → ★確かめられない ＝ ★不合格。
 *
 * ★DB を知らない純粋な部品にしてあるのは、★**この道を落ちる形と通る形で 1 度ずつ走らせるため**です
 *   （★網 `apps/cli/test/user-eyes-empty-view.test.ts`）。★道具は ★本物の DB の問い合わせを `callAs` に渡します。
 */

/** ★仮の引数（★型ごと 1 つ）。★作れない型は `undefined`（★確かめられない ＝ 不合格） */
export const DUMMY_ARGS = {
  uuid: 'gen_random_uuid()', integer: '0', bigint: '0', smallint: '0', numeric: '0',
  text: "''", 'character varying': "''", boolean: 'false',
};

/**
 * @param {{
 *   viewDef: string,
 *   publicFns: readonly { name: string, sig: string, vol: string, args: readonly string[] }[],
 *   callAs: (sql: string) => Promise<{ ok: boolean, error?: string }>,
 *   quote: (name: string) => string,
 * }} p
 * @returns {Promise<{ verdict: 'ok' | 'na' | 'fail', note: string }>}
 */
export async function emptyViewVerdict({ viewDef, publicFns, callAs, quote }) {
  const called = publicFns.filter((f) => new RegExp(`\\b${f.name}\\s*\\(`, 'i').test(viewDef));
  if (called.length === 0) return { verdict: 'na', note: '0 行・★関数を呼ばないので対象外' };
  const notes = [];
  for (const f of called) {
    if (f.vol === 'v') return { verdict: 'fail', note: `0 行・${f.sig} は volatile（★直に呼ばない ＝ 確かめられない）` };
    const args = f.args.map((t) => DUMMY_ARGS[t]);
    if (args.some((a) => a === undefined)) return { verdict: 'fail', note: `0 行・${f.sig} の引数を作れない（★確かめられない）` };
    const r = await callAs(`select public.${quote(f.name)}(${args.join(', ')})`);
    if (!r.ok) return { verdict: 'fail', note: `0 行・${f.sig} を直に呼んで落ちた: ${r.error}` };
    notes.push(`${f.name}() ✓`);
  }
  return { verdict: 'ok', note: `0 行・★呼ぶ関数を直に呼んで通った（${notes.join(' ')}）` };
}
