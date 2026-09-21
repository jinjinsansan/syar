/**
 * ★**移行が本当に届いたかを、★DB で確かめる**（★③ O-7 再確認の一部・2026-09-20）。
 *
 * 【🔴 ★なぜ在るか】
 *   ★`migrate.mjs` は ★**33 個の OK** を並べます。★それは ★**道具がそう言った**だけです。
 *   ★★**DB に訊いていません。** ★この道具が訊きます。
 *
 * 【⚠️ ★「消えた」だけを見ない（★`CK-14`・★対照を必ず対で）】
 *   ★`0032` は ★`revoke all on all tables from anon, authenticated` を流します。
 *   ★**剥がれたこと**だけを見ると、★★**剥がしすぎが満点**になります。
 *   → ★**公開ビューが anon から まだ読めること**を、★同じ出力で対にします。
 *
 * 【★O-7 の本体は別の道具です】
 *   ★`tools/verify-anon-exposure.mjs`（★V-20 の全走査）が O-7 の判定です。
 *   ★この道具は ★**「移行が届いたか」**だけを見ます。★2 つ流してください。
 *
 * ⚠️ ★**読むだけ**（★`select` と `has_*_privilege` のみ）。★本番に向けて構いません。
 *
 * 【★使い方】
 *   npx tsx tools/verify-migration-landed.mjs --env staging      # ★先に期待値を作る
 *   npx tsx tools/verify-migration-landed.mjs --env production
 */
import pg from 'pg';

import { loadEnv, positionals } from './lib/env.mjs';
import { exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

positionals();
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const fails = [];
let checked = 0;
const check = (ok, label, detail) => {
  checked += 1;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${detail ? `  ${detail}` : ''}`);
};

console.log(`# ★移行が届いたか  接続先の申告: ${
  (await q('select environment from app_environment'))[0]?.environment ?? '(不明)'}`);

// ── ① 記録の数（★`migrate.mjs` の「完了」を DB で裏取りする） ──────────
const mig = (await q('select count(*)::int n, max(filename) last from schema_migrations'))[0];
/**
 * 🔴 ★**数を書きません**（★2026-09-21 に直しました）。
 *   ⚠️ ★`53` と書いてあり、★移行を 6 件 当てた瞬間に ★**正しい状態で落ちました**。
 *   ✅ ★`db/migrations/*.sql` を数えます。★増えたら自動で追随します。
 */
const { readdirSync } = await import('node:fs');
const fileCount = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).length;
check(mig.n === fileCount,
  `① ★移行が ${fileCount} 件（★db/migrations の数）記録されている（★道具の出力ではなく DB で）`,
  `${mig.n} 件 / 最後 ${mig.last}`);

// ── ② 画面が読むビューが在る（★0034 / 0046） ─────────────────────
for (const v of ['my_horses', 'my_runs']) {
  const r = (await q(
    "select count(*)::int n from information_schema.views where table_schema='public' and table_name=$1",
    [v],
  ))[0];
  check(r.n === 1, `② ★ビュー ${v} が在る`, `${r.n} 件`);
}

// ── ③ 列が在る（★0023 / 0028 / 0049 / 0053） ────────────────────
const COLUMNS = [
  ['races', 'course_frozen', '0023'],
  ['race_entries', 'scratched_at', '0028'],
  ['race_entries', 'prize_pp', '0049'],
  ['horses', 'growth_told_stats', '0053'],
];
for (const [t, col, from] of COLUMNS) {
  const r = (await q(
    `select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2`,
    [t, col],
  ))[0];
  check(r.n === 1, `③ ★列 ${t}.${col} が在る（★${from}）`, `${r.n} 件`);
}

// ── ④ 🔴 対照: ★剥がしすぎていないか（★公開ビューは anon から まだ読める） ──
/**
 * ⚠️ ★ここが ★**`CK-14` の対（つい）**です。
 *   ★「anon の書き権限が消えた」だけを見ると、★**全部 剥がした状態が満点**になります。
 */
const PUBLIC_VIEWS = ['races_public', 'race_entries_public'];
for (const v of PUBLIC_VIEWS) {
  const r = (await q(
    `select to_regclass($1) is not null as exists,
            coalesce(has_table_privilege('anon', $1, 'select'), false) as can_read`,
    [`public.${v}`],
  ))[0];
  check(r.exists === true && r.can_read === true,
    `④ 🔴 ★対照: ${v} が anon から まだ読める（★剥がしすぎていない）`,
    `在る=${r.exists} / 読める=${r.can_read}`);
}

// ── ⑤ 🔴 O-7 の芯: ★anon に書き権限が付いていない ─────────────────
const w = (await q(
  `select count(*)::int n from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`,
))[0];
check(w.n === 0, '⑤ 🔴 ★anon / authenticated に書き権限が 1 つも付いていない（★O-7）',
  `${w.n} 件`);

// ── ⑥ 利用者向け RPC の EXECUTE（★0021 / 0022 が剥がしたもの） ──────────
const FNS = [
  ['spend_training_ep(uuid, bigint, integer)', '0021'],
  ['place_bet(uuid, text, jsonb, integer, uuid)', '0022'],
  ['exchange_prize(bigint, uuid)', '0022'],
];
for (const [sig, from] of FNS) {
  const r = (await q(
    `select coalesce(has_function_privilege('anon', $1, 'execute'), false) as anon_exec`,
    [`public.${sig}`],
  ))[0];
  check(r.anon_exec === false, `⑥ ★anon は ${sig.split('(')[0]} を実行できない（★${from}）`,
    `anon の EXECUTE = ${r.anon_exec}`);
}

// ── ⑦ ★数えるだけ（★合否にしない。★staging と並べるための材料） ─────────
const shape = (await q(
  `select
     (select count(*)::int from information_schema.views where table_schema='public') views,
     (select count(*)::int from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE') tables,
     (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public') funcs`,
))[0];
console.log(`  … ★形（合否ではない）: ビュー ${shape.views} / 表 ${shape.tables} / 関数 ${shape.funcs}`);

/**
 * ⚠️ ★**H-3（持ち馬が全頭 休養）の答え合わせは、★ここではしません。**
 *   ★`0021` が入っても、★直るのは ★**次にワーカーが週を送ったとき**です。
 *   ★いま測ると「まだ直っていない」が出ますが、★それは ★**移行のせいではありません**。
 *   → ★★**時刻を分けて測ること。** ★材料だけ出します。
 */
const rest = (await q(
  `select count(*)::int owned,
          count(*) filter (where rest_until_week is not null)::int resting,
          max(last_processed_week)::int max_lpw
     from horses where owner_id is not null`,
))[0];
console.log(`  … ★持ち馬（★H-3 の材料・合否ではない）: ${rest.owned} 頭 / `
  + `休養中 ${rest.resting} / 最後に送った週 ${rest.max_lpw}`);
console.log('     ⚠️ ★いまの値は「移行の前の姿」です。★ワーカーが次の週を送ってから測り直すこと');

await c.end();
exitWithVerdict(verdictOf({ checked, failed: fails.length, label: '★移行が届いたか' }));
