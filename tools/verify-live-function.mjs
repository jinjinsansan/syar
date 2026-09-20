/**
 * ★**当てようとしている migration が前提にしている「稼働中の定義」を、★その場で確かめる**
 * （★2026-09-20・★`db/migrations/0021` の冒頭が要求している照合）。
 *
 * 【🔴 ★なぜ在るか】
 *   ★`create or replace function` は ★**いま在るものを黙って上書きします。**
 *   ★`0021` は ★「本体は `0020` に再掲された定義から作った」と書いたうえで、
 *   ★★**「稼働中の定義を取得して照合してから適用すること。照合前に適用しないこと」**
 *   ★と自分で書いています。★その照合が、★半年 実施されていませんでした。
 *
 * 【⚠️ ★staging の md5 と比べてはいけません】
 *   🔴 ★2026-09-20、★レビュー側が「本番と staging の md5 を並べて、★一致すれば前提が満たされる」
 *     ★と書きました。★**これは誤りです。**
 *   ✔ ★**実測**: ★staging は **53/53 適用済み**なので ★`0021` が既に入っており、
 *     ★staging の定義は ★**当てた後**の姿です（md5 `d68a7799…`）。
 *     ★本番は **20/53** なので ★**当てる前**の姿（★`0020`）です。
 *   → ★★**一致しないのが正常。** ★並べると ★**「手で書き換えられていた」と誤報します。**
 *   ✅ ★正しい相手は ★**「その環境に最後に当たった migration の再掲」**です。
 *
 * 【★この方法が正確であることの裏取り（★対照）】
 *   ✔ ★staging で ★**ファイルから切り出した本文の md5 と、★DB の `md5(pg_get_functiondef())` が
 *     ★完全に一致**しました（★どちらも `d68a7799bf82d13c953de5040a6fdead`）。
 *   → ★★`pg_get_functiondef()` の出力形式のまま再掲されているので、★**バイト単位で比べられます。**
 *
 * 【★使い方】
 *   npx tsx tools/verify-live-function.mjs --env production \
 *     --function spend_training_ep --expect db/migrations/0020_rpc_setup_guard.sql
 *
 * ⚠️ ★**読むだけ**です。★本番に向けて構いません（★`READONLY`）。
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';

import { loadEnv, positionals } from './lib/env.mjs';
import { VERDICT, exitWithVerdict, verdictOf } from './lib/counted-verdict.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/**
 * 🔴 ★**既定を置きません。** ★「どの関数を」「何と比べるか」は ★**呼ぶ人が名指しする**（★**R-27**）。
 *    ★既定を置くと、★別の関数を確かめたつもりで既定を確かめてしまいます。
 */
const FN = arg('function');
const EXPECT = arg('expect');
if (!FN || !EXPECT) {
  console.error('使い方: --env <環境> --function <関数名> --expect <migration ファイル>');
  console.error('  例: --env production --function spend_training_ep'
    + ' --expect db/migrations/0020_rpc_setup_guard.sql');
  process.exit(VERDICT.UNDECIDABLE);
}
positionals();
const env = loadEnv();

/** ★migration の本文から、★その関数の再掲を切り出す */
function reciteFrom(path, fn) {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const head = src.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  if (head < 0) return null;
  const end = src.indexOf('\n$function$', head);
  if (end < 0) return null;
  return `${src.slice(head, end + '\n$function$'.length)}\n`;
}

const expected = reciteFrom(EXPECT, FN);
if (expected === null) {
  console.error(`🔴 ★${EXPECT} に ${FN} の再掲が見つかりません`);
  process.exit(VERDICT.UNDECIDABLE);
}
const expectedMd5 = createHash('md5').update(expected, 'utf8').digest('hex');

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s) => (await c.query(s)).rows;

const rows = await q(
  `select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) md5,
          pg_get_functiondef(p.oid) def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '${FN.replace(/'/g, "''")}'`,
);

console.log(`# ★稼働中の定義の照合  関数 ${FN} / 期待の出どころ ${EXPECT}`);
console.log(`  ★期待の md5: ${expectedMd5}`);

const fails = [];
let checked = 0;
if (rows.length === 0) {
  console.log(`  ？ ★${FN} が在りません（★判定不能）`);
} else if (rows.length > 1) {
  // ⚠️ ★同名で引数違いが在ると、★どれを上書きするかが変わります
  console.log(`  ？ ★同名の関数が ${rows.length} 本 在ります（★判定不能）:`);
  for (const r of rows) console.log(`     ${r.sig}  md5 ${r.md5}`);
} else {
  checked = 1;
  const r = rows[0];
  console.log(`  ★稼働中: ${r.sig}  md5 ${r.md5}`);
  if (r.md5 === expectedMd5) {
    console.log('  ✓ ★一致しました。★この migration の前提は満たされています');
  } else {
    fails.push(`${FN} の稼働中の定義が、${EXPECT} の再掲と違います`);
    console.log('  🔴 ★**一致しません。** ★手で書き換えられている可能性があります');
    const live = String(r.def).replace(/\r\n/g, '\n').split('\n');
    const want = expected.split('\n');
    for (let i = 0; i < Math.max(live.length, want.length); i += 1) {
      if (live[i] !== want[i]) {
        console.log(`     ★最初に違う行 ${i + 1}:`);
        console.log(`       稼働中: ${live[i] ?? '(無し)'}`);
        console.log(`       期待  : ${want[i] ?? '(無し)'}`);
        break;
      }
    }
  }
}

/**
 * ★**いま繋いでいるロール**（★`0032` の `revoke ... from anon, authenticated` が
 *   ★ワーカーに効かないことを確かめるため）。
 * ⚠️ ★**映らなかったことを「無害」と読まないこと**（★`CK-14`）。★ワーカーは間欠で繋ぎます。
 */
console.log('');
console.log(`  ★このセッションのロール: ${(await q('select current_user u'))[0].u}`);
/**
 * 🔴 ★**`anon` / `authenticated` で「繋げるのか」を先に見ます**（★2026-09-20 に足しました）。
 *
 *   ⚠️ ★旧: ★`pg_stat_activity` を `distinct` で並べるだけでした。★これでは決まりません:
 *     ★① ★`distinct` は ★**自分の接続と他人の接続を混ぜます**（★`postgres / Supavisor` が
 *        ★ワーカーなのか、★この道具自身なのか区別が付かない）。
 *     ★② ★ワーカーは間欠なので、★**映らないことがある**（★それを「無害」と読むのが `CK-14`）。
 *   ✅ ★**`rolcanlogin` は 1 回で決まります**: ★`anon` / `authenticated` が ★**ログインできない**なら、
 *     ★どのクライアントも ★**そのロールでは繋げません** → ★`0032` の
 *     ★`revoke ... from anon, authenticated` は ★**直に繋ぐワーカーに当たりようがない**。
 */
console.log('  ★ログインできるロール（★`0032` の revoke が誰に当たるか）:');
for (const r of await q(
  `select rolname, rolcanlogin from pg_roles
    where rolname in ('anon', 'authenticated', 'authenticator', 'postgres', 'service_role')
    order by 1`,
)) {
  const mark = r.rolcanlogin ? '★繋げる' : '✅ ★繋げない（NOLOGIN）';
  console.log(`     ${r.rolname}: ${mark}`);
}
console.log('  ★いま繋いでいる相手（★自分の接続は除外・★件数つき）:');
for (const r of await q(
  `select usename, application_name, backend_type, count(*)::int n,
          min(backend_start)::text since
     from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
    group by 1, 2, 3 order by 1, 2`,
)) {
  console.log(`     ${r.usename} / ${r.application_name || '(名前なし)'}`
    + ` / ${r.backend_type} … ${r.n} 本（最古 ${r.since}）`);
}

await c.end();
exitWithVerdict(verdictOf({
  checked, failed: fails.length, label: `★${FN} の稼働中の定義`,
  skipped: { '同名が複数 または 不在': rows.length === 1 ? 0 : 1 },
}));
