/**
 * ★**デイリー EP の額を変える前に、★影響を受ける口座を数える**（★読むだけ・★2026-09-27）
 *   ★裁定 `REVIEW_UI_AUDIT_20260927.md` 追記（EP の件）条件 (b)「★配った EP は回収できないので ★当てる前に数えて報告する」
 *
 * ★数えるもの:
 *   ① ★口座の数（★`users` の行 ＝ デイリーを受け取れる人）
 *   ② ★これまでにデイリーを受け取った口座の数（★`ep_ledger` の `dedupe_key like 'daily:%'`）
 *   ③ ★登録の口が閉じているか（★Supabase の設定なので ★ここでは読めない → ★出さない）
 *
 * 🔴 ★1 行も変えません（★`select` だけ）。
 * ★実行: npx tsx tools/count-daily-ep-accounts.mjs --env production
 *   ⚠️ ★`--env` は必ず明示（★`loadEnv()` の既定は本番）。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

if (!process.argv.includes('--env')) {
  console.error('🔴 ★--env を明示してください（★既定は本番です）');
  process.exit(2);
}
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const one = async (sql) => (await c.query(sql)).rows[0];
const users = await one('select count(*)::int as n from users');
const claimed = await one(`select count(distinct user_id)::int as n from ep_ledger where dedupe_key like 'daily:%'`);
const amount = await one(`select ep_grant_amount('daily')::int as daily, ep_grant_amount('daily_cap')::int as cap`);
await c.end();

console.log(`★口座の数（★デイリーを受け取れる人）: ${users.n}`);
console.log(`★これまでにデイリーを受け取った口座: ${claimed.n}`);
console.log(`★いまのデイリーの額: ${amount.daily} EP ／ ★日次上限: ${amount.cap} EP`);
