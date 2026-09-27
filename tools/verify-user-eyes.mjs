/**
 * ★**利用者の目で、公開ビューを 1 本ずつ読む**（★2026-09-27・裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md` §3・§4）
 *
 * 【🔴 ★なぜ要るか】
 *   ★09-26 の本番確認は ★「関数が在る」「列が在る」を ★**service role で**見ました。★**利用者が読めるか**は見ていませんでした。
 *   ★その結果 ★`my_horses` が ★本番で「permission denied for table race_entries」でした（★`0086` の関数が definer でない）。
 *   → ★★**権限は、通る道のいちばん狭い所で決まる。** ★だから ★利用者のロールで ★実際に `select` します。
 *
 * 【★やること（★読むだけ・★1 行も変えない）】
 *   ★1 本ごとに ★`begin` → ★`set local role anon|authenticated` → ★`select count(*)` → ★**必ず `rollback`**。
 *   ★`authenticated` は ★`auth.uid()` が要るので ★`request.jwt.claims` に ★**馬を持つ実在の利用者の ID**を入れます
 *   （★架空の ID だと ★自分の行が 0 本で ★関数が 1 度も呼ばれず、★**壊れていても通ります**）。
 *
 * 【⚠️ ★0 行は「通った」ではありません】
 *   ★ビューの中の関数は ★行ごとに呼ばれます。★0 行なら ★関数は呼ばれていません。
 *   → ★そのビューが呼ぶ関数を ★同じ役で直に呼びます（★呼ばないビューは「対象外」）。★「判定不能」は作りません（★裁定 §5）。
 *
 * ★実行: npx tsx tools/verify-user-eyes.mjs --env staging
 *   ⚠️ ★`--env` は必ず明示（★`loadEnv()` の既定は本番）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { emptyViewVerdict } from './lib/user-eyes.mjs';

if (!process.argv.includes('--env')) {
  console.error('🔴 ★--env を明示してください（★既定は本番です）');
  process.exit(2);
}
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
console.log(`# ★利用者の目で読む（★接続先: ${new URL(env.DATABASE_URL).hostname.split('.')[0].slice(0, 6)}…・★読むだけ）\n`);

/** ★利用者に `select` を与えたビュー（★DB の実物から・★書き写さない） */
const viewsOf = async (role) => (await c.query(
  `select table_name from information_schema.views
    where table_schema = 'public' and has_table_privilege($1, format('public.%I', table_name), 'SELECT')
    order by table_name`, [role],
)).rows.map((r) => r.table_name);

/** ★馬を持つ利用者を 1 人（★`authenticated` の `auth.uid()` に入れる） */
const owner = (await c.query(
  `select h.owner_id from horses h
    where h.owner_id is not null and exists (select 1 from race_entries e where e.horse_id = h.id and e.finish_pos is not null)
    limit 1`,
)).rows[0]?.owner_id ?? (await c.query('select owner_id from horses where owner_id is not null limit 1')).rows[0]?.owner_id;

const results = [];

/** ★役を切り替えて 1 つ問い合わせる（★1 本ごとに `begin` → `set local role` → ★必ず `rollback`） */
async function asRole(role, sql) {
  await c.query('begin');
  try {
    if (role === 'authenticated') {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
    }
    await c.query(`set local role ${role}`);
    const r = await c.query(sql);
    return { ok: true, rows: r.rowCount ?? r.rows.length };
  } catch (e) {
    return { ok: false, error: String(e.message ?? e) };
  } finally {
    await c.query('rollback');
  }
}

/**
 * 🔴 ★`count(*)` にしないこと（★2026-09-27 に 1 度 踏んだ）。
 *   ★PostgreSQL は ★使われない列を計算しないので、★`count(*)` だと ★列の中の関数（`horse_wins(h.id)` 等）が ★**1 度も呼ばれず**、
 *   ★壊れていても ★「読めた」と出ます。★**全部の列を実際に取り出します**（★画面と同じ `select *`）。
 */
const readView = (role, view) => asRole(role, `select * from public.${c.escapeIdentifier(view)} limit 200`);

/** ★`public` の関数（★名前・引数の型・揮発性）。★ビューの定義に名前が出るものを拾うため */
const publicFns = (await c.query(
  `select p.proname as name, p.oid::regprocedure::text as sig, p.provolatile as vol,
          coalesce(array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t), '{}') as args
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'`,
)).rows;

/** ★0 行のビュー（★判定は部品 `lib/user-eyes.mjs` の `emptyViewVerdict`・★網が同じ部品を 落ちる形と通る形で走らせる・裁定 §5-1） */
async function checkEmptyView(role, view) {
  const viewDef = (await c.query('select pg_get_viewdef($1::regclass, true) as d', [`public.${view}`])).rows[0].d;
  return emptyViewVerdict({ viewDef, publicFns, callAs: (sql) => asRole(role, sql), quote: (n) => c.escapeIdentifier(n) });
}

for (const role of ['anon', 'authenticated']) {
  if (role === 'authenticated' && owner === undefined) {
    /** ★架空の ID では ★自分の行が 0 本で ★関数が呼ばれない → ★確かめられない ＝ ★不合格（★3 つ目の状態にしない） */
    console.log('【authenticated】🔴 ★馬を持つ利用者が居ないので ★確かめられません（★不合格として扱います）\n');
    results.push({ role, view: '*', verdict: 'fail' });
    continue;
  }
  console.log(`【${role}】${role === 'authenticated' ? '（★馬を持つ利用者 1 人の目で）' : ''}`);
  for (const view of await viewsOf(role)) {
    const r = await readView(role, view);
    let verdict;
    let note;
    if (!r.ok) { verdict = 'fail'; note = r.error; }
    else if (r.rows > 0) { verdict = 'ok'; note = `${r.rows} 行`; }
    else ({ verdict, note } = await checkEmptyView(role, view));
    results.push({ role, view, verdict });
    const mark = verdict === 'ok' ? '✓' : verdict === 'na' ? '－' : '🔴';
    console.log(`  ${mark} ${view.padEnd(34)} ${note}`);
  }
  console.log('');
}
await c.end();

const fails = results.filter((r) => r.verdict === 'fail');
const na = results.filter((r) => r.verdict === 'na');
console.log(`★読めない（確かめられないを含む）: ${fails.length} 本 ／ ★対象外（0 行・関数を呼ばない）: ${na.length} 本`);
if (fails.length > 0) {
  console.log('🔴 ★利用者の目で読めないビューがあります。★配備は未完了です（★裁定 §4）');
  process.exit(1);
}
console.log('✅ ★すべて読めました（★対象外は 関数を呼ばない 0 行のビューだけ）');
