/**
 * ★既存の利用者から「経路の印」が読めるかを**読み取りだけ**で確かめる
 *   （裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` §2・開発側の順 2）
 *
 * 【なぜ読むだけで済むかもしれないか】
 *   裁定の問いは「★メール＋パスワードの登録で `auth.identities` に `provider='email'` の行ができるか」。
 *   ★**既に登録された利用者が 1 人でも identity 行を持っていれば、それが答えになる。**
 *   新しく作らずに済むなら、そのほうが速く、staging を汚さない。
 *
 * 【★ただし作り方で結果が変わる】
 *   staging の既存の利用者は `admin.auth.admin.createUser()`（管理 API）で作られた疑いが濃い。
 *   ★**管理 API で作った利用者に identity 行が付くかどうかは、signUp の場合と違いうる。**
 *   → **どちらの作り方か分かる手掛かり**（`raw_app_meta_data` の中身・作成時刻）も併せて出す。
 *
 * 【★このツールは状態を変えない】
 *   SELECT だけ。R-24 の READONLY。
 *
 * 実行:
 *   npx tsx tools/read-auth-identities.mjs --env staging
 */
import pg from 'pg';

import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  console.log('\n=== 1. auth.users（★メールの綴りは伏せてドメインだけ出す）===');
  const users = await c.query(
    `select id,
            split_part(email,'@',2)              as domain,
            email_confirmed_at is not null       as confirmed,
            raw_app_meta_data->>'provider'       as meta_provider,
            raw_app_meta_data->'providers'       as meta_providers,
            created_at
       from auth.users
      order by created_at`,
  );
  console.log(`  ${users.rows.length} 人`);
  for (const u of users.rows) {
    console.log(
      `  @${(u.domain ?? '(なし)').padEnd(14)} 確認=${u.confirmed ? '済' : '未'}` +
        `  provider=${(u.meta_provider ?? '(なし)').padEnd(8)}` +
        `  providers=${JSON.stringify(u.meta_providers ?? null).padEnd(12)}` +
        `  ${u.created_at?.toISOString?.().slice(0, 16) ?? u.created_at}`,
    );
  }

  console.log('\n=== 2. ★auth.identities に行があるか（裁定 §2 の問い）===');
  const ids = await c.query(
    `select i.provider, count(*)::int as n
       from auth.identities i
      group by i.provider
      order by n desc`,
  );
  if (ids.rows.length === 0) {
    console.log('  🔴 auth.identities は 0 行です');
  } else {
    for (const r of ids.rows) console.log(`  provider='${r.provider}'  ${r.n} 行`);
  }

  console.log('\n=== 3. ★identity を持たない利用者はいるか ===');
  const orphan = await c.query(
    `select count(*)::int as n
       from auth.users u
      where not exists (select 1 from auth.identities i where i.user_id = u.id)`,
  );
  console.log(`  identity 行が無い利用者: ${orphan.rows[0].n} 人`);

  console.log('\n=== 4. ★provider_id は user.id と同じか（D-113 ③ の根拠）===');
  const same = await c.query(
    `select i.provider,
            sum(case when i.provider_id = u.id::text then 1 else 0 end)::int as 同じ,
            sum(case when i.provider_id <> u.id::text then 1 else 0 end)::int as 別,
            count(*)::int as 計
       from auth.identities i join auth.users u on u.id = i.user_id
      group by i.provider`,
  );
  for (const r of same.rows) {
    console.log(`  provider='${r.provider}'  user.id と同じ=${r.同じ}  別=${r.別}  計=${r.計}`);
  }
  console.log('  ★「同じ」なら、user_identities に写しても主キーが何も担保しない（D-113 ③ の裏づけ）');

  console.log('\n=== 5. user_identities（自前の器）===');
  const ui = await c.query('select provider, count(*)::int as n from user_identities group by provider');
  console.log(ui.rows.length === 0 ? '  0 行（★メール経路は行を作らない・D-113 ③ のとおり）' : JSON.stringify(ui.rows));
} finally {
  await c.end();
}
