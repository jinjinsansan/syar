-- ---------------------------------------------------------------------------
-- 0103 看板馬の印と ライバル馬（★正典 D-126 の最小・D-131・2026-10-03）
--
-- 裁定 REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md（5365fc0・1fe4496）Q-2・Q-3・§3。
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。
--
-- 【★何をするか】
--   ① ★`horses.signature_year` / `signature_slot`: ★看板馬の印（★その世代のゲーム年・1〜10 の枠）。
--      ★看板馬はワーカーが年の変わり目に産む（★別の便）。★この移行は列を置くだけ。
--   ② ★`horses.rival_horse_id`: ★利用者の馬が 誕生のとき選んだ ライバル（★看板馬）。★変えない（D-131 ⑤）。
--   ③ ★`foal_requests.proposed_rival_id`: ★命名の要求に ライバルを載せる（★命名と同時に選ぶ・Q-3）。
--   ④ ★`request_foal_name` に ★4 つ目の引数 `p_rival_id`（★既定 null）。
--      ★受付は積むだけ。★選べる馬か（★仔の誕生のゲーム年の看板馬・★現役）は ★**ワーカーが判定**する（★0065 と同じ作法）。
--      ★その年の看板馬が 0 頭なら null で名付けできる（★裁定 §3）。
--   ⑤ ★`my_rival_candidates(p_draft_id)`: ★本人の仔が選べる看板馬の一覧（★ログインの口だけ・D-131 ③）。
--
-- 【★変えないこと】
--   ★既存の行は 1 行も書き換えない（★列は null で足す）。
-- ---------------------------------------------------------------------------

begin;

-- ① 看板馬の印
alter table horses add column if not exists signature_year int;
alter table horses add column if not exists signature_slot smallint;
comment on column horses.signature_year is
  '★看板馬なら、その世代のゲーム年（gameYearOf の値・D-126）。★`generation`（親の最大 + 1）とは別物。★看板馬でなければ null';
comment on column horses.signature_slot is '★看板馬の枠（1〜10・D-126）。★signature_year と組で null か非 null';

alter table horses drop constraint if exists horses_signature_pair;
alter table horses add constraint horses_signature_pair check (
  (signature_year is null and signature_slot is null)
  or (signature_year is not null and signature_slot between 1 and 10)
);
create unique index if not exists horses_signature_year_slot
  on horses (signature_year, signature_slot) where signature_year is not null;

-- ② ライバル
alter table horses add column if not exists rival_horse_id uuid references horses (id);
comment on column horses.rival_horse_id is
  '★誕生のとき選んだライバル（★看板馬・D-131）。★着順には効かない。★変えない。★読むのはログインの口だけ';

-- ③ 命名の要求に載せる
alter table foal_requests add column if not exists proposed_rival_id uuid references horses (id);

-- ④ 命名の受付（★0065 の本体に 引数を 1 つ足しただけ）
drop function if exists public.request_foal_name(uuid, uuid, text);

create or replace function public.request_foal_name(
  p_request_id uuid, p_draft_id uuid, p_name text, p_rival_id uuid default null
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
  if char_length(p_name) > 64 then
    raise exception '名前が長すぎます' using errcode = 'ST031';
  end if;

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

  select d.user_id, d.named_horse_id into v_draft_owner, v_named
    from foal_drafts d where d.id = p_draft_id;
  if not found or v_draft_owner <> v_user then
    raise exception 'その仔には名前を付けられません' using errcode = 'ST032';
  end if;
  if v_named is not null then
    raise exception 'その仔には既に名前が付いています' using errcode = 'ST033';
  end if;

  begin
    insert into foal_requests (id, user_id, kind, draft_id, proposed_name, proposed_rival_id)
         values (p_request_id, v_user, 'name', p_draft_id, p_name, p_rival_id);
  exception when unique_violation then
    select r.id, r.user_id, r.kind, r.status, r.failure_reason, r.result_id
      into v_id, v_owner, v_kind, v_status, v_reason, v_result
      from foal_requests r where r.id = p_request_id;
    if not found or v_owner <> v_user or v_kind <> 'name' then
      raise exception 'その要求 ID は使えません' using errcode = 'ST021';
    end if;
    return query select v_id, v_status, v_reason, v_result;
    return;
  when foreign_key_violation then
    -- ★存在しない馬の ID。★ワーカーと同じ理由で落とす（★馬の有無を区別して返さない）
    raise exception 'その馬はライバルに選べません' using errcode = 'ST034';
  end;

  return query select p_request_id, 'pending'::text, null::text, null::uuid;
end;
$function$;

revoke all on function public.request_foal_name(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.request_foal_name(uuid, uuid, text, uuid) to authenticated;

-- ⑤ 選べる看板馬（★本人の仔の誕生のゲーム年・現役・枠の順）
create or replace function public.my_rival_candidates(p_draft_id uuid)
returns table (horse_id uuid, name text, sex text, signature_slot smallint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_week bigint;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  select d.birth_week into v_week from foal_drafts d where d.id = p_draft_id and d.user_id = v_user;
  if not found then
    return;
  end if;
  return query
    select h.id, h.name, h.sex, h.signature_slot
      from horses h
     where h.signature_year = floor(v_week / 52.0)::int
       and h.retired_at_week is null
     order by h.signature_slot;
end;
$function$;

revoke all on function public.my_rival_candidates(uuid) from public, anon;
grant execute on function public.my_rival_candidates(uuid) to authenticated;

commit;
