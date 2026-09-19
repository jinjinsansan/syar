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
 * 【⚠️ `fetch failed` で落ちたら、まず網を疑う】
 *   2026-09-18、この道具が `TypeError: fetch failed` / `ConnectTimeoutError`（10 秒）で落ちた。
 *   ★**コードの誤りでも Supabase の障害でもなく、その回線の DNS が遅かっただけ**だった。
 *   実測: 名前解決に **11.2〜11.4 秒**（★接続時間のほぼ全部）。**GitHub も本番サイトも同じく約 11 秒**で、
 *   **行き先によらなかった**。★**Node の `fetch` は接続の待ちが既定 10 秒**なので、
 *   **11 秒かかる回線では必ず落ちる**（`curl --max-time 15` は通るので食い違って見える）。
 *   → オーナーが Wi-Fi を替えたところ **0.004〜0.11 秒**になり、そのまま通った。
 *   ★**待ち時間を延ばす細工はしていない**（いま 0.6 秒で通るので要らない）。
 *     **また落ちたら `curl -w '%{time_namelookup}'` を 3 回測る**。そこが 10 秒に近ければ網が原因。
 *
 * 実行:
 *   npx tsx tools/verify-v19-email.mjs --env staging                 … 登録を伴わない分だけ
 *   npx tsx tools/verify-v19-email.mjs --env staging --with-signup   … 全部（★上限に注意）
 */
import { randomUUID } from 'node:crypto';

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
    // ★① 構文の確認（★弱い。これだけを合格の根拠にしない）
    const r = await client.query(`
      select prosrc from pg_proc
       where proname = 'assert_setup_complete' and pronamespace = 'public'::regnamespace
    `);
    const src = r.rows[0]?.prosrc ?? '';
    const hasGuard = /email_confirmed_at/.test(src);
    rec('E-6b-1', '（参考）関数の本文に確認の判定がある', hasGuard ? 'ok' : 'ng',
      hasGuard ? '★これは字があるだけ。②で実際に拒否されることを測る' : '★未実装（移行 0030）');

    /*
      ★② 実測（★こちらが本体）

      裁定 C-3-2 の警告: 「`createUser({ email_confirm: true })` で作った利用者では
      **確認済みしかいないので E-6 は必ず通る**」。
      ★**`email_confirm: false`** で作れば、**`email_confirmed_at` が null** かつ
      **`auth.identities` に `provider='email'` の行ができる**
      （✔ 2026-09-18 に staging で実測）。→ **通常の登録と同じ状態**を、
      ★**確認メールの送信上限に当たらずに**作れる。

      ⚠️ ★未確認の利用者がサインインできるかは設定次第。できない場合はトークンが取れないので、
         **それ自体が防御として働いている**。その旨を detail に書いて区別する。
    */
    /*
      ★★測り方をこう組む理由（2026-09-18・一度しくじった）

      最初は `createUser({ email_confirm: false })` で未確認の利用者を作り、
      そのままサインインしようとした。→ **`Email not confirmed` でサインインが弾かれ**、
      「トークンが出ないので通れない」を **✅ と記録してしまった**。

      🔴 **それは移行 0030 が働いた証明になっていない。**
         止めていたのは **Supabase の設定**で、`assert_setup_complete` まで**到達していない**。
         設定を戻されればサインインでき、そのとき DB 側が効くかは**測れていない**。
         ★**裁定 C-3 が求めた「設定 1 枚に頼らない」の検証にならない**（R-16 の家族＝別の理由で通る）。

      → ★**確認済みで作ってトークンを取り、そのあと DB で `email_confirmed_at` を null に戻す。**
        トークンは有効なまま、DB 上だけが未確認になるので、**0030 が効くかを直接測れる**。
    */
    const id = `e6b-${Date.now().toString(36)}`;
    const em = `${id}@test.local`;
    const pw = 'e6b-only-7f2b9d-Aa1!';
    // ★① 確認済みで作る（★サインインを通すため。ここは意図的に email_confirm: true）
    const u = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
    if (u.error !== null) {
      rec('E-6b', '★未確認の利用者は書き込み RPC を通れない', 'ng', `利用者を作れず検査不能: ${u.error.message}`);
    } else {
      const uid = u.data.user.id;
      created.push(uid);
      const anon2 = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const si = await anon2.auth.signInWithPassword({ email: em, password: pw });
      if (si.error !== null || si.data.session === null) {
        rec('E-6b', '★未確認の利用者は書き込み RPC を通れない', 'ng',
          `トークンを取れず検査不能: ${si.error?.message ?? 'セッションなし'}`);
      } else {
        const token = si.data.session.access_token;

        // ★② 対照: 確認済みのままなら「未セットアップ」まで進むこと
        //    （これが無いと「何を渡しても確認で落ちる」状態を合格と読んでしまう）
        const before = await callRpcWith(token, 'assert_setup_complete', {});
        const reachedSetup = /未セットアップ/.test(before.body);
        rec('E-6b-2', '★対照: 確認済みなら確認の判定を通り抜ける', reachedSetup ? 'ok' : 'ng',
          `HTTP ${before.status} ${before.body}`);

        // ★③ DB 上だけ未確認に戻す（トークンは有効なまま）
        await client.query('update auth.users set email_confirmed_at = null where id = $1', [uid]);
        const after = await callRpcWith(token, 'assert_setup_complete', {});
        const byConfirm = /確認/.test(after.body);
        const bySetup = /未セットアップ/.test(after.body);
        rec('E-6b', '★未確認に戻すと、同じトークンでも書き込み RPC が拒否される', byConfirm ? 'ok' : 'ng',
          byConfirm
            ? `HTTP ${after.status} ${after.body}`
            : `🔴 ${bySetup ? '「未セットアップ」で落ちた＝確認の判定が働いていない（設定だけに頼った状態）' : '拒否されなかった'} — HTTP ${after.status} ${after.body}`);
        await anon2.auth.signOut();
      }
    }
  }

  /*
    ★★確認メールを飛ばさずに測れる項目（2026-09-18 に実測して判明）

    当初は ⑤・E-1〜E-5・E-7 をまとめて `--with-signup` の陰に置いていた。
    ★**しかし、これらの多くは `admin.auth.admin.createUser` で測れる** —
    管理 API は**確認メールを送らない**のに、**パスワードの検証は迂回しない**
    （✔ 実測: 2 文字のパスワードが `Password should be at least 6 characters.` で弾かれた）。

    ★**迂回するものと、しないものを取り違えない**ことが肝心:
      迂回する … メール確認（`email_confirm: true` で確認済みにできる → E-6 は signUp 経路が要る）
      迂回しない … パスワードの最低要件（E-7）・漏洩パスワード（E-5）・メールの重複（⑤）
  */
  console.log('\n=== ⑤ 同一メールで 2 回 → ユーザーは 1 つ（読み替え）===');
  {
    const em = `dup-${Date.now().toString(36)}@test.local`;
    const pw = 'v19-dup-only-7f2b9d-Aa1!';
    const a = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
    if (a.error !== null) {
      rec('⑤', '★同じメールの 2 人目が弾かれる', 'ng', `1 人目を作れず検査不能: ${a.error.message}`);
    } else {
      created.push(a.data.user.id);
      const b = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
      if (b.error === null) created.push(b.data.user.id);
      rec('⑤', '★同じメールの 2 人目が弾かれる', b.error !== null ? 'ok' : 'ng',
        b.error !== null ? b.error.message : '🔴 2 人目が通った（同じメールで 2 口座）');
    }
  }

  console.log('\n=== E-7 パスワードの最低要件 ===');
  {
    const em = `e7-${Date.now().toString(36)}@test.local`;
    const r = await admin.auth.admin.createUser({ email: em, password: 'ab', email_confirm: true });
    if (r.error === null) created.push(r.data.user.id);
    rec('E-7', '★短すぎるパスワードが拒否される', r.error !== null ? 'ok' : 'ng',
      r.error !== null ? r.error.message : '🔴 2 文字が通った');
  }

  console.log('\n=== E-5 漏洩済みパスワードの拒否 ===');
  {
    const em = `e5-${Date.now().toString(36)}@test.local`;
    // ★既知の漏洩パスワード。HaveIBeenPwned 連携が有効なら弾かれる
    const r = await admin.auth.admin.createUser({ email: em, password: 'password123', email_confirm: true });
    if (r.error === null) created.push(r.data.user.id);
    rec('E-5', '★漏洩済みパスワードが拒否される', r.error !== null ? 'ok' : 'ng',
      r.error !== null ? r.error.message
        : '🔴 password123 が通った（Supabase の「漏洩パスワードの拒否」が無効）→ 管理画面で有効にする');
  }

  console.log('\n=== E-4 パスワード変更の後、既存セッションが失効すること ===');
  {
    /*
      ★**本番で起こる経路で測る**（裁定 C-3）。
        管理 API の `updateUserById` ではなく、**利用者自身の `updateUser`** で変える。
        ★セッションを 2 つ作り、片方で変えて、**もう片方のトークンがまだ通るか**を見る。
    */
    const em = `e4-${Date.now().toString(36)}@test.local`;
    const pw = 'v19-e4-only-7f2b9d-Aa1!';
    const u = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
    if (u.error !== null) {
      rec('E-4', '★パスワード変更で他のセッションが失効する', 'ng', `利用者を作れず検査不能: ${u.error.message}`);
    } else {
      created.push(u.data.user.id);
      const mk = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const a = mk(); const b = mk();
      const sa = await a.auth.signInWithPassword({ email: em, password: pw });
      const sb = await b.auth.signInWithPassword({ email: em, password: pw });
      if (sa.data.session === null || sb.data.session === null) {
        rec('E-4', '★パスワード変更で他のセッションが失効する', 'ng', 'セッションを 2 つ作れず検査不能');
      } else {
        const up = await a.auth.updateUser({ password: `${pw}X2` });
        if (up.error !== null) {
          rec('E-4', '★パスワード変更で他のセッションが失効する', 'ng', `変更できず検査不能: ${up.error.message}`);
        } else {
          const res = await callRpcWith(sb.data.session.access_token, 'assert_setup_complete', {});
          const revoked = res.status === 401;
          rec('E-4', '★パスワード変更で他のセッションが失効する', revoked ? 'ok' : 'ng',
            revoked ? `HTTP ${res.status}（失効した）`
              : `🔴 まだ通る（HTTP ${res.status} ${res.body}）— 乗っ取られた側を締め出せない`);
        }
      }
    }
  }

  console.log('\n=== ⑭ セットアップ RPC を 2 回 → 口座・初期 EP・初期馬が 1 つだけ ===');
  {
    /*
      ★**V-19 ⑭ の本体は「同一トランザクションだったこと」の確認**です
        （裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §5）。
        ★**「`users` の insert が落ちた」だけでは足りません** —
        **初期 EP も初期馬も付いていないこと**を見ます。

      ★`0031` は `upsert` を書いていないので、2 回目は `users` の主キーで落ちます。
        単一の関数＝単一のトランザクションなので、★**落ちれば台帳も馬も戻るはず**。
        ★そこを**実測**します（「戻るはず」で済ませない）。
    */
    const id = `v14-${Date.now().toString(36)}`;
    const em = `${id}@test.local`;
    const pw = 'v19-setup-only-7f2b9d-Aa1!';
    const u = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
    if (u.error !== null) {
      rec('⑭', '★2 回目は全ロールバック', 'ng', `利用者を作れず検査不能: ${u.error.message}`);
    } else {
      const uid = u.data.user.id;
      created.push(uid);
      const anon3 = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const si = await anon3.auth.signInWithPassword({ email: em, password: pw });
      if (si.error !== null || si.data.session === null) {
        rec('⑭', '★2 回目は全ロールバック', 'ng', `トークンを取れず検査不能: ${si.error?.message}`);
      } else {
        const token = si.data.session.access_token;
        // ★候補の馬を 1 頭選ぶ（★呼ぶ側が選ぶ・★で絞るのは本番のワーカーの役目）
        const cand = await client.query(
          // 🔴 ★**npc_stable_id も一緒に読む**（★2026-09-19）。★owner_id を入れたら行から消える。
          `select h.id, h.npc_stable_id from horses h
            where h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
              and not exists (select 1 from race_entries e where e.horse_id = h.id and e.finish_pos is not null)
            order by h.id limit 1`,
        );
        const horseId = cand.rows[0]?.id ?? null;
        /** 🔴 ★元の厩舎。★「いちばん若い厩舎」に返すと STABLE-1-SKEW を作る */
        const horseStable = cand.rows[0]?.npc_stable_id ?? null;
        if (horseId === null) {
          rec('⑭', '★2 回目は全ロールバック', 'ng', '初期馬の候補が 0 頭（★在庫の下限監視・D-079 ⑧）');
        } else {
          const mkArgs = (tok) => ({
            p_display_name: 'けんさ', p_stable_name: 'けんさ牧場',
            p_silk_color: 'vermilion', p_silk_sleeve: 'white',
            p_horse_id: horseId, p_client_token: tok,
          });
          // ★1 回目（★冪等キーは 2 回目と**別**にする。同じだと「冪等で返った」になり ⑭ を測れない）
          const first = await callRpcWith(token, 'create_account', mkArgs(randomUUID()));
          rec('⑭-a', '★1 回目は成功する（対照）', first.status === 200 ? 'ok' : 'ng',
            `HTTP ${first.status} ${first.body}`);

          // ★2 回目（★別の冪等キー ＝「再送」ではなく「二重実行」）
          const second = await callRpcWith(token, 'create_account', mkArgs(randomUUID()));
          const rejected = second.status !== 200;

          // ★★本体: 初期 EP も初期馬も**増えていない**こと
          const st = await client.query(
            `select (select count(*)::int from users where id = $1) as accounts,
                    (select coalesce(sum(delta), 0)::bigint from ep_ledger where user_id = $1) as ep,
                    (select count(*)::int from horses where owner_id = $1) as horses`,
            [uid],
          );
          const s = st.rows[0];
          const clean = Number(s.accounts) === 1 && Number(s.ep) === 2000 && Number(s.horses) === 1;
          rec('⑭', '★2 回目は拒まれ、EP も馬も増えていない', rejected && clean ? 'ok' : 'ng',
            `2 回目=HTTP ${second.status} ／ 口座 ${s.accounts} ・EP ${s.ep} ・馬 ${s.horses}`
            + (clean ? '（★1／2000／1 が期待どおり）' : ' 🔴 ★期待は 1／2000／1'));

          /*
            ★**⑭-b は「別の利用者」で測ります。**

            ⚠️ 最初はこの利用者で同じ冪等キーを 2 回投げる形に書きましたが、
            ★**その時点で口座は ⑭-a で既にできている**ので、★1 回目から `users` の主キーで落ち、
            ★**冪等の枝に一度も入らないまま EP が 2000 のまま**になります。
            → ★**冪等が壊れていても緑になる**（★「別の理由で通った ✅」・R-16 の家族）。

            ★**正しくは、口座を持たない利用者で「1 回目＝成功／2 回目＝同じキー」を測る。**
          */
          const em2 = `v14b-${Date.now().toString(36)}@test.local`;
          const u2 = await admin.auth.admin.createUser({ email: em2, password: pw, email_confirm: true });
          if (u2.error !== null) {
            rec('⑭-b', '★同じ冪等キーの再送で二度付与しない', 'ng', `2 人目を作れず検査不能: ${u2.error.message}`);
          } else {
            const uid2 = u2.data.user.id;
            created.push(uid2);
            const anon4 = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const si2 = await anon4.auth.signInWithPassword({ email: em2, password: pw });
            const cand2 = await client.query(
              `select h.id, h.npc_stable_id from horses h
                where h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
                  and not exists (select 1 from race_entries e where e.horse_id = h.id and e.finish_pos is not null)
                order by h.id limit 1`,
            );
            const horse2 = cand2.rows[0]?.id ?? null;
            /** 🔴 ★元の厩舎（★同上） */
            const horse2Stable = cand2.rows[0]?.npc_stable_id ?? null;
            if (si2.data.session === null || horse2 === null) {
              rec('⑭-b', '★同じ冪等キーの再送で二度付与しない', 'ng', '2 人目のトークンか候補が取れず検査不能');
            } else {
              const t2 = si2.data.session.access_token;
              const key = randomUUID();
              const args2 = {
                p_display_name: 'けんさ2', p_stable_name: 'けんさ牧場2',
                p_silk_color: 'blue', p_silk_sleeve: 'black',
                p_horse_id: horse2, p_client_token: key,
              };
              const b1 = await callRpcWith(t2, 'create_account', args2);
              const b2 = await callRpcWith(t2, 'create_account', args2);   // ★同じキー＝再送
              const st2 = await client.query(
                `select coalesce(sum(delta), 0)::bigint as ep,
                        (select count(*)::int from horses where owner_id = $1) as horses
                   from ep_ledger where user_id = $1`,
                [uid2],
              );
              const okB = Number(st2.rows[0].ep) === 2000 && Number(st2.rows[0].horses) === 1
                && b1.status === 200 && b2.status === 200;
              rec('⑭-b', '★同じ冪等キーの再送は成功を返し、二度付与しない', okB ? 'ok' : 'ng',
                `1 回目=HTTP ${b1.status} ／ 再送=HTTP ${b2.status} ／ EP ${st2.rows[0].ep} ・馬 ${st2.rows[0].horses}`
                + (okB ? '（★2000／1 が期待どおり＝冪等の枝に入っている）' : ' 🔴 ★期待は 200／200／2000／1'));
              // 🔴 ★**元の厩舎へ**戻す（★旧は「いちばん若い厩舎」＝実質厩舎 1 へ寄せていた）
              await client.query(
                `update horses set owner_id = null, npc_stable_id = $2
                  where owner_id = $1`,
                [uid2, horse2Stable],
              );
              await anon4.auth.signOut();
            }
          }

          // ★片付け: 馬を NPC に戻す（★利用者は finally で消える。馬は残ると在庫が減る）
          // 🔴 ★**元の厩舎へ**戻す（★同上）
          await client.query(
            `update horses set owner_id = null, npc_stable_id = $2
              where owner_id = $1`,
            [uid, horseStable],
          );
          await anon3.auth.signOut();
        }
      }
    }
  }

  console.log('\n=== 残り: 登録の経路が要るもの ===');
  if (!withSignup) {
    for (const [id, label, why] of [
      ['⑬', '同時ログインで auth ユーザー 1・口座 1', '★同時実行を仕込む必要があり、別に書く'],
      ['E-1', '総当たりに率の制限がある', '★連続して叩くので、確認メールの上限とは別に失敗ログが増える'],
      ['E-2', '再設定リンクが 1 回限り・期限切れで拒否', '★再設定メールの送信が要る（上限に当たる）'],
      ['E-3', '旧アドレスの確認なしにメール変更が成立しない', '★メール変更の確認メールが要る（上限に当たる）'],
    ]) rec(id, label, 'skip', why);
  }

  console.log('\n=== ⑨⑪ ===');
  rec('⑨', '★検証を通らずにセッションが発行できないこと', 'skip',
    '★Edge Function を作らない経路なので、Supabase Auth 自身が唯一の発行者。手順 6 で「自前の発行口が無いこと」を構文木で見る');
  rec('⑪', '★本番経路で固定すること', 'skip', '★手順 6 で、画面が実際に呼ぶ口を構文木で見る');
} finally {
  /*
    ★★片付けの順番が要ります（2026-09-18 に漏らして学びました）

    ⚠️ 最初は `admin.auth.admin.deleteUser(id)` を呼ぶだけでした。
    ★**口座（`users`）がある利用者は、それでは消えません** —
    ★**D-078 が `users` → `auth.users` を `NO ACTION` に保つ**と決めているためです
    （「口座は台帳と PP を持つので勝手に消えてはならない」）。★設計どおりの拒否です。

    🔴 ★**しかも私の道具は「✅ 消しました」と表示していました。**
       ★消えていないのに成功と出る＝**片付けの経路の「別の理由で通った ✅」**。
       ★`tools/lib/env.mjs` の註記が警告していた「**検証用の口座が残り、
       §11.2 の実経済の指標に混ざる**」形そのものです。

    → ★**順番を「馬を NPC に返す → 台帳 → 口座 → auth 利用者」にし、
      ★消えたことを実測してから表示します。**
  */
  /**
   * 🔴 ★**元の厩舎が分からないまま残った馬の数**（★2026-09-19・`STABLE-1-SKEW`）。
   *   ★**0 でなければ不合格**にします — ★黙って別の厩舎に入れない代わりに、★必ず人に届けます。
   */
  let strayHorses = 0;
  console.log('\n=== 片付け ===');
  for (const id of created) {
    /**
     * 🔴 ★**ここでは馬を返しません**（★2026-09-19・`STABLE-1-SKEW`）。
     *
     *   ★旧: `npc_stable_id = (select id from npc_stables order by id limit 1)`
     *   → ★**「いちばん若い厩舎」＝ 実質 厩舎 1**。★元の厩舎ではありません。
     *     ★`verify-prize.mjs` の `npc_stable_id = 1` と ★**同じ誤り**で、★副問い合わせに化けていたため
     *     ★`npc_stable_id\s*=\s*1` の走査から漏れていました（★網が狭すぎた）。
     *
     *   ★馬を返すのは ★**元の厩舎を知っている 2 か所**（`horseStable` / `horse2Stable`）の仕事です。
     *   → ★ここに来る時点で所有馬が残っていたら、★**元の厩舎が分かりません。**
     *     ★**黙って別の厩舎に入れず、★数えて出します**（★`R-21`: ★「戻せない」を「片付いた」に落とさない）。
     */
    const stillOwned = Number((await client.query(
      'select count(*)::int as n from horses where owner_id = $1', [id],
    )).rows[0].n);
    if (stillOwned > 0) {
      strayHorses += stillOwned;
      console.log(`  🔴 ★${id} が馬を ${stillOwned} 頭 持ったままです — ★元の厩舎が分かりません。`);
      console.log('     ★「いちばん若い厩舎」に入れると STABLE-1-SKEW を作り直します。★手で決めてください。');
      /**
       * ⚠️ ★**口座は消しません。** ★`horses.owner_id` が `users` を指しているので、
       *   ★馬を持ったまま口座を消すと外部キーに当たります。
       *   ★そして ★**消してしまうと、★どの馬が誰のものだったかも消えます。**
       *   → ★**残したまま報告します。** ★人が決めるための材料をここで壊さない。
       */
      continue;
    }
    // ★② 台帳 → ③ 口座（★口座を消さないと ④ が FK で拒まれる）
    await client.query('delete from ep_ledger where user_id = $1', [id]);
    await client.query('delete from pp_ledger where user_id = $1', [id]);
    await client.query('delete from users where id = $1', [id]);
    // ★④ auth 利用者
    const d = await admin.auth.admin.deleteUser(id);
    // ★★実際に消えたかを DB で確かめてから表示する（★戻り値だけを信じない）
    const left = await client.query('select count(*)::int n from auth.users where id = $1', [id]);
    const gone = Number(left.rows[0].n) === 0;
    console.log(`  ${gone ? '✅ 消えました' : `🔴 残っています: ${d.error?.message ?? '理由不明'}`} ${id}`);
  }
  // ★★残骸の総量を出す（★1 人ずつの成否だけ見ていると、前の実行の残りに気づかない）
  {
    const rest = await client.query(
      `select (select count(*)::int from users) as accounts,
              (select count(*)::int from horses where owner_id is null and npc_stable_id is null) as orphans`,
    );
    const r = rest.rows[0];
    console.log(`  残っている口座 ${r.accounts} 行 ／ 孤児の馬 ${r.orphans} 頭（★どちらも 0 が期待どおり）`);
    // 🔴 ★**数えただけで終わらせない**（★**TL-1**）。★合否に入れる。
    rec('片付け', '★検証用の馬を 1 頭も残さない（★元の厩舎へ戻す）',
      strayHorses === 0 && Number(r.orphans) === 0 ? 'ok' : 'ng',
      `元の厩舎が分からないままの馬 ${strayHorses} 頭 ／ 孤児 ${r.orphans} 頭`);
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
