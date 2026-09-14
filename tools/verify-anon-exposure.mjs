/**
 * ★V-20 — public スキーマの露出を全走査で判定する（§8.6・§12.4・§14.3・憲法 §0.2-4）
 *
 * 【何を測るか】
 *   ① anon / authenticated に **insert / update / delete / truncate が付与されていない**こと
 *   ② 公開ビューとして登録されたもの以外は、**anon から0行**であること
 *   ③ **除外は明示の登録簿でのみ許され、登録簿に無いテーブルが現れたら落ちる**
 *   ④ public の**関数**の EXECUTE（anon / authenticated）が登録簿どおりで、**登録簿に無い関数が現れたら落ちる**
 *      （★2026-09-14・監査 H-4。関数の実行権限はテーブルと別に付く。
 *        `spend_training_ep` は `0013`・`0014` が anon を剥がし忘れていた）
 *
 * 【★①が加わった経緯】
 *   前の版は「読めるか」しか測っていませんでした。**権限は読みと書きで別に付きます。**
 *   実測で **`users` に anon の UPDATE が付いており、誰でも他人の EP/PP を書き換えられる**
 *   状態でした（読みは0行なので「安全」に見えていた）。
 *   さらに **`ep_ledger` / `pp_ledger` に anon の TRUNCATE** が付いていました。
 *   **TRUNCATE は RLS の対象外**なので、ポリシーがあっても止まりません。
 *
 *   ★「全数」と名乗る検査が、軸の一つしか走査していなかった形です
 *     （V-2d が平均だけ・V-2e が距離だけを見ていたのと同じ・D-012）。
 *
 * 【★道具の形を変えた理由】
 *   「HTTP で1つずつ叩いて読めるか確かめる」から
 *   「**`information_schema` に何が付与されているかを列挙する**」へ移しました。
 *   叩く形は**叩いた分しか分からず、叩き忘れたものは黙って通ります**。
 *   （Q-3 の S-4「走査を全走査＋除外リストに反転」と同じ移行）
 *
 * 【★このツールは読むだけ】
 *   `select` のみ。本番に向けても安全ですが、**探索を本番で混ぜない**こと
 *   （staging で期待される姿を確定させてから、本番を確認する）。
 *
 * 実行:
 *   npx tsx tools/verify-anon-exposure.mjs --env staging
 *   npx tsx tools/verify-anon-exposure.mjs --env production
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import {
  EXPECTED_EXPOSURE, PUBLIC_VIEW, WRITE_PRIVILEGES,
  unregistered, stale, judgeGrants, judgeReads,
  unregisteredFunctions, staleFunctions, judgeFunctionExecute,
} from './lib/exposure-registry.mjs';

/** ★漏れたら正典の中核が壊れる列。全走査に加えて名前で狙い撃ちもする */
const CRITICAL_COLUMNS = [
  ['races', 'server_seed', '§8.6 Provably Fair'],
  ['horses', 'potential', '§12.4 本人にも数値を見せない'],
  ['horses', 'genotype', '§5.5 生値を送らない'],
];

const WRITE_PRIVS = new RegExp(`^(${WRITE_PRIVILEGES.join('|')})$`);

const env = loadEnv();
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const envRow = await client.query('select environment from app_environment');
const environment = envRow.rows[0]?.environment ?? '(不明)';
console.log(`[env] DB の申告: ${environment}\n`);

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`  ${ok ? '✅' : '🔴'} ${label}${detail ? `\n       ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// 走査
// ---------------------------------------------------------------------------
const { rows: objects } = await client.query(`
  select table_name, table_type
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`);
const names = objects.map((o) => o.table_name);

const { rows: grants } = await client.query(`
  select table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','authenticated')
  order by table_name, grantee, privilege_type
`);

console.log(`=== 付与の全列挙（public・${objects.length} オブジェクト / 付与 ${grants.length} 件） ===`);
const byObject = new Map();
for (const g of grants) {
  const key = `${g.table_name} ${g.grantee}`;
  if (!byObject.has(key)) byObject.set(key, []);
  byObject.get(key).push(g.privilege_type);
}
for (const [key, privs] of [...byObject.entries()].sort()) {
  const [name, grantee] = key.split(' ');
  const writes = privs.filter((p) => WRITE_PRIVS.test(p));
  console.log(`  ${writes.length > 0 ? '🔴' : '  '} ${name.padEnd(22)} ${grantee.padEnd(14)} ${privs.sort().join(',')}`);
}
if (grants.length === 0) console.log('  （付与なし）');

// ★④ 関数の EXECUTE を pg_proc から全走査する（関数名を手で並べない・R-29）
const { rows: functionRows } = await client.query(`
  select p.oid::regprocedure::text as fn,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
   order by 1
`);
console.log(`\n=== 関数の EXECUTE（public・${functionRows.length} 件） ===`);
for (const f of functionRows) {
  console.log(`  ${f.fn.padEnd(60)} anon=${f.anon ? 'YES' : ' - '}  authenticated=${f.authenticated ? 'YES' : ' - '}`);
}
if (functionRows.length === 0) console.log('  （関数なし）');

// ---------------------------------------------------------------------------
console.log('\n=== V-20 の判定 ===');

// ③ 登録簿との突き合わせ（★これが本体。先に判定する）
const missing = unregistered(names);
check(
  '★③ 登録簿に無いオブジェクトが無い（新しいテーブルを黙って足せない）',
  missing.length === 0,
  missing.length === 0 ? '' : `★未登録: ${missing.join(', ')} → tools/lib/exposure-registry.mjs に姿を書くこと`,
);
const gone = stale(names);
check(
  '登録簿に、DB に存在しないものが残っていない',
  gone.length === 0,
  gone.length === 0 ? '' : `★登録簿にあるが DB に無い: ${gone.join(', ')}`,
);

// ① 書き込み権限（★TRUNCATE を含める。RLS はこれを止めない）
const writable = judgeGrants(grants);
check(
  '★① anon / authenticated に書き込み権限が無い（TRUNCATE を含む）',
  writable.length === 0,
  writable.length === 0 ? '' : `★${writable.join(', ')}`,
);

// ④ 関数の EXECUTE（★監査 H-4。登録簿との突き合わせを先に）
const functionNames = functionRows.map((f) => f.fn);
const functionsMissing = unregisteredFunctions(functionNames);
check(
  '★④ 登録簿に無い関数が無い（新しい関数を黙って足せない）',
  functionsMissing.length === 0,
  functionsMissing.length === 0
    ? ''
    : `★未登録: ${functionsMissing.join(', ')} → tools/lib/exposure-registry.mjs の EXPECTED_FUNCTION_EXECUTE に実測の姿を書くこと`,
);
const functionsGone = staleFunctions(functionNames);
check(
  '関数の登録簿に、DB に存在しないものが残っていない',
  functionsGone.length === 0,
  functionsGone.length === 0 ? '' : `★登録簿にあるが DB に無い: ${functionsGone.join(', ')}`,
);
const functionsWrong = judgeFunctionExecute(functionRows);
check(
  '★④ 関数の EXECUTE が登録簿どおり（anon / authenticated）',
  functionsWrong.length === 0,
  functionsWrong.length === 0 ? '' : `★${functionsWrong.join(', ')}`,
);

// ② 振る舞い: 公開ビュー以外は anon から0行
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const reads = [];
for (const o of objects) {
  const r = await anon.from(o.table_name).select('*').limit(1);
  reads.push({ name: o.table_name, rows: r.error === null ? r.data.length : -1 });
}
const { leaked, viewsUnreadable } = judgeReads(reads);
check(
  '★② 公開ビュー以外は anon から0行',
  leaked.length === 0,
  leaked.length === 0 ? '' : `★${leaked.join(', ')}`,
);
check(
  '公開ビューは anon から読める（塞ぎすぎていない）',
  viewsUnreadable.length === 0,
  viewsUnreadable.length === 0 ? '' : `★読めない: ${viewsUnreadable.join(', ')}`,
);

// 中核の列（全走査に加えた狙い撃ち）
for (const [table, column, why] of CRITICAL_COLUMNS) {
  const r = await anon.from(table).select(column).limit(1);
  check(`★${table}.${column} が anon から読めない（${why}）`, r.error !== null,
    r.error === null ? `★読めてしまう（${r.data.length} 行）` : '');
}

await client.end();

const ng = results.filter((r) => !r.ok);
console.log(`\n=== ${ng.length === 0 ? 'V-20 合格' : `🔴 V-20 不合格 ${ng.length} 件`}（${results.length} 件中・環境 ${environment}） ===`);
process.exit(ng.length === 0 ? 0 : 1);
