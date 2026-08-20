/**
 * ★anon キーで何が読めるかの全数確認（§8.6・§12.4・§14.3）
 *
 * 【なぜ要るか】
 *   レビュー側が本番・staging とも **anon で `app_environment` を読めた**ことを発見しました。
 *   環境名そのものは実害が小さいものの、**public スキーマに守りの無いテーブルがある**ことを示します。
 *   同じ状態のものが次にあると、正典の中核が丸ごと壊れます:
 *
 *     `races.server_seed`   → 発走前に reveal が読める＝**§8.6 の Provably Fair が無意味**
 *     `horses.potential` / `genotype` → **§12.4「本人にも数値を見せない」が無意味**（★の丸めが飾りになる）
 *     `users` / `ep_ledger` / `pp_ledger` → 他人の口座と台帳
 *
 * 【期待される姿】
 *   `0002_rls_and_place_bet.sql` と `0006_public_views.sql` の設計から:
 *     **公開ビュー（`*_public`）だけが読め、それ以外は anon から 0 行または拒否。**
 *
 * 【★このツールは読むだけ】
 *   一覧の取得に service_role を使いますが `select` のみ。anon 側も `select` のみ。
 *   **本番に対しても安全**ですが、順序は「staging で期待値を確定 → 本番を1回」とすること
 *   （測定と探索を本番で混ぜない・裁定 2026-08-20）。
 *
 * 実行:
 *   npx tsx tools/verify-anon-exposure.mjs --env staging
 *   npx tsx tools/verify-anon-exposure.mjs --env production
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';

const env = loadEnv();

/** ★漏れたら正典の中核が壊れる列。名前で狙い撃ちして個別に報告する */
const CRITICAL_COLUMNS = [
  ['races', 'server_seed', '§8.6 Provably Fair（発走前に reveal が読める）'],
  ['horses', 'potential', '§12.4 本人にも数値を見せない'],
  ['horses', 'genotype', '§5.5 生値をクライアントに送らない'],
];

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const envRow = await client.query('select environment from app_environment');
const environment = envRow.rows[0]?.environment ?? '(不明)';
console.log(`[env] DB の申告: ${environment}`);

const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** public スキーマの実体テーブルとビューを全部拾う */
const { rows: objects } = await client.query(`
  select table_name, table_type
  from information_schema.tables
  where table_schema = 'public'
  order by table_type, table_name
`);

/** RLS の有効/無効とポリシー数（構造側の状態。振る舞いと突き合わせる） */
const { rows: rls } = await client.query(`
  select c.relname,
         c.relrowsecurity as rls_enabled,
         (select count(*) from pg_policies p where p.tablename = c.relname)::int as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
`);
const rlsOf = new Map(rls.map((r) => [r.relname, r]));

console.log(`\n=== anon で読めるか（public の ${objects.length} 件） ===`);

const readable = [];
const denied = [];
for (const o of objects) {
  const r = await anon.from(o.table_name).select('*').limit(1);
  const isPublicView = o.table_name.endsWith('_public');
  if (r.error) {
    denied.push(o.table_name);
    continue;
  }
  readable.push({ name: o.table_name, rows: r.data.length, cols: r.data[0] ? Object.keys(r.data[0]) : [], isPublicView, type: o.table_type });
}

console.log('\n--- 読めたもの ---');
for (const x of readable) {
  const st = rlsOf.get(x.name);
  const structure = st === undefined ? 'ビュー' : `RLS ${st.rls_enabled ? '有効' : '★無効'}・ポリシー ${st.policies}`;
  const mark = x.isPublicView ? '  ' : '★';
  console.log(`${mark} ${x.name.padEnd(28)} ${String(x.rows)}行  ${structure}`);
  if (!x.isPublicView && x.cols.length > 0) console.log(`     列: ${x.cols.join(', ')}`);
}
console.log(`\n--- 拒否されたもの（${denied.length} 件） ---`);
console.log(`  ${denied.join(', ')}`);

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------
console.log('\n=== 判定 ===');
const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`  ${ok ? '✅' : '🔴'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// ★「0行だった」を合格にしない。**なぜ0行なのか**で分ける。
//
//   保護されて0行  … RLS 有効＋ポリシーあり（`user_id = auth.uid()` で anon には出ない）＝設計どおり
//   無防備で0行    … RLS 無効 or ポリシー0。**今たまたま空なだけで、行が入った瞬間に開く**
//
//   ★この区別が要点です。`users` は現在0行ですが、それは利用者がいないからであって
//     守られているからではありません。**最初の1人が登録した瞬間に、その行は公開されます。**
const nonView = readable.filter((x) => !x.isPublicView);
const guarded = nonView.filter((x) => {
  const st = rlsOf.get(x.name);
  return st !== undefined && st.rls_enabled && st.policies > 0;
});
const unguarded = nonView.filter((x) => !guarded.includes(x));

check(
  '★anon に露出している実体テーブルが無い（0行でも「無防備で空」は不合格）',
  unguarded.length === 0,
  unguarded.length === 0 ? '' : `★無防備: ${unguarded.map((x) => `${x.name}(${x.rows}行)`).join(', ')}`,
);
if (guarded.length > 0) {
  console.log(`  （参考）RLS＋ポリシーで0行に制御されているもの: ${guarded.map((x) => x.name).join(', ')}`);
}

for (const [table, column, why] of CRITICAL_COLUMNS) {
  const r = await anon.from(table).select(column).limit(1);
  const exposed = r.error === null;
  check(`★${table}.${column} が anon から読めない（${why}）`, !exposed,
    exposed ? `★読めてしまう（${r.data.length} 行）` : `拒否: ${r.error.message.slice(0, 40)}`);
}

// RLS が無効な実体テーブル（読めなくても、将来 grant が変われば開く）
const noRls = rls.filter((r) => !r.rls_enabled).map((r) => r.relname);
check('public の実体テーブルはすべて RLS 有効', noRls.length === 0,
  noRls.length === 0 ? '' : `★RLS 無効: ${noRls.join(', ')}`);

await client.end();

const ng = results.filter((r) => !r.ok);
console.log(`\n=== ${ng.length === 0 ? '全件 合格' : `🔴 ${ng.length} 件 不合格`}（${results.length} 件中・環境 ${environment}） ===`);
process.exit(ng.length === 0 ? 0 : 1);
