-- ---------------------------------------------------------------------------
-- ★**戦績の数え方を 1 か所にする**（★D-052）
--    ★裁定 `REVIEW_MARKET_PUBLIC_VIEW_20260925.md`（2026-09-25・レビュー側の追加条件）
-- ---------------------------------------------------------------------------
--
-- 【★なぜ要るか】
--   ★同じ式が ★**3 か所**に写されていました:
--     ★`my_retired_horses()`（`0075`）／★`retired_horses_public`（`0083`）／★`horse_market_listing_public`（`0085`）
--   ★検査で突き合わせてはいましたが、★レビュー側の判断: ★**「突き合わせの網より 1 つにするほうが強い」**。
--   ★前例は同じ作品の中に在ります（★`horse_total_prize_pp`・`0071:18`）。
--
-- 【★数え方（★3 か所すべてで同じだったもの）】
--   ★出走数 … ★`finish_pos is not null`（★**確定した出走だけ**。★登録しただけ・取消は数えない）
--   ★勝数   … ★`finish_pos = 1`
--   ⚠️ ★G1 勝数は ★`horses.g1_wins`（★列）なので、★ここでは数えません（★出どころが違う）。
--
-- ⚠️ ★`language sql stable` です（★状態を変えません）。
-- ⚠️ ★`security definer` にしません — ★呼ぶ側（view・関数）の権限で走ればよく、
--    ★定義者の権限で走らせる理由がありません（★狭いほうを選ぶ）。
-- ---------------------------------------------------------------------------
begin;

create or replace function public.horse_starts(p_horse_id uuid)
returns bigint
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::bigint from race_entries e
   where e.horse_id = p_horse_id and e.finish_pos is not null
$function$;

comment on function public.horse_starts(uuid) is
  '★出走数（★確定した出走だけ）。★D-052: ★数え方はここ 1 か所。'
  '★0075 / 0083 / 0085 が呼ぶ。★apps/cli/test/horse-record-one-place.test.ts が「外で数えていない」を見る';

create or replace function public.horse_wins(p_horse_id uuid)
returns bigint
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::bigint from race_entries e
   where e.horse_id = p_horse_id and e.finish_pos = 1
$function$;

comment on function public.horse_wins(uuid) is
  '★勝数。★D-052: ★数え方はここ 1 か所（★horse_starts と対）';

-- ★読む口から呼ぶので、★利用者のロールにも実行を許します（★view は呼ぶ側の権限で走ります）
grant execute on function public.horse_starts(uuid) to anon, authenticated;
grant execute on function public.horse_wins(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ★① 引退馬の公開の一覧（`0083`）を ★関数を呼ぶ形に
-- ---------------------------------------------------------------------------
-- ⚠️ ★**変えたのは 2 行だけ**です（★数え方の式 → 関数の呼び出し）。★他の列は 1 文字も動かしていません。
create or replace view retired_horses_public as
select
  h.id as horse_id,
  h.name as horse_name,
  h.sex as horse_sex,
  h.birth_week as horse_birth_week,
  h.retired_at_week,
  h.retirement_role,
  h.foal_count,
  h.g1_wins,
  horse_wins(h.id) as wins,
  horse_starts(h.id) as starts,
  (select s.name from horses s where s.id = h.sire_id) as sire_name,
  (select d.name from horses d where d.id = h.dam_id) as dam_name,
  (select u.stable_name from users u where u.id = h.owner_id) as stable_name
from horses h
where h.retired_at_week is not null;

comment on view retired_horses_public is
  '★引退馬の公開の一覧（★正典 LR-6・裁定 REVIEW_RETIRED_SCREEN_PORTS_20260925.md §4）。'
  '★出すのは牧場名まで（★display_name は 1 文字も出さない）。★素質・能力・発見度は出さない（D-114）。'
  '★戦績は horse_starts / horse_wins（0086）を呼ぶ — ★数え方は 1 か所';

grant select on retired_horses_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ★② 市場の出品（`0085`）を ★関数を呼ぶ形に
-- ---------------------------------------------------------------------------
create or replace view horse_market_listing_public as
select
  l.horse_id,
  l.price_ep,
  l.sell_back_ep,
  h.name as horse_name,
  h.sex as horse_sex,
  h.birth_week as horse_birth_week,
  horse_wins(h.id) as wins,
  horse_starts(h.id) as starts,
  h.g1_wins
from horse_market_listing l
join horses h on h.id = l.horse_id
where l.active;

comment on view horse_market_listing_public is
  '★市場の出品（★D-102）。★名前と戦績を出す（★D-102 ③・D-114）。★素質・能力・発見度は出さない。'
  '★戦績は horse_starts / horse_wins（0086）を呼ぶ — ★数え方は 1 か所';

grant select on horse_market_listing_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ★③ `my_retired_horses()`（`0075`）を ★関数を呼ぶ形に
-- ---------------------------------------------------------------------------
-- ⚠️ ★**中身は `0075` と同一で、★変えたのは戦績の 2 行だけ**です。
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
      horse_wins(h.id),
      horse_starts(h.id),
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

revoke all on function public.my_retired_horses() from public, anon;
grant execute on function public.my_retired_horses() to authenticated;

commit;
