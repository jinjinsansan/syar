-- ---------------------------------------------------------------------------
-- 0067 導入の永続状態（★初回の馬づくりを途中から再開できるようにする・PLAN・2026-09-22）
--
-- 照会 QUESTIONS_ONBOARDING_STATE_20260922.md ／ 裁定 REVIEW_ONBOARDING_STATE_VERDICT_20260922.md（8a32840）。
--
-- 【★段階は新しい列に書き写さない】（★裁定・D-119 の族を避ける）
--   ★段階は ★在る行（`users`・`foal_requests`・`foal_drafts`）から ★`my_onboarding_state()` が導く。
--   ★画面は ★この 1 つの結果で行き先を決め、★`foal_requests` / `foal_drafts` を直に読まない。
--
-- 【★`users.onboarding_flow`】（★裁定 §1）
--   ★「どの導入で始まったか」という ★一度だけ決まる事実（★段階ではない）。
--   ★既存の行は `'legacy'`（★初回の配合に戻さない）。★新しい行は ★`create_account` が `'first_horse_v1'` を明示して書く。
--   🔴 ★**`'first_horse_v1'` を既定値にしない** — ★既定値にすると、★古い `create_account` が作った行まで新しい流れになる。
--   ✅ ★既定値は ★`'legacy'`（★裁定 §6・2b3b4c5）。★`users` に行を入れる道具が 14 本あり、★既定値が無いと当てた瞬間に落ちる。
--     ★`'legacy'` なら ★古い経路や道具が作った行は ★初回の配合に戻さない側に倒れる（★安全な側）。
--   ★書き換える口は作らない（★一度書いたら変えない）。
--
-- 【★時間の計算は SQL に入れない】（★裁定 §2 条件 2）
--   ★「あと何日で候補が戻るか」は ★画面が `packages/scheduler` で出す。★ここは事実だけ返す。
--   ★候補の有無の判定に要る ★年齢の下限と生涯の産駒数の上限は ★呼ぶ側が `@star/sim-engine` の値を渡す
--   （★SQL に定数を写さない・D-052）。★いまの週は ★ワーカーが書く `world_state.game_week` を読む（★時刻から計算しない）。
--
-- ⚠️ ★配備の手順書に書くこと（★裁定 §3）: ★この移行の後、★既存の口座（★オーナーの確認用を含む）は `legacy` になる。
--   ★新しい流れを試すには ★新しい口座を作る。
-- ---------------------------------------------------------------------------

begin;

-- ★既存の行は既定値で 'legacy' に埋まる（★add column の default は既存の行にも入る）
alter table users add column if not exists onboarding_flow text not null default 'legacy';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_onboarding_flow_allowed') then
    alter table users add constraint users_onboarding_flow_allowed
      check (onboarding_flow in ('legacy', 'first_horse_v1'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 口座の作成（★0037 と同じ中身。★足したのは `onboarding_flow = 'first_horse_v1'` だけ）
-- ---------------------------------------------------------------------------
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
  v_grant bigint := 2000;   -- ★D-075: 登録時 2,000 EP（較正定数・値をゲートにしない）
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
-- 読む口: 本人の導入の段階（★事実だけ・★非公開の能力値を返さない）
-- ---------------------------------------------------------------------------
create or replace function public.my_onboarding_state(
  p_min_breeding_age_weeks int, p_max_lifetime_foals int
) returns table (
  stage text,
  breed_request_id uuid, breed_status text, breed_failure_reason text,
  draft_id uuid, foal_sex text, sire_name text, dam_name text,
  name_status text, name_failure_reason text,
  has_dam_candidate boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_flow text;
  v_breq uuid; v_bstatus text; v_breason text; v_bresult uuid;
  v_draft uuid; v_sex text; v_sire text; v_dam text; v_named uuid;
  v_nstatus text; v_nreason text;
  v_has boolean := null;
  v_stage text;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;

  select u.onboarding_flow into v_flow from users u where u.id = v_user;
  if not found then
    return query select 'no_account'::text, null::uuid, null::text, null::text, null::uuid, null::text,
      null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;
  if v_flow = 'legacy' then
    return query select 'legacy'::text, null::uuid, null::text, null::text, null::uuid, null::text,
      null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  -- ★初回の配合の要求（★失敗していない行を優先・新しい順に 1 件）
  select r.id, r.status, r.failure_reason, r.result_id
    into v_breq, v_bstatus, v_breason, v_bresult
    from foal_requests r
   where r.user_id = v_user and r.kind = 'breed_initial'
   order by (r.status <> 'failed') desc, r.created_at desc
   limit 1;

  if v_breq is null or v_bstatus = 'failed' then
    v_stage := 'choose_parents';
    -- ★候補の有無（★行の有無だけ・★年齢と産駒数の閾値は呼ぶ側が TS の値を渡す）
    if p_min_breeding_age_weeks is null or p_max_lifetime_foals is null then
      raise exception '候補の判定に要る値（年齢の下限・生涯の産駒数の上限）を渡してください' using errcode = 'ST040';
    end if;
    select exists (
      select 1 from horses h, world_state w
       where w.id = true
         and h.sex = 'female' and h.owner_id is null and h.retirement_role = 'honored'
         and not h.bred_this_year and h.foal_count < p_max_lifetime_foals
         and h.birth_week is not null and w.game_week - h.birth_week >= p_min_breeding_age_weeks
    ) into v_has;
  elsif v_bstatus = 'pending' then
    v_stage := 'waiting_birth';
  else
    select d.id, d.sex, s.name, m.name, d.named_horse_id
      into v_draft, v_sex, v_sire, v_dam, v_named
      from foal_drafts d join horses s on s.id = d.sire_id join horses m on m.id = d.dam_id
     where d.id = v_bresult and d.user_id = v_user;
    if v_named is not null then
      v_stage := 'ready';
    else
      v_stage := 'naming';
      select r.status, r.failure_reason into v_nstatus, v_nreason
        from foal_requests r
       where r.user_id = v_user and r.kind = 'name' and r.draft_id = v_draft
       order by r.created_at desc
       limit 1;
    end if;
  end if;

  return query select v_stage, v_breq, v_bstatus, v_breason, v_draft, v_sex, v_sire, v_dam,
    v_nstatus, v_nreason, v_has;
end;
$function$;

revoke all on function public.my_onboarding_state(int, int) from public, anon;
grant execute on function public.my_onboarding_state(int, int) to authenticated;

commit;
