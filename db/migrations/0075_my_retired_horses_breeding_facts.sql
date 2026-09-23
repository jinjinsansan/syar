-- ============================================================================
-- 0075 母の一覧に要る事実を読む口に足す（デザイナー第 2 便 §5 B-1）
--
--   B-1「自分の繁殖牝馬の一覧」は、選べない母を薄く出す（一覧から外さない）。
--   選べない条件は canMate（packages/sim-engine）が持っている：
--     6 歳未満 ／ 今年もう産んだ ／ 生涯 8 産に達した ／（父の側）今年の種付枠が尽きた
--
--   🔴 その条件を画面で書き直さない。画面も同じ canMate を呼ぶ（0074 と同じ考え方）。
--      → 読む口は「判定」ではなく「canMate に渡す事実」を返す。
--         bred_this_year だけが 0074 に無かったので足す。
--         birth_week・foal_count は 0074 が既に返している。
--
--   ⚠️ 戻り値の列が増えるので、先に落としてから作り直す（Postgres は返り値の型を変えられない・0073 と同じ）。
--   ⚠️ 呼ぶ側（apps/web）は列名で読むこと。
--
--   ⚠️ 年の尺度: canMate は birthYear を見る。ワーカーは gameYearOf(birth_week) を渡している
--      （breeding-runner.ts:189）。horses.birth_year は別の尺度（+46）なので返さない。
--      画面も birth_week から出すこと。
-- ============================================================================
begin;

drop function if exists public.my_retired_horses();

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
   stallion_block text,
   -- ★0075 で追加: ★canMate に渡す事実（★判定はしない）
   bred_this_year boolean,
   coverings_this_year int
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
      breeding_role_block(true, h.sex, h.retired_at_week, h.retirement_role, h.foal_count, 'stallion', v_stallion),
      h.bred_this_year,
      h.coverings_this_year
      from horses h
     where h.owner_id = v_user and h.retired_at_week is not null
     order by h.retired_at_week desc, h.id;
end;
$function$;

comment on function public.my_retired_horses() is
  '★本人の引退馬と、役割の枠の残りと、変えられない理由（★デザイナー第 2 便 §5 A-1〜A-6・★2026-09-23・0074）。'
  '★0075 で bred_this_year / coverings_this_year を追加（★B-1 の「選べない母」を canMate が判定するため）。'
  '★理由は breeding_role_block が出す — ★画面で組み立てない（★RPC と判定が分かれない）。'
  '★数は「そのときの数」で確定ではない（★確定するのは request_breeding_role・ロックはあちらにしか無い）。'
  '★素質・能力・遺伝子は出さない（D-114・D-116）。★秒数・日数は計算しない（★画面が出す）';

revoke all on function public.my_retired_horses() from public, anon;
grant execute on function public.my_retired_horses() to authenticated;

commit;
