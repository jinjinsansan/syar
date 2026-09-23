-- ============================================================================
-- 0073 読む口に「いつ依頼したか」を足す（裁定 REVIEW_DESIGN_INTRO_V1_VERDICT_20260923.md §4）
--
--   デザイナーの「生産中（60 秒以上）」の画面は、いつ依頼したかが分からないと出せない。
--   画面の中だけで測ると、再読み込み・別のタブ・再ログインで測り直しになる（導入の永続状態と同じ考え方）。
--
--   🔴 経過の秒数は SQL で計算しない（0067 と同じ作法）。返すのは created_at だけで、
--      「あと何秒」「何分前」は画面が packages/scheduler の関数で出す。
--
--   ⚠️ 戻り値の列が増えるので、呼ぶ側（apps/web）は列名で読むこと。
-- ============================================================================
begin;

-- 戻り値の列が増えるので、先に落としてから作り直す（Postgres は返り値の型を変えられない）。
-- 同じ取引の中なので、途中で「関数が無い」状態は外から見えない。
drop function if exists public.my_initial_breeding();
drop function if exists public.my_foal_request(uuid);

create or replace function public.my_initial_breeding()
returns table (request_id uuid, status text, failure_reason text, result_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  -- 失敗した行も返す（理由を画面に出す）。失敗していない行を優先し、新しい順に 1 件
  return query
    select r.id, r.status, r.failure_reason, r.result_id, r.created_at
      from foal_requests r
     where r.user_id = v_user and r.kind = 'breed_initial'
     order by (r.status <> 'failed') desc, r.created_at desc
     limit 1;
end;
$function$;

revoke all on function public.my_initial_breeding() from public, anon;
grant execute on function public.my_initial_breeding() to authenticated;

create or replace function public.my_foal_request(p_request_id uuid)
returns table (request_id uuid, kind text, status text, failure_reason text, result_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  return query
    select r.id, r.kind, r.status, r.failure_reason, r.result_id, r.created_at
      from foal_requests r
     where r.id = p_request_id and r.user_id = v_user;
end;
$function$;

revoke all on function public.my_foal_request(uuid) from public, anon;
grant execute on function public.my_foal_request(uuid) to authenticated;

commit;
