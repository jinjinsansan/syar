-- ---------------------------------------------------------------------------
-- 0068 導入の段階: いまの週が分からないときは「候補の有無」を null にする（★2026-09-22）
--
-- 🔴 ★0067 の `my_onboarding_state` は、★`world_state` の行が無いと ★**候補が在っても false（候補切れ）**を返した。
--   ★staging の実演（`tools/verify-player-breeding-live.mjs` ⑩）で発見: ★staging の `world_state` は ★行が 0（★ワーカーが一度も書いていない）。
--   ★`from horses h, world_state w where w.id = true` の結合が空になり、★`exists` が偽になっていた。
--   → ★画面は ★ワーカーが止まっている間 ★「候補切れ（次の年まで待って）」と ★**誤って**出すことになる。
--
-- 【★直し方】
--   ★いまの週（`world_state.game_week`）が読めなければ ★`has_dam_candidate = null`（★分からない）を返す。
--   ★画面は null を ★「候補切れ」と出さない（★分からないときは選ばせ、確定の判定はワーカーがする）。
--   ⚠️ ★`world_state` が古い（★ワーカーが遅れている）と、★年齢の判定が遅れの週だけずれる。★判定の正本はワーカー（確定時）。
--   ★0067 は staging に適用済みなので ★書き換えない（★`migrate.mjs` がチェックサムで拒む）。
-- ---------------------------------------------------------------------------

begin;

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
  v_week bigint;
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

  select r.id, r.status, r.failure_reason, r.result_id
    into v_breq, v_bstatus, v_breason, v_bresult
    from foal_requests r
   where r.user_id = v_user and r.kind = 'breed_initial'
   order by (r.status <> 'failed') desc, r.created_at desc
   limit 1;

  if v_breq is null or v_bstatus = 'failed' then
    v_stage := 'choose_parents';
    if p_min_breeding_age_weeks is null or p_max_lifetime_foals is null then
      raise exception '候補の判定に要る値（年齢の下限・生涯の産駒数の上限）を渡してください' using errcode = 'ST040';
    end if;
    -- ★いまの週（★ワーカーが書く）。★読めなければ ★候補の有無は null（★分からない・★false にしない）
    select w.game_week into v_week from world_state w where w.id = true;
    if found then
      select exists (
        select 1 from horses h
         where h.sex = 'female' and h.owner_id is null and h.retirement_role = 'honored'
           and not h.bred_this_year and h.foal_count < p_max_lifetime_foals
           and h.birth_week is not null and v_week - h.birth_week >= p_min_breeding_age_weeks
      ) into v_has;
    end if;
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
