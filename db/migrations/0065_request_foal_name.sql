-- ---------------------------------------------------------------------------
-- 0065 仔の命名の受付（★PLAN I-3・D-120・2026-09-22）
--
-- 裁定 REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md（ff7028c）§2・§3 ／
--      REVIEW_I3_NAMING_VERDICT_20260922.md（f117984）§4。
--
-- 【★何をするか】
--   ★利用者の RPC は ★**命名の要求を積むだけ**（`foal_requests.kind = 'name'`）。
--   ★名前の形・重複・禁止名の判定と、★`horses` への登録は ★**ワーカーが行う**（★正規化と禁止名は TS にしかない・D-052）。
--   ★画面は文字数を即時に判定してよいが、★ワーカーが必ず同じ関数（`checkPlayerHorseName`）で判定し直す。
--
-- 【★冪等キー】
--   第 1 段: 要求 ID（★同じ ID の再送には前の行を返す・エラーにしない）
--   第 2 段: ★成功は下書きごとに 1 件（`foal_requests_one_name_per_draft`・0061）。
--     ★待っている要求が別に在っても受け付ける（★ワーカーが古い順に処理し、★先に通った後は `already_named`）。
-- ---------------------------------------------------------------------------

begin;

create or replace function public.request_foal_name(
  p_request_id uuid, p_draft_id uuid, p_name text
) returns table (request_id uuid, status text, failure_reason text, result_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_id uuid;
  v_owner uuid;
  v_kind text;
  v_status text;
  v_reason text;
  v_result uuid;
  v_draft_owner uuid;
  v_named uuid;
begin
  v_user := assert_setup_complete();
  if p_request_id is null or p_draft_id is null or p_name is null then
    raise exception '要求 ID・仔・名前が必要です' using errcode = 'ST030';
  end if;
  -- ★長さの上限だけは受付で切る（★巨大な文字列を積ませない）。★形の判定はワーカー
  if char_length(p_name) > 64 then
    raise exception '名前が長すぎます' using errcode = 'ST031';
  end if;

  -- ★第 1 段: 同じ要求 ID が既に在れば、その行を返す（★表の列は別名 r. 付き・0062 の教訓）
  select r.id, r.user_id, r.kind, r.status, r.failure_reason, r.result_id
    into v_id, v_owner, v_kind, v_status, v_reason, v_result
    from foal_requests r where r.id = p_request_id;
  if found then
    if v_owner <> v_user or v_kind <> 'name' then
      raise exception 'その要求 ID は使えません' using errcode = 'ST021';
    end if;
    return query select v_id, v_status, v_reason, v_result;
    return;
  end if;

  -- ★本人の仔だけ。★他人の仔の有無を区別して返さない
  select d.user_id, d.named_horse_id into v_draft_owner, v_named
    from foal_drafts d where d.id = p_draft_id;
  if not found or v_draft_owner <> v_user then
    raise exception 'その仔には名前を付けられません' using errcode = 'ST032';
  end if;
  if v_named is not null then
    raise exception 'その仔には既に名前が付いています' using errcode = 'ST033';
  end if;

  begin
    insert into foal_requests (id, user_id, kind, draft_id, proposed_name)
         values (p_request_id, v_user, 'name', p_draft_id, p_name);
  exception when unique_violation then
    -- ★主キー（要求 ID）の衝突（★同時の再送）。★本人の行なら返す
    select r.id, r.user_id, r.kind, r.status, r.failure_reason, r.result_id
      into v_id, v_owner, v_kind, v_status, v_reason, v_result
      from foal_requests r where r.id = p_request_id;
    if not found or v_owner <> v_user or v_kind <> 'name' then
      raise exception 'その要求 ID は使えません' using errcode = 'ST021';
    end if;
    return query select v_id, v_status, v_reason, v_result;
    return;
  end;

  return query select p_request_id, 'pending'::text, null::text, null::uuid;
end;
$function$;

revoke all on function public.request_foal_name(uuid, uuid, text) from public, anon;
grant execute on function public.request_foal_name(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 読む口: 本人の要求 1 件の状態（★配合・命名の両方）
-- ---------------------------------------------------------------------------
create or replace function public.my_foal_request(p_request_id uuid)
returns table (request_id uuid, kind text, status text, failure_reason text, result_id uuid)
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
    select r.id, r.kind, r.status, r.failure_reason, r.result_id
      from foal_requests r
     where r.id = p_request_id and r.user_id = v_user;
end;
$function$;

revoke all on function public.my_foal_request(uuid) from public, anon;
grant execute on function public.my_foal_request(uuid) to authenticated;

commit;
