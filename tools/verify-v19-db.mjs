/**
 * V-19 の DB 側の項目を、実際に叩いて確かめる（#5 / #6 / #10 / #15 ＋ D-078 の参照先）。
 *
 * 【なぜツールなのか】
 *   一意制約と RLS は**本物の Postgres でしか確かめられない**。
 *   「DDL にそう書いた」と「2行目が落ちる」は別（D-054）。ここで後者を実証する。
 *
 * 【★このツールは状態を変える】
 *   auth ユーザーを2つ作り、identity 行を入れ、最後に片付ける。
 *   `assertNotProduction` を必ず通す（R-24）。
 *
 * 実行:
 *   npx tsx tools/verify-v19-db.mjs --env staging
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const TOOL = 'verify-v19-db.mjs';
const env = loadEnv();

const PROVIDER = 'line';
const SUB_A = 'Uv19aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SUB_B = 'Uv19bbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const EMAIL_A = 'v19-a@example.com';
const EMAIL_B = 'v19-b@example.com';
const PASSWORD = 'v19-verify-only-password-9f3a1c';

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, TOOL);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const record = (id, label, ok, detail) => {
  results.push({ id, label, ok, detail });
  console.log(`  ${ok ? '✅' : '🔴'} ${id} ${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * 既存の残骸を消してから始める（前回が途中で落ちていても再現可能に）。
 *
 * ★`auth.admin.listUsers()` で探さない — staging には合成集団の利用者が多数いるため、
 *   1ページ目に入らず**取りこぼす**（実測: 2回目の実行が「既に登録済み」で落ちた）。
 *   ★「探して見つからなかった」と「存在しない」は別。SQL で直接引く。
 */
async function cleanup() {
  await client.query('delete from user_identities where subject = any($1)', [[SUB_A, SUB_B]]);
  const r = await client.query('select id from auth.users where email = any($1)', [[EMAIL_A, EMAIL_B]]);
  for (const row of r.rows) await admin.auth.admin.deleteUser(row.id);
}

/** insert を試し、成功したか / 一意制約で落ちたかを返す */
async function tryInsert(subject, userId) {
  try {
    await client.query(
      'insert into user_identities (provider, subject, user_id) values ($1, $2, $3)',
      [PROVIDER, subject, userId],
    );
    return { inserted: true, code: null };
  } catch (e) {
    return { inserted: false, code: e.code ?? null, message: e.message };
  }
}

try {
  await cleanup();

  console.log('\n=== D-078 参照先（★これが崩れると V-19 #5 が素通りする） ===');
  {
    // ★`information_schema.constraint_column_usage` は使わない。
    //   スキーマ跨ぎ（public → auth）の参照を確実には返さず、
    //   **実際には正しく張られている FK を「無し」と報告した**（2026-08-20 に実測）。
    //   検出器のほうが壊れていて、正しいものを 🔴 と出す形。権威のある pg_constraint を見る。
    const r = await client.query(`
      select pg_get_constraintdef(oid) as def
      from pg_constraint
      where conrelid = 'public.user_identities'::regclass and contype = 'f'
    `);
    const def = r.rows[0]?.def ?? '（FK が無い）';
    record('D-078', 'user_id の参照先が auth.users であること', /REFERENCES auth\.users\(id\)/.test(def), def);
    record('D-078b', 'identity 側は on delete cascade（口座側は NO ACTION のまま）', /ON DELETE CASCADE/.test(def), def);
  }

  console.log('\n=== 準備: auth ユーザーを2つ作る ===');
  const a = await admin.auth.admin.createUser({ email: EMAIL_A, password: PASSWORD, email_confirm: true });
  const b = await admin.auth.admin.createUser({ email: EMAIL_B, password: PASSWORD, email_confirm: true });
  if (a.error || b.error) throw new Error(`auth ユーザーを作れませんでした: ${a.error?.message ?? b.error?.message}`);
  const userA = a.data.user.id;
  const userB = b.data.user.id;
  console.log(`  A=${userA.slice(0, 8)}… B=${userB.slice(0, 8)}…`);

  console.log('\n=== V-19 #5 / #10 同一 sub は1ユーザーだけ ===');
  {
    const first = await tryInsert(SUB_A, userA);
    record('#5-a', '1行目は入る（対照）', first.inserted, first.inserted ? '' : first.message);

    const second = await tryInsert(SUB_A, userB);
    record('#5', '★同じ sub を別ユーザーで入れると落ちる', !second.inserted && second.code === '23505',
      second.inserted ? '★入ってしまった（2口座が成立する）' : `一意制約違反 ${second.code}`);
  }

  console.log('\n=== 1人が同一プロバイダで2つの ID を持たない ===');
  {
    const r = await tryInsert(SUB_B, userA);
    record('#10', '★同じユーザーに2つ目の line ID を足すと落ちる', !r.inserted && r.code === '23505',
      r.inserted ? '★入ってしまった（引き直しの余地が残る）' : `一意制約違反 ${r.code}`);
  }

  console.log('\n=== V-19 #6 sub が違えば別ユーザー（メールで突合していないこと） ===');
  {
    const r = await tryInsert(SUB_B, userB);
    record('#6-a', 'sub が違えば別ユーザーとして入る', r.inserted, r.inserted ? '' : r.message);

    const cols = await client.query(`
      select column_name from information_schema.columns
      where table_name = 'user_identities' order by column_name
    `);
    const names = cols.rows.map((x) => x.column_name);
    const hasEmailish = names.some((n) => /mail/i.test(n));
    record('#6', '★メールを保持する列が無い（メールで突合しようがない）', !hasEmailish, `列: ${names.join(', ')}`);
  }

  console.log('\n=== V-19 #15 anon / authenticated から読めないこと ===');
  {
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const asAnon = await anon.from('user_identities').select('*');
    record('#15-anon', '★anon から0行（または拒否）', asAnon.error !== null || (asAnon.data?.length ?? 0) === 0,
      asAnon.error ? `拒否: ${asAnon.error.message.slice(0, 40)}` : `${asAnon.data.length} 行`);

    const signedIn = await anon.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD });
    if (signedIn.error) {
      record('#15-auth', '★authenticated から0行（または拒否）', false, `ログインできず検査不能: ${signedIn.error.message}`);
    } else {
      const asAuth = await anon.from('user_identities').select('*');
      record('#15-auth', '★authenticated から0行（または拒否）',
        asAuth.error !== null || (asAuth.data?.length ?? 0) === 0,
        asAuth.error ? `拒否: ${asAuth.error.message.slice(0, 40)}` : `${asAuth.data.length} 行`);
      await anon.auth.signOut();
    }

    const pol = await client.query(`select policyname from pg_policies where tablename = 'user_identities'`);
    record('#15-pol', 'ポリシーが0件（後から足されていないこと）', pol.rows.length === 0,
      pol.rows.length === 0 ? '' : `★${pol.rows.map((p) => p.policyname).join(', ')} が追加されている`);
  }
} finally {
  console.log('\n=== 片付け ===');
  await cleanup();
  const left = await client.query('select count(*)::int as n from user_identities where subject = any($1)', [[SUB_A, SUB_B]]);
  console.log(`  残った試験用の行: ${left.rows[0].n}`);
  await client.end();
}

const ng = results.filter((r) => !r.ok);
console.log(`\n=== ${ng.length === 0 ? '全件 合格' : `🔴 ${ng.length} 件 不合格`}（${results.length} 件中） ===`);
process.exit(ng.length === 0 ? 0 : 1);
