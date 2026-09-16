-- 0026: 馬を手放す（参加ポイントが一部だけ戻る・D-102 ③）
--
-- ============================================================================
-- 【この移行がすること（3 つ・1 トランザクション）】
--   ① 出品に **`sell_back_ep`**（★手放したときに戻る額）を足す
--   ② `ep_ledger.reason` に **`horse_sale`** を足す
--   ③ 手放す RPC `sell_horse`
--
-- 【★なぜ「戻る割合」を SQL に書かないか】（★D-052・二重帳簿にしない）
--   ★戻る額は `@star/scheduler` の `sellBackEP(paidEP)`（割合 `SELL_BACK_RATE`）が決めます。
--   ★同じ割合を SQL にも書くと、★**画面と DB で戻る額が食い違う日**が来ます。
--   → ★**出品を作るとき（ワーカー）に `sell_back_ep` も一緒に書き**、★RPC は**その行の値で**戻します。
--   ⚠️ ★利用者が額を申告する形にしません（★憲法 3・サーバー権威）。
--
-- 【★D-102 ③ の条件をどう満たすか】
--   ★「買って売ってを繰り返す振り直し」が成立しないこと。
--     ① ★**戻るのは買った額の一部だけ**（`sell_back_ep` < 実際に払った額。★RPC が突き合わせる）
--     ② ★**迎えた記録のある馬だけ**手放せる（★配合で生まれた馬は手放せない ＝ EP の蛇口を作らない）
--     ③ ★**引退した馬は手放せない**（★記録であって所有ではない・§18 LR-2）
--     ④ ★**冪等**（★同じ鍵で二度呼んでも二度戻らない）
--
-- ⚠️ ★**EP が増える経路**なので、①②③ のどれが欠けても「EP の蛇口」になります。
--    ★RPC の中で、実際に払った額（`ep_ledger` の `horse_purchase`）と突き合わせています。
-- ============================================================================
begin;

-- ── ① 出品に「戻る額」を足す（★サーバーが書く）──────────────────
--   ⚠️ ★**既定値を置きません。** ★0 を既定にすると、★古い行が「0 EP 戻る」として静かに通ります。
--      ★値が無い行は RPC が**弾きます**（★黙って 0 を返さない）。
alter table horse_market_listing
  add column if not exists sell_back_ep int;

comment on column horse_market_listing.sell_back_ep is
  '★手放したときに戻る EP（D-102 ③）。★サーバー（ワーカー）が sellBackEP(priceEP) で書く。★null の行は手放せない（黙って 0 を返さないため）。';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'horse_market_listing_sell_back_range') then
    alter table horse_market_listing add constraint horse_market_listing_sell_back_range
      -- ★買った額以上を戻さない（★EP の蛇口にしない）。★RPC でも実額と突き合わせる
      check (sell_back_ep is null or (sell_back_ep >= 0 and sell_back_ep < price_ep));
  end if;
end $$;

-- ── ② EP の台帳に「手放した」の語を足す ───────────────────────
--   ⚠️ ★これは **EP が増える語**です（★シンクではありません）。
--      ★`inflow`（デイリーなどの発行）とは別に持ちます — ★**発行量の監視で混ぜないため**（§11.2）。
--   ⚠️ ★**PP からの変換を表す語ではありません**（★憲法 §0.2-3）。
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ep_ledger_reason_allowed') then
    alter table ep_ledger drop constraint ep_ledger_reason_allowed;
  end if;
  alter table ep_ledger add constraint ep_ledger_reason_allowed check (
    reason in ('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee', 'horse_purchase', 'horse_sale')
  );
end $$;

-- ── ③ 手放す RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sell_horse(p_horse_id uuid, p_client_token uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_retired bigint;
  v_paid bigint;
  v_back int;
  v_stable int;
  v_balance bigint;
  v_key text;
  v_done bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キー（client_token）が必要'; end if;

  -- ★④ 再送は二度戻さない（★台帳の dedupe_key で見る）
  v_key := 'sale:' || p_client_token::text;
  select delta into v_done from ep_ledger where dedupe_key = v_key;
  if found then return v_done; end if;

  -- ★自分の馬であること
  select owner_id, retired_at_week into v_owner, v_retired
    from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  -- ★③ 引退した馬は手放せない（★記録であって所有ではない・§18 LR-2）
  if v_retired is not null then raise exception '引退した馬は手放せません（記録として残ります・§18）'; end if;

  -- ★② 迎えた記録のある馬だけ（★配合で生まれた馬は手放せない ＝ EP の蛇口を作らない）
  select -delta into v_paid from ep_ledger
   where user_id = v_user and reason = 'horse_purchase' and ref_id = p_horse_id
   order by id desc limit 1;
  if not found then
    raise exception '迎えた記録のない馬は手放せません（配合で生まれた馬は手放せません・D-102 ③）';
  end if;

  -- ★戻る額は**出品の行**から取る（★割合を SQL で計算しない・D-052）
  select sell_back_ep into v_back from horse_market_listing
   where horse_id = p_horse_id and sell_back_ep is not null
   order by id desc limit 1;
  if not found or v_back is null then
    raise exception 'この馬には戻る額が記録されていません（出品の行が古い可能性）';
  end if;

  -- ★① 戻るのは買った額の一部だけ（★ここが欠けると EP の蛇口になります）
  if v_back >= v_paid then
    raise exception '戻る額が支払った額以上です（EP の蛇口になります）: 戻り % / 支払い %', v_back, v_paid;
  end if;

  -- ★NPC 世界へ戻す（★`horses` は所有者と NPC 厩舎が排他・`0001` の CHECK）
  select min(id) into v_stable from npc_stables;
  if v_stable is null then raise exception 'NPC 厩舎がありません'; end if;

  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;

  -- --- 同一トランザクション ---
  update horses set owner_id = null, npc_stable_id = v_stable where id = p_horse_id;
  update users set entry_points = entry_points + v_back where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
  values (v_user, v_back, v_balance + v_back, 'horse_sale', p_horse_id, v_key);

  return v_back;
end;
$function$
;

-- ★利用者が呼ぶ RPC。authenticated だけに実行させる（`0022`・`0024`・`0025` と同じ形・V-20 ④）
revoke all on function public.sell_horse(uuid, uuid) from public, anon;
grant execute on function public.sell_horse(uuid, uuid) to authenticated;

commit;
