-- ============================================================================
-- 0074 役割の画面（A-1〜A-6）の読む口と、判定を 1 か所に寄せる
--
--   デザイナー第 2 便 §5 A-1〜A-6。画面が要るのは次の 3 つ。
--     ① 自分の引退馬の一覧（名前・性別・年齢の素・戦績・父母の名前・いまの役割・産駒の数）
--     ② 役割の枠の残り（繁殖牝馬 n / 10・種牡馬 n / 5）
--     ③ 「変えられない理由」（A-3〜A-6 の 4 通り）
--
--   🔴 ③ を画面（TS）で組み立てない。組み立てると `request_breeding_role` と**別の判定**が 2 つできて、
--      「画面が押せると言ったのに RPC に弾かれる」が起きる（0040:115 の CL-4 と同じ形）。
--      → 判定そのものを `breeding_role_block()` に出し、**RPC もこの読む口も同じ関数を呼ぶ**。
--
--   🔴 上限の数（10 / 5 / 8）を写さない（D-052）。`breeding_role_limit()` と
--      `mare_lifetime_foals()` の 1 か所だけに置き、RPC も読む口も画面もそこから取る。
--      ⚠️ 0070 は数を直に書いていた。この移行でその 2 か所を関数の呼び出しに置き換える
--         （`apps/cli/test/ownership-limits-sql.test.ts` が TS の定数と結び直す）。
--
--   ⚠️ 数える条件は `request_breeding_role` と**同じ**（`owner_id = 本人 and retirement_role = その役割`）。
--      引退の有無で絞らない。絞ると画面の「n / 10」が RPC の見ている数と食い違う。
--      ⚠️ ただし**行のロックは RPC にしか無い**（読む口は読むだけ）。読んだ数は「そのときの数」で、
--         確定はしない。確定するのは RPC（利用者の行をロックしてから数える・0070 §4）。
--
--   ⚠️ 秒数・日数は計算しない（0067・0073 と同じ作法）。返すのは週だけで、
--      「あと何時間」は画面が packages/scheduler の関数で出す。
-- ============================================================================
begin;

-- ── ① 上限の数（1 か所だけ） ───────────────────────────────
create or replace function public.breeding_role_limit(p_to_role text)
 returns int
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case p_to_role when 'stallion' then 5 when 'broodmare' then 10 else null end
$function$;

comment on function public.breeding_role_limit(text) is
  '★引退後の役割の頭数の上限（★正典 §6.7・D-104・★2026-09-23・0074）。'
  '★TS の OWNERSHIP_LIMITS と結んである（apps/cli/test/ownership-limits-sql.test.ts）。'
  '★功労馬（honored）に上限は無い — ★null を返す（★「いつでも戻せる」）';

revoke all on function public.breeding_role_limit(text) from public, anon;
grant execute on function public.breeding_role_limit(text) to authenticated;

create or replace function public.mare_lifetime_foals()
 returns int
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select 8
$function$;

comment on function public.mare_lifetime_foals() is
  '★繁殖牝馬の生涯の産駒数（★正典 §6.7・★2026-09-23・0074）。'
  '★TS の DEFAULT_BALANCE.MARE_LIFETIME_FOALS と結んである';

revoke all on function public.mare_lifetime_foals() from public, anon;
grant execute on function public.mare_lifetime_foals() to authenticated;

-- ── ② 「変えられない理由」の判定（1 か所だけ） ─────────────────
--   ★null を返したら変えられる。★語は 0070 の role_requests_reason_known と同じ集合。
--   ⚠️ 数えた結果（p_role_count）は**渡してもらう**。
--      ★RPC は利用者の行をロックしてから数え、★読む口はロックせずに数える。
--      ★ここに数え上げを入れると、★ロックの有無がこの関数の中に隠れる。
create or replace function public.breeding_role_block(
  p_is_owner boolean,
  p_sex text,
  p_retired_at_week bigint,
  p_from_role text,
  p_foal_count int,
  p_to_role text,
  p_role_count bigint
)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when not p_is_owner then 'not_owner'
    when p_retired_at_week is null then 'not_retired'
    when (p_to_role = 'stallion' and p_sex <> 'male')
      or (p_to_role = 'broodmare' and p_sex <> 'female') then 'sex_mismatch'
    when p_from_role = p_to_role then 'same_role'
    when p_to_role = 'broodmare' and p_foal_count >= mare_lifetime_foals() then 'lifetime_foals_reached'
    when p_to_role in ('stallion', 'broodmare')
      and p_role_count >= breeding_role_limit(p_to_role) then 'owner_limit'
    else null
  end
$function$;

comment on function public.breeding_role_block(boolean, text, bigint, text, int, text, bigint) is
  '★引退後の役割を変えられない理由（★null なら変えられる・★2026-09-23・0074）。'
  '★request_breeding_role と my_retired_horses が**同じこの関数**を呼ぶ — '
  '★画面と RPC で判定が分かれると「押せると言ったのに弾かれる」が起きる（0040:115 CL-4）。'
  '★並びは 0070 の elsif と同じ（先に当たったものを返す）';

revoke all on function public.breeding_role_block(boolean, text, bigint, text, int, text, bigint) from public, anon;
grant execute on function public.breeding_role_block(boolean, text, bigint, text, int, text, bigint) to authenticated;

-- ── ③ 役割を変える RPC を、②・① を呼ぶ形に置き換える ───────────
--   ⚠️ 中身の判定は 0070 と**同じ**。数の出どころと判定の置き場所だけを変える。
--   ⚠️ ロックの順（利用者の行 → 馬）と、数えるのがロックの**後**であることは 0070 のまま。
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
  v_count bigint;
  v_reason text;
  v_week bigint;
begin
  perform assert_setup_complete();
  if v_user is null then raise exception '未認証'; end if;
  if p_request_id is null or p_horse_id is null or p_to_role is null then
    raise exception '要求 ID・馬・役割が必要';
  end if;
  if p_to_role not in ('stallion', 'broodmare', 'honored') then raise exception '役割が不正'; end if;

  -- 利用者の行を最初にロックする（上限を数える前・0070 §4）
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

  -- 数えるのは利用者の行をロックした後（0070 §4）。功労馬に戻すときは上限を見ないので数えない
  if p_to_role in ('stallion', 'broodmare') then
    select count(*) into v_count from horses h
     where h.owner_id = v_user and h.retirement_role = p_to_role;
  end if;

  v_reason := breeding_role_block(
    v_owner is not distinct from v_user, v_sex, v_retired, v_role, v_foals, p_to_role, v_count
  );

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
$function$;

revoke all on function public.request_breeding_role(uuid, uuid, text) from public, anon;
grant execute on function public.request_breeding_role(uuid, uuid, text) to authenticated;

-- ── ④ 役割の画面が読む口 ───────────────────────────────────
--   ★1 往復で足りる形にする（★1 往復は 50〜220ms・★行ごとに同じ数が入るのは承知の上）。
--   ★出す列は §5 A-1 が要るものだけ。★genotype / potential / stats は出さない（D-114・D-116）。
--   ★父母は**名前だけ**（★血統のつながりは見せてよい・第 1 便 §1）。
create or replace function public.my_retired_horses()
 returns table (
   horse_id uuid,
   horse_name text,
   horse_sex text,
   horse_birth_week bigint,
   retired_at_week bigint,
   retirement_reason text,
   retirement_role text,
   foal_count int,
   g1_wins int,
   wins bigint,
   starts bigint,
   sire_name text,
   dam_name text,
   broodmare_count bigint,
   stallion_count bigint,
   broodmare_limit int,
   stallion_limit int,
   lifetime_foals int,
   broodmare_block text,
   stallion_block text
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_broodmare bigint;
  v_stallion bigint;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;

  -- ★数える条件は request_breeding_role と同じ（引退の有無で絞らない）
  select count(*) into v_broodmare from horses h
   where h.owner_id = v_user and h.retirement_role = 'broodmare';
  select count(*) into v_stallion from horses h
   where h.owner_id = v_user and h.retirement_role = 'stallion';

  return query
    select
      h.id,
      h.name,
      h.sex,
      h.birth_week,
      h.retired_at_week,
      h.retirement_reason,
      h.retirement_role,
      h.foal_count,
      h.g1_wins,
      (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos = 1),
      (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos is not null),
      (select s.name from horses s where s.id = h.sire_id),
      (select d.name from horses d where d.id = h.dam_id),
      v_broodmare,
      v_stallion,
      breeding_role_limit('broodmare'),
      breeding_role_limit('stallion'),
      mare_lifetime_foals(),
      breeding_role_block(true, h.sex, h.retired_at_week, h.retirement_role, h.foal_count, 'broodmare', v_broodmare),
      breeding_role_block(true, h.sex, h.retired_at_week, h.retirement_role, h.foal_count, 'stallion', v_stallion)
      from horses h
     where h.owner_id = v_user and h.retired_at_week is not null
     order by h.retired_at_week desc, h.id;
end;
$function$;

comment on function public.my_retired_horses() is
  '★本人の引退馬と、役割の枠の残りと、変えられない理由（★デザイナー第 2 便 §5 A-1〜A-6・★2026-09-23・0074）。'
  '★理由は breeding_role_block が出す — ★画面で組み立てない（★RPC と判定が分かれない）。'
  '★数は「そのときの数」で確定ではない（★確定するのは request_breeding_role・ロックはあちらにしか無い）。'
  '★素質・能力・遺伝子は出さない（D-114・D-116）。★秒数・日数は計算しない（★画面が出す）';

revoke all on function public.my_retired_horses() from public, anon;
grant execute on function public.my_retired_horses() to authenticated;

commit;
