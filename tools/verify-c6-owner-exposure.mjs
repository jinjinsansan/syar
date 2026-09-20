/**
 * ★**C-6: `genotype` / `potential` が、★本人にも露出しない**（★正典 §17.2・§12.4・§5.5）
 *
 * 【★`verify-anon-exposure` との違い】
 *   ★あちらは ★**anon（ログインしていない人）**に見えないかを測ります。
 *   ★こちらは ★**`authenticated`（ログインした持ち主本人）**に見えないかです。
 *   🔴 ★**§12.4 は「本人にも数値を見せない」**と定めています（★★素質は星でしか見せない・D-114）。
 *     → ★**「自分の馬だから見てよい」ではありません。**
 *
 * 【🔴 ★読むだけ】★`information_schema` と `select` だけ。★1 行も変えません。
 *
 * 実行: npx tsx tools/verify-c6-owner-exposure.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

/** 🔴 ★本人にも見せてはいけない列（★§12.4 / §5.5 / D-114） */
const SECRET = ['genotype', 'potential', 'stats', 'unlock_rate', 'birth_snapshot'];

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const fails = [];
const ok = (m, d) => console.log(`  ✓ ${m}${d ? `  ${d}` : ''}`);
const ng = (m, d) => { console.log(`  🔴 ${m}${d ? `  ${d}` : ''}`); fails.push(m); };

console.log('# C-6 ★持ち主本人にも、素質の生値が出ていないか（★読むだけ）');
console.log('');

// ── ① 表そのものへの列権限 ────────────────────────────
console.log('【①】★`horses` の列に、★`authenticated` の select が付いていないか');
for (const col of SECRET) {
  const r = await c.query(
    `select has_column_privilege('authenticated', 'public.horses', $1, 'SELECT') as can`, [col],
  );
  if (r.rows[0].can) ng(`① ★authenticated が horses.${col} を読める`);
  else ok(`① ★authenticated は horses.${col} を読めない`);
}

// ── ② 持ち主向けのビューが、★生値を持っていないか ──────────
console.log('');
console.log('【②】★持ち主向けのビューの列（★`my_horses` など）');
const views = await c.query(
  `select table_name from information_schema.views where table_schema = 'public'`,
);
for (const v of views.rows.map((x) => x.table_name)) {
  const cols = (await c.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`, [v],
  )).rows.map((x) => x.column_name);
  const leak = cols.filter((x) => SECRET.includes(x));
  if (leak.length > 0) ng(`② ★ビュー ${v} が生値の列を持っている`, leak.join(', '));
}
ok('② ★生値の列を持つビューは無い', `${views.rows.length} 個を調べた`);

// ── ③ ★星（評価）を返す経路が在るか（★塞ぎすぎていないか） ──
console.log('');
console.log('【③】★**対照** — ★星で見せる経路が在るか（★塞ぎすぎていないこと）');
const starish = views.rows.map((x) => x.table_name).filter((v) => /my_horses|entry|horse/.test(v));
if (starish.length === 0) ng('③ ★持ち主が自分の馬を見る経路が 1 つも無い（★塞ぎすぎ）');
else ok('③ ★持ち主向けのビューが在る', starish.join(' / '));

await c.end();
console.log('');
console.log(`=== ★C-6 判定: ${fails.length === 0 ? '✅ 合格' : `🔴 不合格 ${fails.length} 件`} ===`);
console.log('⚠️ ★これは ★**この環境の姿**です。★本番は移行が遅れているので、★別に測ること。');
process.exit(fails.length === 0 ? 0 : 1);
