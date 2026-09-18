-- 0031: 初回セットアップ（口座の作成＋初期 EP＋初期馬）を 1 トランザクションで
--       ★D-074 ／ D-075 ／ D-079 ／ V-19 ⑭
--       ★裁定 `REVIEW_SETUP_PREDICATE_VERDICT_20260918.md`（Q-SETUP-05 → **(a) 採用・条件 4 つ**）
--
-- 【なぜ今まで無かったか】
--   正典は**この RPC の存在を前提に書かれていました**（D-078「`users` 行はセットアップ RPC の中で
--   作られる」・V-19 ⑭「セットアップ RPC を 2 回 → …」）が、**実装がありませんでした**。
--   2026-08-20 の照会 `QUESTIONS_SETUP_RPC_20260820.md` が「★**RPC 自体が書けませんでした**」と
--   報告し、裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §7 が「これで書けます」と答えたまま
--   1 か月、着手されていませんでした。
--
-- 【★裁定 Q-SETUP-05 の条件 1: 既にある書き方をそのまま使う（新しい書き方を発明しない）】
--   ① 候補の絞り込み … `owner_id is null and npc_stable_id is not null and retired_at_week is null`
--      ★`apps/worker/src/market-flow.ts` と**同一**（馬の購入が既に使っている形）
--   ② 戦績 0     … `not exists (select 1 from race_entries where horse_id = … and finish_pos is not null)`
--      ★`apps/worker/src/story-flow.ts:71` に**同じ形の先例**があります。
--      ⚠️ ★**行の有無で判定してはいけません** — 行は**登録時に**作られ（`0024:174`）、
--         取消でも**残ります**（`0028` の `scratched_at`）。
--         `finish_pos` が書かれるのは**確定時の 1 か所だけ**（`apps/worker/src/pg-store.ts:459`）。
--   ③ 所有権の移し方 … `update horses set owner_id = …, npc_stable_id = null`（`0025`・`0026` と同形。
--      ★`horses_owner_xor_npc` 制約を**同じ 1 回の update** で満たす）
--   ④ 冪等       … `ep_ledger.dedupe_key`（`0025`・`0026` と同形）
--   ⑤ 台帳の語   … `reason = 'inflow'`（★**既にある語**。`0027` の最新の制約に含まれ、
--      `tools/synthetic-bettor.mjs:110` が無償の流入に使っています。★新しい語を作りません）
--
-- 【★裁定の条件 2: この定義は暫定です】
--   ★**「新馬戦の出走資格の述語」は存在しません**（2026-09-18 実測。裁定 §1 でレビュー側が
--   08-20 裁定 §3-① を**撤回**しました）。`conditionsOf` は本体 1 行目で `void raceClass;` と
--   **クラスを捨てており**、番組表は**クラスで出走馬を絞っていません**。
--   → ★**ここの「戦績 0」は、この RPC の中だけの暫定の定義です。**
--     ★**クラス分けを実装する便で、共通の述語に置き換えてください。**
--     そのとき **V-4・V-5・V-6・V-18 を取り直します**（1 日 42 本・全 144 本の 29% が動くため）。
--
-- 【★`assert_setup_complete()` を呼びません（D-080 の対象外）】
--   あれは `users` 行の存在を要求しますが（`0019`）、★**この RPC はその行を作る側**です。
--   `0030` 以降は `email_confirmed_at is not null` も要求するので、呼べば**必ず自分で落ちます**。
--   ★**裁定 §3-2 のとおり、「対象外」と言うだけでは走査型検査が落ちます。**
--     `apps/cli/test/rpc-guard.test.ts` の**第三の登録簿**に明示登録し、
--     代わりに次の 3 つを**検査で固定**しています:
--       ① `auth.uid()` が null なら弾く
--       ② ★`email_confirmed_at is not null` を**この RPC 自身の中でも**確認する
--          （★D-113 ④・「設定 1 枚に頼らない」・`0030` と同じ趣旨）
--       ③ `dedupe_key` で冪等
--   ⚠️ ★**簿に載せるだけで中身を要求しないと、「例外にした」が「無検査にした」になります**（R-16）。
--
-- 【★V-19 ⑭: 2 回目は全ロールバック】
--   **upsert を書きません。** `users.id` は主キーなので、素の `insert` の 2 回目は落ちます。
--   ★**「`users` の insert が落ちた」だけでは不十分**で、**初期 EP も初期馬も付いていないこと**が
--   この項目の本体です（裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §5）。
--   → **単一の関数＝単一のトランザクション**なので、途中で落ちれば全部戻ります。
--
-- 【★馬は呼ぶ側が選びます（★を SQL で再計算しない）】
--   ★は TypeScript の `starsOfPotential`（`packages/sim-engine/src/stars.ts`）が唯一の出どころで、
--   ★`apps/worker/src/market-flow.ts:115` は**ワーカーで計算した数値を書いています**。
--   → ★**同じ形にします。** この RPC は `p_horse_id` を受け取り、
--     ★**その馬が候補の条件を満たすかだけを検証**します（★帯の判定は呼ぶ側）。
--   ⚠️ ★SQL の中で★を計算すると、**★の出どころが 2 つになります**
--     （裁定 `REVIEW_SETUP_RPC_VERDICT_20260820.md` §2-① が禁じた形・D-052・L-2 の再発）。

begin;

-- ── ① 勝負服の配色（★D-074 が入力項目として明記しているのに器が無かった）──
--
--   ★`0009` が `account_type` を足したのと同じ形（`add column if not exists` ＋ 制約のガード）。
--   ★配色は `apps/web/src/lib/setup.ts` の `SILK_COLORS`（アートバイブル §4 の高彩度 16 色）から選ぶ。
--   ⚠️ ★**自由入力にしない** — 芝・ダートと同化する中間色を除いた一覧から選ぶ設計（D-057
--      「個体識別は勝負服の配色」）。値の一覧は**画面側が唯一の出どころ**なので、
--      ここでは**空でないこと**だけを制約にする（★二重管理にしない・D-052）。
alter table users add column if not exists silk_color text;
alter table users add column if not exists silk_sleeve text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_silk_sleeve_allowed') then
    -- ★袖は 3 択（同じ色／白／黒）。`setup.ts` の `SLEEVES` と対応する
    alter table users add constraint users_silk_sleeve_allowed
      check (silk_sleeve is null or silk_sleeve in ('same', 'white', 'black'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_silk_color_not_empty') then
    alter table users add constraint users_silk_color_not_empty
      check (silk_color is null or length(silk_color) > 0);
  end if;
end $$;

-- ── ② 初期馬の候補かどうか（★暫定の定義・条件 2 の註記は上記）──
--
--   ★`security definer` にしません。読み取りだけなので、呼ぶ側の権限で足ります。
--   ★**呼ぶ側**（ワーカー）が候補を列挙して★で絞り、この関数は RPC 内の検証にも使います。
create or replace function is_initial_horse_candidate(p_horse_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from horses h
     where h.id = p_horse_id
       -- ★NPC 世界から取る（D-074・専用の生成経路を作らない）
       and h.owner_id is null
       and h.npc_stable_id is not null
       and h.retired_at_week is null
       -- ★戦績 0（＝デビュー前）。★行の有無ではなく finish_pos で見る
       and not exists (
         select 1 from race_entries e
          where e.horse_id = h.id and e.finish_pos is not null
       )
  );
$$;

comment on function is_initial_horse_candidate(uuid) is
  '★初期馬の候補か（D-074/D-079・裁定 REVIEW_SETUP_PREDICATE_VERDICT_20260918 条件 1）。'
  '★この「戦績 0」は暫定の定義。新馬戦の出走資格の述語は存在しないため'
  '（08-20 裁定 §3-① は 2026-09-18 に撤回）、クラス分けの便で共通の述語に置き換え、'
  'V-4・V-5・V-6・V-18 を取り直すこと';

revoke all on function is_initial_horse_candidate(uuid) from public, anon;
grant execute on function is_initial_horse_candidate(uuid) to authenticated;

-- ── ③ セットアップ RPC（★口座・初期 EP・初期馬を 1 トランザクションで）──
create or replace function create_account(
  p_display_name text,
  p_stable_name text,
  p_silk_color text,
  p_silk_sleeve text,
  -- ★呼ぶ側（ワーカー）が★で選んだ馬。★SQL で★を再計算しない（上記の註記）
  p_horse_id uuid,
  p_client_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_confirmed timestamptz;
  v_is_email boolean;
  v_key text;
  v_existing bigint;
  v_grant bigint := 2000;   -- ★D-075: 登録時 2,000 EP（較正定数・値をゲートにしない）
begin
  -- ★① 未認証を弾く（★`assert_setup_complete()` は呼べない。口座を作る側なので順序が逆）
  if v_user is null then
    raise exception '未認証';
  end if;
  if p_client_token is null then
    raise exception '冪等キー（client_token）が必要';
  end if;

  -- ★② メール確認を、この RPC 自身の中でも確認する（★D-113 ④・裁定 §3-2 の条件 2）
  --    ★設定 1 枚（`mailer_autoconfirm`）に頼らない。★`0030` と同じ趣旨。
  --    ★メール経路の利用者に限る（OIDC 経路を巻き込まない・裁定 C-3-1）
  select exists (
    select 1 from auth.identities where user_id = v_user and provider = 'email'
  ) into v_is_email;
  if v_is_email then
    select email_confirmed_at into v_confirmed from auth.users where id = v_user;
    if v_confirmed is null then
      raise exception 'メールの確認が済んでいません（届いたメールのリンクを開いてください）';
    end if;
  end if;

  -- ★③ 冪等（★再送で二重に付与しない。`0025`・`0026` と同じ作法）
  v_key := 'setup:' || p_client_token::text;
  select id into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_user;   -- ★既に済んでいる。何もしない
  end if;

  if p_display_name is null or length(btrim(p_display_name)) = 0 then
    raise exception '表示名が必要';
  end if;
  if p_stable_name is null or length(btrim(p_stable_name)) = 0 then
    raise exception '牧場名が必要';
  end if;

  -- ★④ 口座（★upsert を書かない。2 回目はここで落ち、全部ロールバックする・V-19 ⑭）
  insert into users (id, display_name, stable_name, silk_color, silk_sleeve, entry_points)
  values (v_user, btrim(p_display_name), btrim(p_stable_name), p_silk_color, p_silk_sleeve, v_grant);

  -- ★⑤ 初期 EP を台帳にも記帳する（★サーバー権威・憲法 §0.2-4。残高だけ動かさない）
  insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key)
  values (v_user, v_grant, v_grant, 'inflow', v_key);

  -- ★⑥ 初期馬（★候補の条件を満たすことをここでも確かめる。呼ぶ側の申告を信用しない・憲法 3）
  if p_horse_id is null then
    raise exception '初期馬が指定されていません';
  end if;
  if not is_initial_horse_candidate(p_horse_id) then
    raise exception 'この馬は初期馬の候補ではありません（既に持ち主がいる／引退／出走済みの可能性）';
  end if;
  -- ★NPC から 1 頭抜くことは明示的に許可されている（D-079 ⑨）。
  --   失われるのは「NPC として自動で走る枠」だけで、出走頭数・ベット対象・血統プールへの寄与は残る
  update horses set owner_id = v_user, npc_stable_id = null where id = p_horse_id;

  return v_user;
end $$;

comment on function create_account(text,text,text,text,uuid,uuid) is
  '★初回セットアップ（D-074/D-075/D-079・V-19 ⑭）。口座・初期 EP 2,000・初期馬を 1 トランザクションで。'
  '★assert_setup_complete() は呼ばない（口座を作る側で順序が逆・D-080 の対象外）。'
  '代わりに ①auth.uid() の null 弾き ②email_confirmed_at の確認 ③dedupe_key の冪等 を自前で持ち、'
  'apps/cli/test/rpc-guard.test.ts の第三の登録簿がそれを検査する'
  '（裁定 REVIEW_SETUP_PREDICATE_VERDICT_20260918 §3-2）';

revoke all on function create_account(text,text,text,text,uuid,uuid) from public, anon;
grant execute on function create_account(text,text,text,text,uuid,uuid) to authenticated;

commit;
