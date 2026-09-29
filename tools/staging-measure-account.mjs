// @ts-check
/**
 * ★**staging の 測定用の口座**を 用意して ★ログインした姿のセッションを出す（★2026-09-29・レビュー側）
 *
 * 【★なぜ】 ★390px の実測（⑨・沈み・明度）は ★すべて未ログインの姿だった（簿 LAYOUT-AUDIT-LOGGED-OUT-ONLY）。
 *   ★ログインの内側（/stable 系・/train・/mypage の中身・馬の詳細・投票の中身）を ★一度も測っていない。
 *
 * 【★口座】 ★measure-390@star-staging.test（★表示名「測定用」・牧場名「測定用牧場」）。★staging だけ・★本番には作らない。
 *   ★作ったのは 開発側 Claude（★2026-09-29・ログインした姿の実測のため）。★記録は 簿 LAYOUT-AUDIT-LOGGED-OUT-ONLY。
 *   ★在れば使い回す（★毎回 パスワードを付け直し ★どこにも保存しない）。★無ければ作り、★はじめの設定（create_account）まで通す（★初回の 1 頭が付く）。
 *
 * 【★出すもの】 ★セッション（★--out のファイルへ・★リポジトリの外に置くこと）。★画面の道具は これを localStorage に入れて ログインした姿で開く。
 *
 *   npx tsx tools/staging-measure-account.mjs --env staging --out <scratchpad>/measure-session.json
 */
import pg from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const EMAIL = 'measure-390@star-staging.test';
const arg = (/** @type {string} */ k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1] ?? null; };
const OUT = arg('out');
if (!OUT) { console.error('★--out <ファイル>（★リポジトリの外）'); process.exit(2); }

const env = loadEnv();
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
await assertNotProduction(db, 'staging-measure-account.mjs');

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(18).toString('base64url');
const found = (await db.query('select id from auth.users where email = $1', [EMAIL])).rows[0];
let uid;
if (found === undefined) {
  const r = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true });
  if (r.error) throw new Error(`★口座を作れない: ${r.error.message}`);
  uid = r.data.user.id;
  console.log(`★測定用の口座を作った: ${uid.slice(0, 8)}`);
} else {
  uid = found.id;
  const r = await admin.auth.admin.updateUserById(uid, { password });
  if (r.error) throw new Error(`★パスワードを付け直せない: ${r.error.message}`);
  console.log(`★測定用の口座を使い回す: ${uid.slice(0, 8)}`);
}

const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signed = await anon.auth.signInWithPassword({ email: EMAIL, password });
if (signed.error || !signed.data.session) throw new Error(`★ログインできない: ${signed.error?.message}`);

const hasRow = (await db.query('select 1 from users where id = $1', [uid])).rows.length > 0;
if (!hasRow) {
  const r = await anon.rpc('create_account', {
    p_display_name: '測定用', p_stable_name: '測定用牧場', p_silk_color: 'blue', p_silk_sleeve: 'white', p_client_token: randomUUID(),
  });
  if (r.error) throw new Error(`★はじめの設定を通せない: ${r.error.message}`);
  console.log('★はじめの設定（create_account）を通した');
}
const st = (await db.query(`select u.entry_points, (select count(*)::int from horses h where h.owner_id = u.id and h.retired_at_week is null) as horses from users u where u.id = $1`, [uid])).rows[0];
console.log(`★口座: EP ${st.entry_points}・現役の持ち馬 ${st.horses} 頭`);
writeFileSync(OUT, JSON.stringify({ projectRef: new URL(env.SUPABASE_URL).host.split('.')[0], session: signed.data.session }));
console.log(`★セッションを書いた: ${OUT}（★リポジトリの外）`);
await db.end();
