-- ============================================================================
-- 0071 自分の繁殖牝馬で配合する（foal_requests.kind = 'breed'・相手は NPC の種牡馬だけ）
--   裁定 REVIEW_BREED_OWN_MARE_VERDICT_20260922.md（B-1〜B-7・§2〜§4）
--
--   ① horse_total_prize_pp(p_horse_id) … 総獲得賞金の数え方を 1 か所にする（§3）。
--      market-flow.ts・player-breeding.ts・下の読む口が、これを呼ぶ
--   ② foal_requests に breed_year・max_fee_ep・stud_fee_ep を足す。形の制約と、(母, 受付の年) の部分一意
--   ③ spend_stud_fee_ep(p_request_id, p_amount) … ワーカー専用の引き落とし（spend_training_ep と同じ作り・§4）
--   ④ request_breeding(p_request_id, p_dam_id, p_sire_id, p_max_fee_ep) … 受付（安い確かめだけ・B-3）
--   ⑤ npc_stallion_facts() … 読む口。事実だけを返す（残り枠も額も計算しない・§2）
--
--   canMate（年齢・今年の産駒・種付上限・近交）は SQL に写さない。確定のときにワーカーが TS で見る。
-- ============================================================================
begin;

-- ── ① 総獲得賞金 ───────────────────────────────────────
--   prize_pp が null の出走（0049 より前・埋め戻していない）は 0 として数えない（sum が null を飛ばす）
create or replace function public.horse_total_prize_pp(p_horse_id uuid)
 returns bigint
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(e.prize_pp), 0)::bigint
    from race_entries e
   where e.horse_id = p_horse_id and e.prize_pp is not null
$function$;
revoke all on function public.horse_total_prize_pp(uuid) from public, anon, authenticated;

-- ── ② 依頼の表 ─────────────────────────────────────────
alter table foal_requests add column if not exists breed_year int;
alter table foal_requests add column if not exists max_fee_ep bigint;
alter table foal_requests add column if not exists stud_fee_ep bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'foal_requests_breed_shape') then
    alter table foal_requests add constraint foal_requests_breed_shape check (
      (kind = 'breed' and breed_year is not null and breed_year >= 0 and max_fee_ep is not null and max_fee_ep > 0)
      or (kind <> 'breed' and breed_year is null and max_fee_ep is null)
    );
  end if;
  -- 引いた種付料は、kind = 'breed' が完了したときだけ記録する
  if not exists (select 1 from pg_constraint where conname = 'foal_requests_stud_fee_shape') then
    alter table foal_requests add constraint foal_requests_stud_fee_shape check (
      stud_fee_ep is null or (kind = 'breed' and status = 'done' and stud_fee_ep >= 0)
    );
  end if;
end $$;

-- 業務上の一意: 同じ母は、受付の年ごとに 1 件（失敗した依頼は枠を使わない・B-2/B-3）
create unique index if not exists foal_requests_one_breed_per_dam_year
  on foal_requests (dam_id, breed_year) where kind = 'breed' and status <> 'failed';

-- ── ③ 種付料の引き落とし（ワーカー専用・D-095） ───────────────────
--   spend_training_ep（0021）と同じ作り: 記帳を先に行い、一意に当たれば引かずに前の残高を返す。
--   台帳の balance_after と users.entry_points が必ず一致する。
create or replace function public.spend_stud_fee_ep(p_request_id uuid, p_amount bigint)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_balance bigint;
  v_key text;
  v_existing bigint;
begin
  if p_amount is null or p_amount < 0 then
    raise exception '種付料は負にできない（受け取った値: %）', p_amount;
  end if;

  select r.user_id into v_user from foal_requests r where r.id = p_request_id and r.kind = 'breed';
  if not found then
    raise exception '配合の依頼が存在しない: %', p_request_id;
  end if;

  v_key := 'stud_fee:' || p_request_id::text;
  select balance_after into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_existing;
  end if;

  select entry_points into v_balance from users where id = v_user for update;
  if not found then
    raise exception '依頼した人が存在しない: %', v_user;
  end if;

  if v_balance < p_amount then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, p_amount
      using errcode = 'ST001';
  end if;

  begin
    insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
    values (v_user, -p_amount, v_balance - p_amount, 'stud_fee', p_request_id, v_key);
  exception when unique_violation then
    select balance_after into v_existing from ep_ledger where dedupe_key = v_key;
    return v_existing;
  end;

  update users set entry_points = entry_points - p_amount where id = v_user;
  return v_balance - p_amount;
end;
$function$;
revoke all on function public.spend_stud_fee_ep(uuid, bigint) from public, anon, authenticated;

-- ── ④ 受付 ───────────────────────────────────────────
--   積むだけ。同じ要求 ID の再送には前の行を返す。同じ ID で別の依頼は ST040。
--   ロックは利用者の行を最初に取る（0070 と同じ作法）。
create or replace function public.request_breeding(
  p_request_id uuid, p_dam_id uuid, p_sire_id uuid, p_max_fee_ep bigint
) returns table (request_id uuid, status text, failure_reason text, result_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_row foal_requests%rowtype;
  v_week bigint;
  v_year int;
  v_ok boolean;
begin
  v_user := assert_setup_complete();
  if p_request_id is null or p_dam_id is null or p_sire_id is null or p_max_fee_ep is null then
    raise exception '要求 ID・母・父・払ってよい上限が必要です' using errcode = 'ST020';
  end if;
  if p_dam_id = p_sire_id then
    raise exception '父と母に同じ馬は選べません' using errcode = 'ST022';
  end if;
  if p_max_fee_ep <= 0 then
    raise exception '払ってよい上限は 1 以上です' using errcode = 'ST023';
  end if;

  perform 1 from users u where u.id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;

  select * into v_row from foal_requests r where r.id = p_request_id;
  if found then
    if v_row.user_id <> v_user or v_row.kind <> 'breed'
       or v_row.dam_id <> p_dam_id or v_row.sire_id <> p_sire_id or v_row.max_fee_ep <> p_max_fee_ep then
      raise exception '同じ要求 ID で別の依頼です' using errcode = 'ST040';
    end if;
    return query select v_row.id, v_row.status, v_row.failure_reason, v_row.result_id;
    return;
  end if;

  -- 安い確かめ: 母は自分の繁殖牝馬・父は持ち主の居ない NPC の種牡馬（年齢や枠は確定のときにワーカーが見る）
  select exists (
    select 1 from horses h
     where h.id = p_dam_id and h.owner_id = v_user and h.sex = 'female' and h.retirement_role = 'broodmare'
  ) into v_ok;
  if not v_ok then raise exception '自分の繁殖牝馬ではありません' using errcode = 'ST024'; end if;
  select exists (
    select 1 from horses h
     where h.id = p_sire_id and h.owner_id is null and h.sex = 'male' and h.retirement_role = 'stallion'
  ) into v_ok;
  if not v_ok then raise exception 'NPC の種牡馬ではありません' using errcode = 'ST025'; end if;

  -- 受付の年（ワーカーが書くいまの週から。読めなければ受け付けない＝fail-closed）
  select w.game_week into v_week from world_state w where w.id = true;
  if v_week is null then raise exception 'いまの週が分かりません' using errcode = 'ST041'; end if;
  v_year := (v_week / 52)::int;

  begin
    insert into foal_requests (id, user_id, kind, sire_id, dam_id, breed_year, max_fee_ep)
         values (p_request_id, v_user, 'breed', p_sire_id, p_dam_id, v_year, p_max_fee_ep);
  exception when unique_violation then
    -- (母, 年) の部分一意: その母は今年すでに依頼されている（待ちか完了）
    raise exception 'その母は今年すでに配合を依頼しています' using errcode = 'ST042';
  end;

  return query select p_request_id, 'pending'::text, null::text, null::uuid;
end;
$function$;
revoke all on function public.request_breeding(uuid, uuid, uuid, bigint) from public, anon;
grant execute on function public.request_breeding(uuid, uuid, uuid, bigint) to authenticated;

-- ── ⑤ 読む口: NPC の種牡馬の事実 ───────────────────────────
--   残り枠（20 + G1 × 10 − 今年の種付数）と種付料は画面が packages/ の関数で出す（式を SQL に写さない・§2）。
--   素質・能力の数値は返さない（D-114）。
create or replace function public.npc_stallion_facts()
returns table (horse_id uuid, name text, birth_week bigint, g1_wins int, coverings_this_year int, total_prize_pp bigint)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  return query
    select h.id, h.name, h.birth_week, h.g1_wins, h.coverings_this_year, horse_total_prize_pp(h.id)
      from horses h
     where h.owner_id is null and h.sex = 'male' and h.retirement_role = 'stallion' and h.birth_week is not null
     order by h.id;
end;
$function$;
revoke all on function public.npc_stallion_facts() from public, anon;
grant execute on function public.npc_stallion_facts() to authenticated;

commit;
