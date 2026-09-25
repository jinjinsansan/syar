-- ---------------------------------------------------------------------------
-- 🔴 ★**EP の日次付与（デイリー）** — ★D-075 の実装
--    ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §1（条件 1〜7）・§5 (a)(b)(c)
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★なぜ要るか — ★「額は在るのに、渡す側が無かった」】
--   ★正典 **D-075** は ★2026-08-20 に額を決めていました（★登録時 2,000／★デイリー 200／★日次上限 10,000）。
--   ★しかし ★**`ep_ledger` に `'inflow'` を書くのは `create_account` の系譜 3 か所だけ**でした
--   ★（`0031:183`・`0037:219`・`0067:100`）。★**日次で渡す口は、どこにも在りませんでした。**
--   ★一方 ★調教はワーカーが毎週 EP を吸います。→ ★**すべての利用者がいずれ 0 になり、何もできなくなる**。
--   ✔ ★本番のオーナーの口座が既にそうなっていました: `inflow +2,000` / `training −2,000` / ★残高 **0**。
--   ★画面（`/earn`）は「受け取り機能を準備中です」と ★**正直に**書いてありました（★嘘はついていない）。
--   → ★**D-119 の族**（★決めた・画面は出す・★渡す側が無い）の 3 例目。
--
-- 【★この移行が作るもの】
--   ★① `ep_grant_amount(kind)` … ★**額を 1 か所に**（★裁定 §5 (a)）
--   ★② `ep_reason_class(reason)` … ★**理由ごとの分類を 1 か所に**（★裁定 §5 (b)）
--   ★③ `claim_daily_ep()` … ★**押した本人に 1 日 1 回 渡す**（★条件 1・2・6）
--   ★④ `create_account` の ★**直書き 2,000 を ① へ寄せる**（★裁定 §5 (a) の条件）
--
-- 【⚠️ ★「1 日」をここで決めない】（★**BT-6 ②⑤**・`0050_day_boundary_single_source.sql`）
--   ★`0050` は ★**「SQL に `date_trunc` も `current_date` も書かない。★ワーカーが毎周書く
--   ★`world_state.day_started_at` を読む」**と定めています。★理由は ★どちらも
--   ★**セッションの TimeZone** にしたがい、★接続ごとに別の時刻で切れるからです。
--   ★**危うく 3 つめの「1 日」を作るところでした。** ★ここは `bet_allowance` と同じく行を読みます。
--   ★行が無ければ ★**通しません**（★R-27。★黙って `current_date` に落ちない）。
--
-- 【★決め直していないこと】
--   ★額は D-075 のまま（★較正定数。★値をゲートにしない）。★繰り越しは ★**しない**（★裁定 §5 (c)）。
-- ---------------------------------------------------------------------------
begin;

-- ---------------------------------------------------------------------------
-- ① ★**額は 1 か所**（★D-075 の写し・較正定数）
-- ---------------------------------------------------------------------------
-- ⚠️ ★RPC は ★**額を引数で受け取りません**（★裁定 §5 (a)。★利用者が発行量を決められる形にしない）。
-- ⚠️ ★知らない種類が来たら ★**止めます**（★`case` の `else` を `null` で返すと静かに 0 円付与になる）。
create or replace function public.ep_grant_amount(p_kind text)
returns bigint
language plpgsql
immutable
as $$
begin
  case p_kind
    -- ★登録時 2,000 EP（★D-075。★`0031:140`・`0037:178`・`0067:63` の直書きをここへ寄せた）
    when 'signup' then return 2000;
    -- ★デイリーログイン 200 EP（★D-075 ＝ 登録料 1 回ぶん）
    when 'daily' then return 200;
    -- ★日次上限 10,000 EP（★D-075。★**1 人 1 日あたりの「発行」量の上限**。
    --   ★目的は honest play を縛ることではなく ★**バグ・エクスプロイトの被害を上限で止める**こと）
    when 'daily_cap' then return 10000;
    else raise exception 'EP の額の種類が分かりません: %（★ep_grant_amount に足してから使う）', p_kind;
  end case;
end $$;

comment on function public.ep_grant_amount(text) is
  '★D-075 の額（較正定数）を 1 か所に持つ。★apps/cli/test/ep-grant-sql.test.ts が TS の定数と突き合わせる';

-- ---------------------------------------------------------------------------
-- ② ★**理由ごとの分類を 1 か所**（★裁定 §5 (b)）
-- ---------------------------------------------------------------------------
-- 【🔴 ★なぜ「発行」を数え直すのか】
--   ★`delta > 0` を全部数えるのは ★**採りません**。★払戻や賞金が上限に当たって止まり、
--   ★**大きく当てた人が受け取れなくなる**（★上限の目的と違う）。
--   ★`inflow` だけでも ★**足りません**: ✔ `horse_sale`（`0026:126`）は ★**相手方の引き落としが無い正の delta**
--   ★＝ ★**新しい EP が出ています**（★`0026:47` の註記自身が「発行量の監視で混ぜないため別に持つ」＝
--   ★**別掲するが発行である**と書いている）。
--
-- 【🔴 ★いま現に間違っている所】
--   ★`apps/worker/src/daily-flow.ts:93-95` は ★`inflow` だけを発行として数え、★`horse_sale` は
--   ★`bet`/`refund` 以外なので ★**「負の焼却」**に落ちていました
--   ★（→ ★発行量が過小・★`margin_actual` が過大）。★この移行と同じ便で直します。
--   ★本番の `horse_sale` は今 0 件なので ★**数字の被害はまだ在りません**（★コードは間違っています）。
--
-- ⚠️ ★**表に無い語が来たら止めます。** ★黙って「発行でない」にすると、★理由を足した日に
--    ★上限と監視の両方が ★**静かに**緩みます。
create or replace function public.ep_reason_class(p_reason text)
returns text
language plpgsql
immutable
as $$
begin
  case p_reason
    -- ★**発行**（★新しい EP が世に出る。★日次上限が数え、★V-11 の純発行量にも載る）
    when 'inflow' then return 'issuance';
    when 'horse_sale' then return 'issuance';
    -- ★**返金**（★取ったものを返しているだけ。★発行でも焼却でもない）
    when 'refund' then return 'refund';
    -- ★**馬券**（★売上と払戻は `bets` から数える。★台帳で二重に数えない）
    when 'bet' then return 'ticket';
    -- ★**焼却**（★EP が世から消える）
    when 'training' then return 'burn';
    when 'entry_fee' then return 'burn';
    when 'stud_fee' then return 'burn';
    when 'horse_purchase' then return 'burn';
    when 'stable_grade' then return 'burn';
    else raise exception 'EP の理由が分類表にありません: %（★ep_reason_class に足してから使う）', p_reason;
  end case;
end $$;

comment on function public.ep_reason_class(text) is
  '★裁定 REVIEW_EP_INFLOW_AND_ENTRY_20260925.md §5 (b): ★reason ごとの発行/焼却/馬券/返金を 1 か所に。'
  '★日次上限（claim_daily_ep）と V-11 の監視（daily-flow.ts）が同じ表を読む';

-- ---------------------------------------------------------------------------
-- ③ 🔴 ★**デイリーの受け取り**（★押した本人・1 日 1 回・上限つき）
-- ---------------------------------------------------------------------------
-- ★条件 1: ★日はサーバーが書いた行から（★`world_state.day_started_at`）
-- ★条件 2: ★`dedupe_key` で 1 日 1 回（★`ep_ledger_dedupe_key_uniq`（`0013:24`）が DB 側の担保）
-- ★条件 3: ★額は ① から（★SQL に数を書かない）
-- ★条件 4: ★日次上限 10,000 を ★この経路にも効かせる（★判定は 1 か所 ＝ ②）
-- ★条件 5: ★`reason = 'inflow'` なので `point_flow_daily.ep_inflow` に載る（★V-11 の監視に入る）
-- ★条件 6: ★`auth.uid()` の本人だけ。★ワーカーが全員に配る形は取らない
--          （★眠っている口座に発行し続けると V-11 が崩れる）
create or replace function public.claim_daily_ep()
returns table (granted bigint, balance bigint, already_claimed boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid;
  v_amount bigint := ep_grant_amount('daily');
  v_cap bigint := ep_grant_amount('daily_cap');
  v_day_from timestamptz;
  v_key text;
  v_balance bigint;
  v_issued bigint;
begin
  -- ★**D-080**: ★書き込み RPC は ★**先頭でここを呼ぶ**（★未認証・未セットアップの落ち方を揃える）。
  --   ⚠️ ★自前で `auth.uid()` を見て投げる形に書いていました → ★`rpc-guard.test.ts` が捕まえました。
  v_user := assert_setup_complete();

  -- ★★BT-6 ②⑤: ★「1 日」の境目は ★ワーカーが書いた行から読む（★ここで決めない）
  select day_started_at into v_day_from from world_state where id;
  if v_day_from is null then
    raise exception '1 日の境目が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST005';
  end if;

  -- ★口座の行を ★**先に**ロックする（★同時に 2 回押されたときの競り合いを潰す）
  -- ⚠️ ★行の有無は `assert_setup_complete()` が保証しますが、★ロックは別途 要ります。
  select entry_points into v_balance from users where id = v_user for update;
  if not found then
    raise exception '口座がありません（★先に登録を済ませてください）' using errcode = 'ST026';
  end if;

  v_key := 'daily:' || v_user::text || ':' || v_day_from::text;

  -- ★**同じ日に 2 回め**（★投げない。★画面が「もう受け取っています」と言えるように返す）
  perform 1 from ep_ledger where dedupe_key = v_key;
  if found then
    return query select 0::bigint, v_balance, true;
    return;
  end if;

  -- ★**日次上限**（★② の表で「発行」だけを数える）
  select coalesce(sum(l.delta), 0) into v_issued
    from ep_ledger l
   where l.user_id = v_user
     and l.created_at >= v_day_from
     and ep_reason_class(l.reason) = 'issuance';
  if v_issued + v_amount > v_cap then
    raise exception '今日 受け取れる上限（% EP）に達しています', v_cap using errcode = 'ST027';
  end if;

  update users set entry_points = entry_points + v_amount where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key)
  values (v_user, v_amount, v_balance + v_amount, 'inflow', v_key);

  return query select v_amount, v_balance + v_amount, false;
end $$;

revoke all on function public.claim_daily_ep() from public, anon;
grant execute on function public.claim_daily_ep() to authenticated;

comment on function public.claim_daily_ep() is
  '★D-075 のデイリーログイン（200 EP）。★1 日 1 回・押した本人だけ・繰り越さない。'
  '★「1 日」は world_state.day_started_at（BT-6）';

-- ---------------------------------------------------------------------------
-- ④ ★`create_account` の ★**直書き 2,000 を ① へ寄せる**（★裁定 §5 (a) の条件）
-- ---------------------------------------------------------------------------
-- ⚠️ ★**中身は `0067` と同一で、変えたのは `v_grant` の 1 行だけ**です。
--    ★最新の定義（`0067`）から写しました（★`0031`/`0037` から写すと `onboarding_flow` が落ちる ＝
--    ★裁定 §5 (a) が言う「★§1 の R-1 と同じ罠」）。
create or replace function create_account(
  p_display_name text,
  p_stable_name text,
  p_silk_color text,
  p_silk_sleeve text,
  p_horse_id uuid default null,
  p_client_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_confirmed timestamptz;
  v_is_email boolean;
  v_key text;
  v_existing bigint;
  v_horse uuid;
  v_grant bigint := ep_grant_amount('signup');   -- ★D-075: 登録時 2,000 EP（★① へ寄せた）
begin
  if v_user is null then
    raise exception '未認証';
  end if;
  if p_client_token is null then
    raise exception '冪等キー（client_token）が必要';
  end if;

  select exists (
    select 1 from auth.identities where user_id = v_user and provider = 'email'
  ) into v_is_email;
  if v_is_email then
    select email_confirmed_at into v_confirmed from auth.users where id = v_user;
    if v_confirmed is null then
      raise exception 'メールの確認が済んでいません（届いたメールのリンクを開いてください）';
    end if;
  end if;

  v_key := 'setup:' || p_client_token::text;
  select id into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_user;
  end if;

  if p_display_name is null or length(btrim(p_display_name)) = 0 then
    raise exception '表示名が必要';
  end if;
  if p_stable_name is null or length(btrim(p_stable_name)) = 0 then
    raise exception '牧場名が必要';
  end if;

  -- ★口座（★`onboarding_flow` を明示して書く・裁定 §1 条件 1）
  insert into users (id, display_name, stable_name, silk_color, silk_sleeve, entry_points, onboarding_flow)
  values (v_user, btrim(p_display_name), btrim(p_stable_name), p_silk_color, p_silk_sleeve, v_grant, 'first_horse_v1');

  insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key)
  values (v_user, v_grant, v_grant, 'inflow', v_key);

  v_horse := p_horse_id;
  if v_horse is null then
    v_horse := pick_initial_horse();
    if v_horse is null then
      raise exception '初期馬の候補がいません（NPC の現役・未出走の馬が尽きています）';
    end if;
  end if;
  if not is_initial_horse_candidate(v_horse) then
    raise exception 'この馬は初期馬の候補ではありません（既に持ち主がいる／引退／出走済みの可能性）';
  end if;
  update horses set owner_id = v_user, npc_stable_id = null where id = v_horse;

  return v_user;
end $$;

revoke all on function create_account(text,text,text,text,uuid,uuid) from public, anon;
grant execute on function create_account(text,text,text,text,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ⑤ ★**読む口**: ★今日 受け取れるか（★押す前に画面が言えるように）
-- ---------------------------------------------------------------------------
-- ⚠️ ★これは ★**表示のため**です。★付与の可否は ③ が ★自分で数え直します
--    （★読んだ値を信じて渡す形にしない ＝ ★憲法 3「クライアント計算を信用しない」と同じ考え）。
create or replace function public.my_daily_ep_state()
returns table (amount bigint, claimable boolean, already_claimed boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_amount bigint := ep_grant_amount('daily');
  v_cap bigint := ep_grant_amount('daily_cap');
  v_day_from timestamptz;
  v_issued bigint;
  v_done boolean;
begin
  if v_user is null then
    raise exception '未認証' using errcode = 'ST001';
  end if;
  select day_started_at into v_day_from from world_state where id;
  if v_day_from is null then
    raise exception '1 日の境目が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST005';
  end if;

  select exists (
    select 1 from ep_ledger
     where dedupe_key = 'daily:' || v_user::text || ':' || v_day_from::text
  ) into v_done;

  select coalesce(sum(l.delta), 0) into v_issued
    from ep_ledger l
   where l.user_id = v_user
     and l.created_at >= v_day_from
     and ep_reason_class(l.reason) = 'issuance';

  return query select v_amount, (not v_done) and (v_issued + v_amount <= v_cap), v_done;
end $$;

revoke all on function public.my_daily_ep_state() from public, anon;
grant execute on function public.my_daily_ep_state() to authenticated;

commit;
