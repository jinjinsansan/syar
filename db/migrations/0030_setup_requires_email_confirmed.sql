-- 0030: メール経路の利用者は、メール確認が済むまで書き込み RPC を通さない
--       （★V-19 の **E-6b**・D-113 ④・裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` C-3）
--
-- 【なぜ要るか】
--   D-113 ④ は「メール確認を必須にし、確認前は書き込み RPC を通さない」と決めた。
--   Supabase の設定 `mailer_autoconfirm = false` でも確認は必須になるが、
--   ★**設定 1 枚に頼ると、設定を戻された瞬間に、どのゲートも鳴らずに素通りする**。
--   裁定 C-3: 「★設定で切り替わる防御は、設定を読むか **DB で重ねる**」。
--   → ここが DB 側の重ね。**設定と DB の 2 枚で止める。**
--
-- 【★なぜ確認が要るのか（占拠）】
--   確認が無いと、**他人のメールアドレスで登録できる**。
--   その人が後から正規に登録しようとしても「既に登録済み」で入れない。
--   ★口座は PP（景品価値）を持つので、これは現実の損害になりうる。
--
-- 【★メール経路だけに課す（OIDC 経路を巻き込まない）】
--   裁定 C-3-1 が明示している。LINE（D-076）や Apple の利用者は
--   ★**メールを持たない／未検証のメールしか持たないことがある**（D-078 の註記・V-19 #6）。
--   そこに `email_confirmed_at` を要求すると、**OIDC 経路の利用者が誰も入れなくなる**。
--   → 経路の判定は **`auth.identities` の `provider`** で行う。
--      ★`provider = 'email'` の行は Supabase が通常の登録で自ら作る
--      （✔ 2026-09-18 に staging で実測。`provider_id` は `user.id` と同じ値になる）。
--   ⚠️ ★**`user_identities`（自前の器）では判定しない** — D-113 ③ により
--      **メール経路はそこに行を作らない**ので、見ても 0 行で、判定が常に「メール経路でない」に倒れる。
--
-- 【★この関数は `security definer`・所有者は postgres】
--   ✔ 2026-09-18 実測: `pg_get_userbyid(proowner) = postgres`・`prosecdef = true`・
--     `has_table_privilege('postgres','auth.identities','select') = true`。
--   ★`authenticated` からは `auth.identities` を読めない（実測 false）が、
--     **definer 関数の中からは読める**。だからこの判定が成立する。
--
-- 【★判定の順番（`users` 行より前に置く）】
--   D-080 は「未セットアップは `/setup` へ誘導」と決めた。
--   ★**未確認の利用者は `/setup` にも行かせない** — セットアップは口座と初期 EP と初期馬を作る
--   （D-074/D-075）ので、**確認前に通すと、他人のメールで作った口座に資産が乗る**。
--   → 確認の判定を **`users` 行の判定より前**に置く。
--
-- 【★引数も戻り値も変えない】
--   `assert_setup_complete()` は移行 8 本（0020〜0027）と検査 3 本から呼ばれている。
--   ★**`create or replace` で中身だけ差し替える**ので、呼び出し側は一切変えない。
--   `create or replace function` は既存の権限を保つが、**冪等にするため grant/revoke も再掲**する。
--
-- 【★検査】
--   `tools/verify-v19-email.mjs` の **E-6b**。
--   ⚠️ ★**「関数の本文に `email_confirmed_at` という字がある」だけでは弱い**（R-16）。
--      **未確認の利用者を実際に作って、書き込み RPC が拒否されること**を測る。
--      ★裁定 C-3-2 の警告どおり、`createUser({ email_confirm: true })` で作ると必ず通ってしまう。

begin;

create or replace function assert_setup_complete()
returns uuid
language plpgsql
security definer
-- definer 関数で search_path を固定するのは必須（0002 の注記）
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証';
  end if;

  -- ★E-6b: メール経路の利用者に限り、確認が済むまで通さない（0030・D-113 ④）
  --   ★経路の判定は auth.identities（Supabase が通常の登録で自ら作る行）。
  --     user_identities では判定しない（D-113 ③ によりメール経路は行を作らない）。
  if exists (
    select 1 from auth.identities
     where user_id = v_user and provider = 'email'
  ) and not exists (
    select 1 from auth.users
     where id = v_user and email_confirmed_at is not null
  ) then
    raise exception 'メールの確認が済んでいません（届いたメールのリンクを開いてください）';
  end if;

  -- ★口座があるかどうかだけを見る。残高は見ない（残高0は「口座が無い」ではない）
  if not exists (select 1 from users where id = v_user) then
    raise exception '未セットアップ（/setup で牧場を作ってください）';
  end if;
  return v_user;
end $$;

comment on function assert_setup_complete() is
  'D-080: 未セットアップ状態の判定。すべての書き込み RPC の先頭で呼ぶ。'
  '★呼んでいない RPC は apps/cli/test/rpc-guard.test.ts が検出する（除外は明示登録簿のみ）'
  '★0030: メール経路（auth.identities.provider = email）の利用者は、'
  'email_confirmed_at が null の間は弾く（V-19 E-6b・D-113 ④・設定 1 枚に頼らない）';

-- ★anon には実行させない。未認証は上で弾くが、権限としても閉じる（0018 と同じ既定）
--   ★`create or replace` は権限を保つが、冪等にするため再掲する
revoke all on function assert_setup_complete() from public, anon;
grant execute on function assert_setup_complete() to authenticated;

commit;
