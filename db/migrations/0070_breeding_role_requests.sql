-- ============================================================================
-- 0070 引退馬の役割を持ち主が変える（I-1 段 3）
--   裁定 REVIEW_I1_STEP3_ROLE_REQUEST_VERDICT_20260922.md（R-1 (a)・R-2 (a)・Q-C・§4）
--
--   （引退の理由 'mare_lifetime_foals' を許す直しは 0069 に分けた・裁定 REVIEW_PROD_DEPLOY_ORDER_20260922.md §1）
--   ② horse_story_event に 'breeding-role-changed' を足す（Q-C: 自動で降ろしたときも、持ち主が変えたときも書く）
--   ③ role_requests（要求 ID で冪等。確定は同期の RPC・R-2 (a)）
--   ④ request_breeding_role(p_request_id, p_horse_id, p_to_role)
--   ⑤ buy_horse を定義し直す（利用者の行を先にロックしてから数える・§4）
--
--   上限の数（種牡馬 5・繁殖牝馬 10・現役 30）と生涯の産駒数 8 は SQL に書く（R-1 (a)）。
--   apps/cli/test/ownership-limits-sql.test.ts が、各関数の最後の定義から数を読み、
--   OWNERSHIP_LIMITS・DEFAULT_BALANCE.MARE_LIFETIME_FOALS と突き合わせる。
-- ============================================================================
begin;

-- ── ② 生涯の記録の種類 ─────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'horse_story_event_type_known') then
    alter table horse_story_event drop constraint horse_story_event_type_known;
  end if;
  alter table horse_story_event add constraint horse_story_event_type_known check (
    event_type in (
      'birth', 'first-training', 'debut', 'first-win', 'trait-discovered', 'injury', 'comeback',
      'graded-win', 'top-grade-win', 'jockey-bond', 'career-high', 'final-race', 'retirement',
      'first-offspring', 'offspring-win', 'breeding-role-changed'
    )
  );
end $$;

-- ── ③ 役割の依頼 ───────────────────────────────────────
create table if not exists role_requests (
  id uuid primary key,
  user_id uuid not null references users (id),
  horse_id uuid not null references horses (id),
  to_role text not null,
  status text not null,
  failure_reason text,
  from_role text,
  created_at timestamptz not null default now(),
  constraint role_requests_to_role_known check (to_role in ('stallion', 'broodmare', 'honored')),
  constraint role_requests_status_known check (status in ('done', 'failed')),
  constraint role_requests_failure_known check (
    failure_reason is null or failure_reason in (
      'not_owner', 'not_retired', 'sex_mismatch', 'same_role', 'lifetime_foals_reached', 'owner_limit'
    )
  ),
  constraint role_requests_result_shape check (
    (status = 'done' and failure_reason is null and from_role is not null)
    or (status = 'failed' and failure_reason is not null)
  )
);
create index if not exists role_requests_user_idx on role_requests (user_id, created_at);
comment on table role_requests is
  '引退馬の役割の変更（I-1 段 3）。確定は request_breeding_role が同期で行う。要求 ID で冪等（再送には前の結果を返す）。';
alter table role_requests enable row level security;
revoke all on table role_requests from public, anon, authenticated;

-- ── ④ 役割を変える RPC ─────────────────────────────────────
--   ロックの順: 利用者の行 → 馬。同じ人が 2 頭を同時に上げて上限を 1 つ超える競合を、利用者の行で止める。
--   buy_horse は「利用者 → 出品 → 馬」の順になる（⑤）。対象の馬が重ならないので
--   （購入は持ち主の居ない現役馬、こちらは持ち主の居る引退馬）、互いに待ち合って止まる形にはならない。
create or replace function public.request_breeding_role(p_request_id uuid, p_horse_id uuid, p_to_role text)
 returns table (status text, failure_reason text, from_role text, to_role text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_prev role_requests%rowtype;
  v_owner uuid;
  v_sex text;
  v_retired bigint;
  v_role text;
  v_foals int;
  v_count int;
  v_reason text;
  v_week bigint;
begin
  perform assert_setup_complete();
  if v_user is null then raise exception '未認証'; end if;
  if p_request_id is null or p_horse_id is null or p_to_role is null then
    raise exception '要求 ID・馬・役割が必要';
  end if;
  if p_to_role not in ('stallion', 'broodmare', 'honored') then raise exception '役割が不正'; end if;

  -- 利用者の行を最初にロックする（上限を数える前・§4）
  perform 1 from users u where u.id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;

  -- 再送には前の結果を返す
  select * into v_prev from role_requests r where r.id = p_request_id;
  if found then
    if v_prev.user_id <> v_user or v_prev.horse_id <> p_horse_id or v_prev.to_role <> p_to_role then
      raise exception '同じ要求 ID で別の依頼です' using errcode = 'ST040';
    end if;
    return query select v_prev.status, v_prev.failure_reason, v_prev.from_role, v_prev.to_role;
    return;
  end if;

  select h.owner_id, h.sex, h.retired_at_week, h.retirement_role, h.foal_count
    into v_owner, v_sex, v_retired, v_role, v_foals
    from horses h where h.id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;

  if v_owner is distinct from v_user then v_reason := 'not_owner';
  elsif v_retired is null then v_reason := 'not_retired';
  elsif (p_to_role = 'stallion' and v_sex <> 'male') or (p_to_role = 'broodmare' and v_sex <> 'female') then
    v_reason := 'sex_mismatch';
  elsif v_role = p_to_role then v_reason := 'same_role';
  elsif p_to_role = 'broodmare' and v_foals >= 8 then v_reason := 'lifetime_foals_reached';
  elsif p_to_role in ('stallion', 'broodmare') then
    select count(*) into v_count from horses h
     where h.owner_id = v_user and h.retirement_role = p_to_role;
    if v_count >= (case p_to_role when 'stallion' then 5 else 10 end) then v_reason := 'owner_limit'; end if;
  end if;

  if v_reason is not null then
    insert into role_requests (id, user_id, horse_id, to_role, status, failure_reason, from_role)
    values (p_request_id, v_user, p_horse_id, p_to_role, 'failed', v_reason, v_role);
    return query select 'failed'::text, v_reason, v_role, p_to_role;
    return;
  end if;

  -- 生涯の記録に書く週（ワーカーが書くいまの週。読めなければ変えない＝fail-closed）
  select w.game_week into v_week from world_state w where w.id = true;
  if v_week is null then raise exception 'いまの週が分かりません' using errcode = 'ST041'; end if;

  update horses h set retirement_role = p_to_role where h.id = p_horse_id;
  insert into role_requests (id, user_id, horse_id, to_role, status, failure_reason, from_role)
  values (p_request_id, v_user, p_horse_id, p_to_role, 'done', null, v_role);
  insert into horse_story_event (horse_id, event_type, game_week, detail)
  values (p_horse_id, 'breeding-role-changed', v_week,
          jsonb_build_object('from', v_role, 'to', p_to_role, 'reason', 'owner'));
  return query select 'done'::text, null::text, v_role, p_to_role;
end;
$function$
;

revoke all on function public.request_breeding_role(uuid, uuid, text) from public, anon;
grant execute on function public.request_breeding_role(uuid, uuid, text) to authenticated;

-- ── ⑤ buy_horse: 利用者の行を先にロックしてから数える（§4） ─────────────
--   0025 は上限を数えた後に利用者の行をロックしていた。同じ利用者から購入が同時に 2 本来ると、
--   どちらも 29 頭と数えて両方が通り、31 頭になる（別々の馬なので馬の行のロックでは止まらない）。
--   冪等の確認（台帳を読むだけ）の直後にロックする。それ以外は 0025 と同じ。
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

  -- ★利用者の行を先にロックする（★上限を数える前・裁定 I-1 段 3 §4）
  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;

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

revoke all on function public.buy_horse(uuid, uuid) from public, anon;
grant execute on function public.buy_horse(uuid, uuid) to authenticated;

commit;
