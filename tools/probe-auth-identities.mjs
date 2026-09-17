/**
 * ★メール＋パスワードで登録したとき `auth.identities` に行ができるかを確かめる
 *   （裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` §2・開発側の順 2）
 *
 * 【何を確かめるか】
 *   D-113 ③ は「メール経路は `user_identities` に行を作らない」と決めた。
 *   すると「この口座はどの経路で入ったか」を読む先が要る。
 *   レビュー側の見立ては **Supabase が `auth.identities` に `provider='email'` の行を自ら作る**。
 *   ★これが本当かを、**実際に登録して**確かめる。無ければ報告する（行を作る案には戻らない）。
 *
 * 【★通常の登録で作ること（裁定 C-3・R-16）】
 *   `verify-v19-db.mjs:90-91` は `admin.auth.admin.createUser({ …, email_confirm: true })` で作っている。
 *   ★管理 API は**確認済みの利用者しか作らない**ので、この作り方では
 *   「メール確認前に書き込みが通らないこと（E-6）」が**必ず通ってしまう**。
 *   → ここでは **anon キーで `signUp()` を呼ぶ**（本番で起こる経路）。
 *   ★併せて `email_confirmed_at` が null かどうかも読む（E-6 の前提の確認）。
 *
 * 【★このツールは状態を変える】
 *   利用者を 1 人作り、**最後に必ず消す**。`assertNotProduction` を通す（R-24）。
 *   ★前提が揃わないときは**何も作らずに**終わる（`env.mjs` の `requireRow` と同じ思想）。
 *
 * 実行:
 *   npx tsx tools/probe-auth-identities.mjs --env staging
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const TOOL = 'probe-auth-identities.mjs';
const env = loadEnv();

/**
 * ★メールの綴り。既定は `test.local`（★`--email` で変えられる）
 *
 *   最初 `example.com` にしたところ、**Supabase に "Email address … is invalid" で弾かれた**
 *   （2026-09-18・staging）。★「予約ドメインだから安全」という私の判断が裏目に出た。
 *   ★**弾かれた理由は「新規登録が止まっている」ではない**（この道具の最初の版はそう推測を表示していた。誤り）。
 *   → ★**staging で実際に通っている綴りを実測して決めた**: `test.local`（7 件）・`star.local`（2 件）。
 *     `example.com` は `verify-v19-db.mjs` だけが使っているが、**あれは管理 API なので
 *     signUp の検証を通っていない** — ★**「通っている道具の綴り」を真似ても駄目な例**。
 */
const emailArg = (() => {
  const i = process.argv.indexOf('--email');
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
})();
const EMAIL = emailArg ?? `probe-identities-${Date.now().toString(36)}@test.local`;
const PASSWORD = 'probe-identities-only-7f2b9d';

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('★SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY が要ります');
  process.exit(2);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, TOOL);

// ★登録は anon キーで行う（本番で起こる経路・裁定 C-3）
const asAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
// ★読み取りと後片付けだけ service_role
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = null;

try {
  console.log('\n=== 1. 通常の登録（anon キーで signUp）===');
  const up = await asAnon.auth.signUp({ email: EMAIL, password: PASSWORD });
  if (up.error !== null) {
    console.error(`🔴 登録できませんでした: ${up.error.message}`);
    // ★ここに推測を書かない。2026-09-18、「新規登録が止めてある設定かもしれません」と出していたところ、
    //   ★実際は 2 回とも**メールのドメインが弾かれていた**だけで、**推測が 2 回とも誤った方向に誘導した**。
    //   道具は事実（返ってきた言葉）だけを出し、原因の当ては人に任せる。
    console.error('  ★上の文言のとおりに読むこと。原因をここで推測しない');
    process.exit(1);
  }
  userId = up.data.user?.id ?? null;
  if (userId === null) {
    console.error('🔴 user.id が返りませんでした（確認メール待ちの応答かもしれません）');
    process.exit(1);
  }
  console.log(`  ✅ 作成: ${userId}`);

  console.log('\n=== 2. auth.users の確認の状態（E-6 の前提）===');
  const u = await client.query(
    `select email_confirmed_at, raw_app_meta_data->>'provider' as provider,
            raw_app_meta_data->'providers' as providers
       from auth.users where id = $1`,
    [userId],
  );
  const row = u.rows[0];
  console.log(`  email_confirmed_at = ${row?.email_confirmed_at ?? 'null'}`);
  console.log(`  ★null なら「通常の登録では未確認の利用者ができる」＝ E-6 を本物の経路で測れる`);
  console.log(`  raw_app_meta_data.provider  = ${row?.provider ?? '(なし)'}`);
  console.log(`  raw_app_meta_data.providers = ${JSON.stringify(row?.providers ?? null)}`);

  console.log('\n=== 3. ★auth.identities に行ができたか（裁定 §2 の△）===');
  const ids = await client.query(
    `select provider, provider_id, created_at from auth.identities where user_id = $1 order by provider`,
    [userId],
  );
  if (ids.rows.length === 0) {
    console.log('  🔴 行がありません。→ ★レビュー側へ報告（行を作る案には戻らない・別の読み方を検討）');
  } else {
    for (const r of ids.rows) {
      console.log(`  ✅ provider='${r.provider}'  provider_id=${r.provider_id === userId ? '（user.id と同じ）' : '（user.id とは別）'}`);
    }
    console.log('  → ★経路は user_identities を使わずに auth.identities から読める');
  }

  console.log('\n=== 4. user_identities には行が無いこと（D-113 ③）===');
  const ui = await client.query('select count(*)::int as n from user_identities where user_id = $1', [userId]);
  console.log(`  user_identities の行数 = ${ui.rows[0].n}（★0 が期待どおり）`);
} finally {
  console.log('\n=== 後片付け ===');
  if (userId !== null) {
    const del = await admin.auth.admin.deleteUser(userId);
    console.log(del.error === null ? `  ✅ 消しました: ${userId}` : `  🔴 消せませんでした: ${del.error.message}（★手で消してください: ${userId}）`);
  } else {
    console.log('  （作っていないので何もしません）');
  }
  await client.end();
}
