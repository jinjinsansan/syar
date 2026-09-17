/**
 * ★V-19 を「メール＋パスワード経路」の形で測る（D-113・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918）
 *
 * 【★なぜ別の道具にするか】
 *   `verify-v19-db.mjs` は **LINE 経路の DB 側（#5/#6/#10/#15）**を測るもので、
 *   `provider = 'line'` を前提に `user_identities` へ直に insert する。
 *   ★**メール経路は `user_identities` に行を作らない**（D-113 ③）ので、同じ道具では測れない。
 *   ★V-19 は「**経路ごとに課す**。片方の合格は他方の保証にならない」（正典 §13.2）。
 *
 * 【★正典の新しい V-19（2026-09-18・経路別）に対応させる】
 *   対象外 4: ②`aud` ④`state` ⑦`nonce` ⑧`iss`（リダイレクトも ID トークンの自前検証も無い）
 *   読み替え 5: ①③⑯（→ Supabase のセッショントークンで書き込み RPC が拒否されること）
 *              ⑤（同一メールで 2 回登録 → 1 ユーザー）⑩（メールの一意制約が DB 側）
 *   分割 1: ⑥-email（メールの一致を根拠に口座を結合しない）
 *   そのまま 5: ⑨⑪⑫⑬⑭
 *   追加 8: E-1〜E-8
 *
 * 【★合格の出し方（裁定 §3-4）】
 *   ★**「有効な項目数／対象外の数」を必ず並べる。**「16 項目合格」とだけ出す形を作らない（R-16）。
 *   ★**対象外は理由とともに明記する。**
 *
 * 【★このツールは状態を変える】
 *   利用者を作って消す。`assertNotProduction` を通す（R-24）。
 *   ⚠️ ★**確認メールの送信に上限がある**（2026-09-18 に 8 回で HTTP 429）。
 *      ★**登録を伴う項目は `--with-signup` を付けたときだけ**動かす。既定では飛ばす。
 *
 * 実行:
 *   npx tsx tools/verify-v19-email.mjs --env staging                 … 登録を伴わない分だけ
 *   npx tsx tools/verify-v19-email.mjs --env staging --with-signup   … 全部（★上限に注意）
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';

const TOOL = 'verify-v19-email.mjs';
const env = loadEnv();
const withSignup = process.argv.includes('--with-signup');

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await assertNotProduction(client, TOOL);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** ★結果は「合格／不合格／対象外／未実施」の 4 つに分ける（合格の表示に数を並べるため） */
const results = [];
const rec = (id, label, state, detail) => {
  results.push({ id, label, state, detail });
  const mark = { ok: '✅', ng: '🔴', na: '—', skip: '⏭' }[state];
  console.log(`  ${mark} ${id.padEnd(9)} ${label}${detail ? ` — ${detail}` : ''}`);
};

/** ★対象外は理由とともに残す（黙って飛ばすとゲートが静かに緩む・R-16） */
const OUT_OF_SCOPE = [
  ['②aud', '`aud` 相違 → 拒否', 'ID トークンを自前で検証しないため、この経路には存在しない'],
  ['④state', '`state` 不一致 → 拒否', 'リダイレクトが無いため（CSRF の対象となる往復が無い）'],
  ['⑦nonce', '`nonce` 不一致 → 拒否', '同上（リプレイの対象となる ID トークンが無い）'],
  ['⑧iss', '`iss` 相違 → 拒否', '同上'],
];

/** ★書き込み RPC を、渡したトークンで叩く。★拒否されることを測るので、引数は正しい形にする */
async function callRpcWith(token, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: (await res.text()).slice(0, 120) };
}

/** JWT の一部を書き換える（★署名は直さないので、検証が働けば必ず落ちる） */
function tamper(token, how) {
  const [h, p, s] = token.split('.');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const de = (x) => JSON.parse(Buffer.from(x, 'base64url').toString('utf8'));
  if (how === 'sig') return `${h}.${p}.${s.slice(0, -4)}AAAA`;
  if (how === 'exp') return `${h}.${b64({ ...de(p), exp: 1 })}.${s}`;
  if (how === 'alg') return `${b64({ ...de(h), alg: 'none' })}.${p}.`;
  throw new Error(`未知の改竄: ${how}`);
}

const created = [];
try {
  console.log('\n=== ★対象外（理由とともに明記する・裁定 §3-1）===');
  for (const [id, label, why] of OUT_OF_SCOPE) rec(id, label, 'na', why);

  console.log('\n=== ⑩ メールの一意制約が DB 側にあること（読み替え）===');
  {
    const r = await client.query(`
      select indexdef from pg_indexes
       where schemaname = 'auth' and tablename = 'users'
         and indexdef ilike '%unique%' and indexdef ilike '%email%'
    `);
    rec('⑩', '★auth.users のメールに一意の索引がある', r.rows.length > 0 ? 'ok' : 'ng',
      r.rows.length > 0 ? `${r.rows.length} 件` : '★アプリ側の確認だけでは同時アクセスで二重に通る');
  }

  console.log('\n=== ⑫ 検出器が自分自身を検出していないこと（R-14）===');
  {
    // ★**正しいトークンなら通る**ことを 1 回だけ見る。これが無いと、
    //   「何を渡しても拒否される」状態（＝検査が何も測っていない）を合格と読んでしまう。
    const id = `v19e-${Date.now().toString(36)}`;
    const u = await admin.auth.admin.createUser({
      email: `${id}@test.local`, password: 'v19-email-only-7f2b9d-Aa1!', email_confirm: true,
    });
    if (u.error !== null) {
      rec('⑫', '★対照（正しいトークンなら RPC に届く）', 'ng', `利用者を作れず検査不能: ${u.error.message}`);
    } else {
      created.push(u.data.user.id);
      const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const si = await anon.auth.signInWithPassword({
        email: `${id}@test.local`, password: 'v19-email-only-7f2b9d-Aa1!',
      });
      if (si.error !== null || si.data.session === null) {
        rec('⑫', '★対照（正しいトークンなら RPC に届く）', 'ng', `ログインできず検査不能: ${si.error?.message}`);
      } else {
        const token = si.data.session.access_token;
        const good = await callRpcWith(token, 'assert_setup_complete', {});
        // ★未セットアップなので「未セットアップ」で落ちるのが正しい姿。
        //   ★「未認証」で落ちたらトークンが届いていない＝検査が成立していない。
        const reachedAuth = !/未認証/.test(good.body);
        rec('⑫', '★対照（正しいトークンは「未認証」にならない）', reachedAuth ? 'ok' : 'ng',
          `HTTP ${good.status} ${good.body}`);

        console.log('\n=== ①③⑯ 壊したトークンで書き込み RPC が拒否されること（読み替え）===');
        console.log('  ★この経路で唯一の JWT を、誰も検査しない形にしない（裁定 §3-1）');
        for (const [id2, how, label] of [
          ['①', 'sig', '★署名を書き換えたトークン → 拒否'],
          ['③', 'exp', '★期限を過去にしたトークン → 拒否'],
          ['⑯', 'alg', '★alg を none にしたトークン → 拒否'],
        ]) {
          const bad = await callRpcWith(tamper(token, how), 'assert_setup_complete', {});
          // ★401 か、本文に「未認証」が出れば拒否されている
          const rejected = bad.status === 401 || /未認証/.test(bad.body);
          rec(id2, label, rejected ? 'ok' : 'ng', `HTTP ${bad.status} ${bad.body}`);
        }
      }
      await anon.auth.signOut();
    }
  }

  console.log('\n=== ⑥-email メールの一致を根拠に口座を結合しないこと ===');
  {
    const g = (await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_ANON_KEY } })).ok
      ? await (await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_ANON_KEY } })).json()
      : null;
    const hasStd = Boolean(g?.external?.google || g?.external?.apple);
    rec('⑥-email', 'Supabase の標準プロバイダをまだ足していない', hasStd ? 'ng' : 'ok',
      hasStd ? '★足す便の冒頭で、検証済みメールによる自動結合の扱いを確かめること' : '（併設時に効く項目）');
  }

  console.log('\n=== E 系: 設定から判定できるもの（裁定 C-3）===');
  {
    const s = await (await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_ANON_KEY } })).json();
    rec('E-8', '★一般の登録口が閉じている（招待制・D-113 ⑦）', s.disable_signup === true ? 'ok' : 'ng',
      `disable_signup=${s.disable_signup}`);
    rec('E-6a', '★メール確認が必須（自動確認でない・D-113 ④）', s.mailer_autoconfirm === false ? 'ok' : 'ng',
      `mailer_autoconfirm=${s.mailer_autoconfirm}`);
  }

  console.log('\n=== E-6b: DB 側にも重なっているか（裁定 C-3・設定 1 枚に頼らない）===');
  {
    const r = await client.query(`
      select prosrc from pg_proc
       where proname = 'assert_setup_complete' and pronamespace = 'public'::regnamespace
    `);
    const src = r.rows[0]?.prosrc ?? '';
    const guards = /email_confirmed_at/.test(src);
    rec('E-6b', '★セットアップ RPC が未確認の利用者を拒否する', guards ? 'ok' : 'ng',
      guards ? '' : '★未実装（手順 6 で入れる）。設定だけに頼ると、設定を戻された瞬間に素通りする');
  }

  console.log('\n=== ⑤⑬⑭ E-1〜E-5・E-7: 登録を伴うもの ===');
  if (!withSignup) {
    for (const [id, label] of [
      ['⑤', '同一メールで 2 回登録 → ユーザーは 1 つ'],
      ['⑬', '同時ログインで auth ユーザー 1・口座 1'],
      ['⑭', 'セットアップ RPC を 2 回 → 口座・初期 EP・初期馬が 1 つだけ'],
      ['E-1', '総当たりに率の制限がある'],
      ['E-2', '再設定リンクが 1 回限り・期限切れで拒否'],
      ['E-3', '旧アドレスの確認なしにメール変更が成立しない'],
      ['E-4', 'パスワード変更の後に既存セッションが失効'],
      ['E-5', '漏洩済みパスワードの拒否'],
      ['E-7', '最低要件を満たさないパスワードの拒否'],
    ]) rec(id, label, 'skip', '★--with-signup で実施（確認メールの送信上限に当たるため既定では飛ばす）');
  } else {
    rec('未実装', '登録を伴う項目', 'skip', '★手順 6 の実装と同じ便で書く（測り方は道具の註記に記載）');
  }

  console.log('\n=== ⑨⑪ ===');
  rec('⑨', '★検証を通らずにセッションが発行できないこと', 'skip',
    '★Edge Function を作らない経路なので、Supabase Auth 自身が唯一の発行者。手順 6 で「自前の発行口が無いこと」を構文木で見る');
  rec('⑪', '★本番経路で固定すること', 'skip', '★手順 6 で、画面が実際に呼ぶ口を構文木で見る');
} finally {
  console.log('\n=== 片付け ===');
  for (const id of created) {
    const d = await admin.auth.admin.deleteUser(id);
    console.log(`  ${d.error === null ? '✅ 消しました' : `🔴 消せず: ${d.error.message}`} ${id}`);
  }
  await client.end();
}

const ok = results.filter((r) => r.state === 'ok').length;
const ng = results.filter((r) => r.state === 'ng').length;
const na = results.filter((r) => r.state === 'na').length;
const skip = results.filter((r) => r.state === 'skip').length;

// ★裁定 §3-4: 「有効な項目数／対象外の数」を必ず並べる。数だけの「合格」を作らない
console.log(`\n=== メール＋パスワード経路の V-19 ===`);
console.log(`  有効な項目: ${ok + ng} 件（合格 ${ok} ／ 🔴 不合格 ${ng}）`);
console.log(`  対象外    : ${na} 件（理由は上に明記）`);
console.log(`  未実施    : ${skip} 件（★これを「合格」に数えない）`);
console.log(ng === 0 && skip === 0
  ? '  ★この経路は全項目 合格'
  : `  🔴 この経路はまだ通っていない（不合格 ${ng}・未実施 ${skip}）`);
process.exit(ng === 0 ? 0 : 1);
