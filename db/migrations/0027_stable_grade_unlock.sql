-- 0027: 厩舎の格を EP で 1 段上げる（D-103 ④「お金で格を上げない。EP での解放は可」）
--
-- ============================================================================
-- 【この移行がすること（3 つ・1 トランザクション）】
--   ① 値段の表 `stable_grade_price`（★サーバーが書く）
--   ② `ep_ledger.reason` に **`stable_grade`** を足す
--   ③ 解放の RPC `unlock_stable_grade`
--
-- 【★なぜ値段を SQL に書かないか】（★D-052・二重帳簿にしない／`0025`・`0026` と同じ形）
--   ★値段は `@star/training` の `GRADE_UNLOCK_EP` が持ちます。★同じ数を SQL にも書くと、
--   ★**画面と DB で値段が食い違う日**が来ます。
--   → ★**サーバー（ワーカー）が値段の行を書き**、★RPC は**その行の値で**払わせます。
--   ⚠️ ★利用者が値段を申告する形にしません（★憲法 3・サーバー権威）。
--
-- 【★D-103 の条件をどう満たすか】
--   ① ★**素質の上限（potential）を変えません** … ★この移行は `horses.stable_grade` しか触りません
--   ② ★**同じ EP で上の格が強くなりません** … ★伸びと費用に同じ倍率（`gainPerEpRatio` が 1.0）。
--      ★上の格が買うのは ★**時間**です
--   ④ ★**お金で格を上げません** … ★払うのは **EP**（★憲法 2 で金銭では買えない点）。
--      ⚠️ ★**PP では払わせません**（★`pp_ledger` に触れません）
--
-- 【★飛び級をさせない】★1 回に 1 段だけ（★ブロンズ → ゴールドを 1 回で買えると合計額が変わります）。
-- ============================================================================
begin;

-- ── ① 値段の表（★サーバーが書く。利用者は読むだけ）──────────────────
create table if not exists stable_grade_price (
  grade text primary key,
  price_ep int not null,
  updated_at timestamptz not null default now(),
  constraint stable_grade_price_known check (grade in ('silver', 'gold')),
  constraint stable_grade_price_positive check (price_ep > 0)
);

comment on table stable_grade_price is
  '★厩舎の格を 1 段上げる値段（D-103 ④）。★サーバー（ワーカー）が @star/training の GRADE_UNLOCK_EP から書く。利用者は読むだけで、値段を申告できない（憲法 3）。';

alter table stable_grade_price enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'stable_grade_price' and policyname = 'stable_grade_price_read') then
    create policy stable_grade_price_read on stable_grade_price for select using (true);
  end if;
end $$;
revoke insert, update, delete, truncate on stable_grade_price from anon, authenticated;
grant select on stable_grade_price to anon, authenticated;

-- ── ② EP の台帳に格の語を足す ────────────────────────────────
--   ⚠️ ★**EP のシンク**です（★外から入る語ではありません）。
--   ⚠️ ★**PP からの変換を表す語ではありません**（★憲法 §0.2-3）。
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ep_ledger_reason_allowed') then
    alter table ep_ledger drop constraint ep_ledger_reason_allowed;
  end if;
  alter table ep_ledger add constraint ep_ledger_reason_allowed check (
    reason in ('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee',
               'horse_purchase', 'horse_sale', 'stable_grade')
  );
end $$;

-- ── ③ 解放の RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unlock_stable_grade(p_horse_id uuid, p_client_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_retired bigint;
  v_grade text;
  v_next text;
  v_price int;
  v_balance bigint;
  v_key text;
  v_done text;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キー（client_token）が必要'; end if;

  -- ★再送は二度引かない（★台帳の dedupe_key で見る）
  v_key := 'grade:' || p_client_token::text;
  select h.stable_grade into v_done
    from ep_ledger l join horses h on h.id = l.ref_id
   where l.dedupe_key = v_key;
  if found then return v_done; end if;

  -- ★自分の馬であること
  select owner_id, retired_at_week, stable_grade into v_owner, v_retired, v_grade
    from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  -- ★引退した馬の格を上げても意味が無い（★週送りの対象外）
  if v_retired is not null then raise exception '引退した馬の厩舎は上げられません'; end if;

  -- ★1 回に 1 段だけ（★飛び級をさせない）
  v_next := case v_grade when 'bronze' then 'silver' when 'silver' then 'gold' else null end;
  if v_next is null then raise exception 'これ以上は上げられません（すでに最上位です）'; end if;

  -- ★値段は表の行から取る（★SQL で計算しない・利用者の申告を使わない）
  select price_ep into v_price from stable_grade_price where grade = v_next;
  if not found then raise exception '値段が未設定です（サーバーが書くまでお待ちください）'; end if;

  -- ★EP で払う（★PP には触れない・D-103 ④）
  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;
  if v_balance < v_price then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, v_price
      using errcode = 'ST001';
  end if;

  -- --- 同一トランザクション ---
  update horses set stable_grade = v_next where id = p_horse_id;
  update users set entry_points = entry_points - v_price where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
  values (v_user, -v_price, v_balance - v_price, 'stable_grade', p_horse_id, v_key);

  return v_next;
end;
$function$
;

-- ★利用者が呼ぶ RPC。authenticated だけに実行させる（`0025`・`0026` と同じ形・V-20 ④）
revoke all on function public.unlock_stable_grade(uuid, uuid) from public, anon;
grant execute on function public.unlock_stable_grade(uuid, uuid) to authenticated;

commit;
