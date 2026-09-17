/**
 * ★`signUp`（通常の登録）が通るメールのドメインを 1 つ見つける（staging のみ）
 *
 * 【なぜ要るか】
 *   裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` §2 の問い
 *   「★メール＋パスワードの登録で `auth.identities` に行ができるか」は、
 *   **通常の登録を 1 回通さないと答えが出ない**。
 *   ★`read-auth-identities.mjs` で staging の既存 6 人を読んだが、**全員 identity 行を持たず、
 *   `provider` も null・全員が確認=未・全員 2026-08-11** — **管理 API で作られた疑いが濃く、
 *   「0 行だから Supabase は作らない」とは言えない**（交絡が潰せていない）。
 *
 * 【★2 回外した経緯を残す】
 *   1 回目 `example.com` … "Email address … is invalid"。「予約ドメインだから安全」は的外れだった
 *   2 回目 `test.local`  … 同じ。**staging の `auth.users` に 6 件あるのを「通った実績」と読んだのが誤り**で、
 *                          **あれは管理 API で作られており signUp の検証を通っていない**。
 *                          ★**「実在する」と「その経路で通った」は別**（交絡を潰さずに証拠と呼んだ）。
 *
 * 【★このツールは状態を変える】
 *   通ったドメインでは利用者が 1 人できる。**その場で消す**。`assertNotProduction` を通す（R-24）。
 *   ★1 つ通ったら**そこで止める**（staging に要らない行を増やさない）。
 *
 * 実行:
 *   npx tsx tools/probe-signup-domain.mjs --env staging
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const TOOL = 'probe-signup-domain.mjs';
const env = loadEnv();

/** ★弾かれ方の違いを見たいので、性質の違うものを並べる */
const DOMAINS = [
  'test.local',      // 予約 TLD（1 回目に弾かれた）
  'example.com',     // 予約ドメイン（2 回目に弾かれた）
  'example.org',     // 同上・別 TLD
  'star-probe.dev',  // 実在しうる TLD・未登録のドメイン
  'mailinator.com',  // 使い捨てメール（★弾かれるなら「使い捨て拒否」の設定が入っている印）
  'gmail.com',       // ★最も普通。これも弾かれるなら登録そのものが止まっている
];

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, TOOL);

const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tag = Date.now().toString(36);
let passed = null;

try {
  for (const d of DOMAINS) {
    const email = `probe-${tag}@${d}`;
    const r = await anon.auth.signUp({ email, password: 'probe-only-7f2b9d-Aa1!' });

    if (r.error !== null) {
      // ★道具は返ってきた言葉をそのまま出す。原因をここで推測しない（2026-09-18 の反省）
      console.log(`  🔴 @${d.padEnd(16)} ${r.error.message}`);
      continue;
    }

    const id = r.data.user?.id ?? null;
    console.log(`  ✅ @${d.padEnd(16)} 通った  user=${id === null ? '(id なし＝確認メール待ちの応答)' : id}`);
    passed = d;

    if (id !== null) {
      // ★通った利用者で、そのまま裁定 §2 の問いに答えておく（もう 1 回作り直さずに済む）
      const ids = await client.query(
        `select provider, provider_id = $1::text as provider_id_is_user_id
           from auth.identities where user_id = $1`,
        [id],
      );
      console.log(`     ★auth.identities: ${ids.rows.length} 行`);
      for (const x of ids.rows) {
        console.log(`       provider='${x.provider}'  provider_id は user.id と${x.provider_id_is_user_id ? '同じ' : '別'}`);
      }
      const u = await client.query('select email_confirmed_at is null as unconfirmed from auth.users where id = $1', [id]);
      console.log(`     ★確認=${u.rows[0]?.unconfirmed ? '未（E-6 を本物の経路で測れる）' : '済'}`);

      const del = await admin.auth.admin.deleteUser(id);
      console.log(`     ${del.error === null ? '→ 消しました' : `→ 🔴 消せず: ${del.error.message}（手で消してください: ${id}）`}`);
    }
    break; // ★1 つ通れば十分
  }

  // ★ここに推測を書かない（2026-09-18・3 度目の反省）。
  //   初版は「登録そのものが止まっている可能性」と締めくくったが、**実際は
  //   `email rate limit exceeded`＝確認メールの送信回数の上限**で、ドメインとは無関係だった。
  //   ★**全部同じ文言で落ちたときは、ドメインの違いを見ていない**（＝この道具が何も測れていない）。
  console.log(passed === null
    ? '\n★どのドメインでも通りませんでした。★上の文言をそのまま読むこと。' +
      '\n  ⚠️ 全部が同じ文言なら、この道具はドメインの違いを測れていない（別の原因で先に落ちている）'
    : `\n★通ったドメイン: ${passed}`);
} finally {
  await client.end();
}
