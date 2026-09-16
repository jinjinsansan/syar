-- 0025: 馬の購入（参加ポイントで NPC の馬を迎える・D-102）
--
-- ============================================================================
-- 【この移行がすること（3 つ・1 トランザクション）】
--   ① 出品 `horse_market_listing`（★★と価格は**サーバーが書く**）
--   ② `ep_ledger.reason` に **`horse_purchase`** を足す（★いまの CHECK は閉じているため）
--   ③ 購入の RPC `buy_horse`
--
-- 【★なぜ価格を SQL で計算しないか】（★D-052・二重帳簿にしない）
--   ★価格は **★表示**から決まります（`priceOfStars`）。★その★は `potential` の平均から
--   ★`@star/sim-engine` の `starsOf` が出します。★同じ式を SQL にも書くと、
--   ★**画面と DB で★が食い違う日**が来ます（★`v18` の ②b を 2 通りに実装した前科・台帳 B-5）。
--   → ★**サーバー（ワーカー）が出品の行に★と価格を書き**、★RPC は**その行の値で**払わせます。
--   ⚠️ ★**利用者が価格を申告する形にしません**（★憲法 3・サーバー権威）。
--
-- 【★D-102 の条件をどう満たすか】
--   ① ★**EP で買う。PP では買わせない** … ★`ep_ledger` にだけ記帳し、`pp_ledger` に触れません
--   ② ★**売る馬は NPC 世界から** … ★`owner_id is null and npc_stable_id is not null` の馬だけ
--   ③ ★**振り直しが成立しない** … ★出品は**★が同じ帯**でサーバーが作ります（★この移行は「その行しか買えない」ことを担保）
--   ④ **配合より割高** … ★価格は較正定数（`horse-market.ts`）。★この移行は値を持ちません
--   ⑤ **在庫の下限監視** … ★出品を作る側（ワーカー）の仕事。★この移行は `active` の旗だけ持ちます
--   ⑥ **素質は★で見せ、数値を出さない** … ★出品に `potential` を持たせません（★★と価格だけ）
--
-- 【★所有上限（D-104）】★現役 30 頭を超えて買えません（★RPC の中で数えます）。
-- ============================================================================
begin;

-- ── ① 出品（★サーバーが書く。利用者は読むだけ）──────────────────
create table if not exists horse_market_listing (
  id bigserial primary key,
  horse_id uuid not null references horses (id),
  -- ★見せるのは★だけ（★素質の数値は持たない・§5.5・D-102 ⑥）
  stars numeric(2,1) not null,
  -- ★価格 [EP]（★サーバーが `priceOfStars` で出した値）
  price_ep int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint horse_market_listing_stars_range check (stars >= 1 and stars <= 5),
  constraint horse_market_listing_price_positive check (price_ep > 0)
);

-- ★同じ馬を二重に出品しない（★active なものは 1 行だけ）
create unique index if not exists horse_market_listing_active_horse_idx
  on horse_market_listing (horse_id) where active;

comment on table horse_market_listing is
  '★馬の購入の出品（D-102）。★と価格はサーバー（ワーカー）が書く。利用者は読むだけで、価格を申告できない（憲法 3）。素質の数値は持たない（§5.5）。';

alter table horse_market_listing enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'horse_market_listing' and policyname = 'horse_market_listing_read') then
    create policy horse_market_listing_read on horse_market_listing for select using (active);
  end if;
end $$;
revoke insert, update, delete, truncate on horse_market_listing from anon, authenticated;
grant select on horse_market_listing to anon, authenticated;

-- ── ② EP の台帳に購入の語を足す ─────────────────────────────
--   ⚠️ ★**EP のシンク**です（★外から入る語ではありません）。
--   ⚠️ ★**PP からの変換を表す語ではありません**（★憲法 §0.2-3・`0001` の註記どおり、
--      ★PP→EP を表す語はここに足しません）。
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ep_ledger_reason_allowed') then
    alter table ep_ledger drop constraint ep_ledger_reason_allowed;
  end if;
  alter table ep_ledger add constraint ep_ledger_reason_allowed check (
    reason in ('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee', 'horse_purchase')
  );
end $$;

-- ── ③ 購入の RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_horse(p_horse_id uuid, p_client_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_listing horse_market_listing%rowtype;
  v_owner uuid;
  v_npc int;
  v_retired bigint;
  v_active int;
  v_balance bigint;
  v_key text;
  v_existing bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キー（client_token）が必要'; end if;

  -- ★再送は二度引かない（★台帳の dedupe_key で見る。`spend_training_ep` と同じ作法）
  v_key := 'purchase:' || p_client_token::text;
  select id into v_existing from ep_ledger where dedupe_key = v_key;
  if found then return p_horse_id; end if;

  -- ★出品されている馬だけ（★価格は出品の行から取る。利用者の申告を使わない・憲法 3）
  select * into v_listing from horse_market_listing
   where horse_id = p_horse_id and active
   for update;
  if not found then raise exception 'この馬は出品されていません'; end if;

  -- ★NPC の馬であること（★他人の持ち馬を買えない・D-102 ②）
  select owner_id, npc_stable_id, retired_at_week into v_owner, v_npc, v_retired
    from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is not null then raise exception 'すでに持ち主がいます'; end if;
  if v_npc is null then raise exception 'NPC の馬ではありません'; end if;
  if v_retired is not null then raise exception '引退した馬は迎えられません'; end if;

  -- ★★所有上限（現役 30 頭・D-104・§6.7）
  select count(*) into v_active from horses
   where owner_id = v_user and retired_at_week is null;
  if v_active >= 30 then
    raise exception '現役の所有上限（30 頭）に達しています（§6.7）';
  end if;

  -- ★EP で払う（★PP には触れない・D-102 ①）
  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;
  if v_balance < v_listing.price_ep then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, v_listing.price_ep
      using errcode = 'ST001';
  end if;

  -- --- 同一トランザクション ---
  update horses set owner_id = v_user, npc_stable_id = null where id = p_horse_id;
  update horse_market_listing set active = false where id = v_listing.id;
  update users set entry_points = entry_points - v_listing.price_ep where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
  values (v_user, -v_listing.price_ep, v_balance - v_listing.price_ep, 'horse_purchase', p_horse_id, v_key);

  return p_horse_id;
end;
$function$
;

-- ★利用者が呼ぶ RPC。authenticated だけに実行させる（`0022`・`0024` と同じ形・V-20 ④）
revoke all on function public.buy_horse(uuid, uuid) from public, anon;
grant execute on function public.buy_horse(uuid, uuid) to authenticated;

commit;
