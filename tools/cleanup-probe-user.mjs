/**
 * ★調査で意図せず作った利用者を 1 人消す（staging のみ）
 *
 * 【なぜ要るか】
 *   2026-09-18、`429` の中身を見るつもりで `/auth/v1/signup` を叩いたところ、
 *   ★**上限が明けていて `HTTP 200` が返り、利用者が 1 人できてしまった**。
 *   応答本文を `-o /dev/null` で捨てていたので **id も手元に残らなかった**。
 *   → ★**「確かめるだけ」のつもりの呼び出しが、状態を変えた**。後片付けをここで行う。
 *
 * 【★消す対象を絞る】
 *   `--email` で綴りを名指しするか、`--created-after` で時刻を切る。
 *   ★**既存の利用者（2026-08-11 の 6 人）には触らない**。
 *   消す前に必ず一覧を出し、`--yes` が無ければ**何も消さずに終わる**。
 *
 * 【★このツールは状態を変える】
 *   `assertNotProduction` を通す（R-24）。
 *
 * 実行:
 *   npx tsx tools/cleanup-probe-user.mjs --env staging --email <綴り>          … 下見
 *   npx tsx tools/cleanup-probe-user.mjs --env staging --email <綴り> --yes    … 実行
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const TOOL = 'cleanup-probe-user.mjs';
const env = loadEnv();

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const email = argOf('--email');
const createdAfter = argOf('--created-after');
const doIt = process.argv.includes('--yes');

if (email === null && createdAfter === null) {
  console.error('★--email <綴り> か --created-after <ISO 時刻> のどちらかを指定してください');
  console.error('  ★対象を絞らずに消す口は作りません（既存の利用者を巻き込まないため）');
  process.exit(2);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, TOOL);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const where = email !== null ? 'email = $1' : 'created_at > $1::timestamptz';
  const param = email !== null ? email : createdAfter;

  const rows = await client.query(
    `select id, email, created_at,
            raw_app_meta_data->>'provider' as provider,
            (select count(*)::int from auth.identities i where i.user_id = u.id) as identities
       from auth.users u where ${where} order by created_at`,
    [param],
  );

  console.log(`\n=== 対象: ${rows.rows.length} 人 ===`);
  for (const r of rows.rows) {
    console.log(`  ${r.id}  @${String(r.email).split('@')[1]}  provider=${r.provider ?? '(なし)'}  identities=${r.identities}  ${r.created_at?.toISOString?.().slice(0, 16)}`);
  }

  if (rows.rows.length === 0) {
    console.log('  （該当なし。何もしません）');
  } else if (!doIt) {
    console.log('\n★下見だけです。実際に消すには --yes を付けてください');
  } else {
    console.log('\n=== 消します ===');
    for (const r of rows.rows) {
      const del = await admin.auth.admin.deleteUser(r.id);
      console.log(`  ${del.error === null ? '✅ 消しました' : `🔴 消せず: ${del.error.message}`}  ${r.id}`);
    }
  }
} finally {
  await client.end();
}
