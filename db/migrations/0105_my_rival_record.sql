-- ---------------------------------------------------------------------------
-- 0105 自分の馬と宿敵の対戦成績を読む口（★正典 D-131 ③④・2026-10-03）
--
-- 裁定 REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md Q-5・§5・§9。
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です（★0103 の後）。
--
-- 【★何を返すか】
--   ★本人の馬 1 頭の ★宿敵の名前・★引退したか・★勝利数（★宿敵と自分の馬）・★対戦成績。
--   ★クラス名は返さない（★勝利数 → クラスの対応は TS の `winsRangeFor` 1 か所・D-052。★画面がそこから引く）。
--   ★対戦成績は ★レースの記録から導く（★別の表に書き足さない・D-131 ④・D-052）。
--   ★「同じレースを走り切った回」だけ数える（★取消・出走取りやめ ＝ `finish_pos is null` は数えない・§5）。
--
-- 【★読めるのは本人だけ】★`owner_id = auth.uid()`。★他人の馬・未ログインは 0 行（★宿敵を言わない・D-131 ③）。
--   ★能力の数は返さない（D-114）。
-- ---------------------------------------------------------------------------

begin;

create or replace function public.my_rival_record(p_horse_id uuid)
returns table (
  rival_horse_id uuid,
  rival_name text,
  rival_retired boolean,
  rival_wins int,
  my_wins int,
  met int,
  my_ahead int,
  rival_ahead int
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_rival uuid;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  select h.rival_horse_id into v_rival from horses h where h.id = p_horse_id and h.owner_id = v_user;
  if v_rival is null then
    return;
  end if;
  return query
    select r.id,
           r.name,
           (r.retired_at_week is not null),
           -- ★勝利数は 数え方の 1 か所（`0086` の horse_wins・D-052）
           horse_wins(r.id)::int,
           horse_wins(p_horse_id)::int,
           count(both_.race_id)::int,
           count(*) filter (where both_.mine < both_.theirs)::int,
           count(*) filter (where both_.theirs < both_.mine)::int
      from horses r
      left join (
        select m.race_id, m.finish_pos as mine, t.finish_pos as theirs
          from race_entries m
          join race_entries t on t.race_id = m.race_id and t.horse_id = v_rival
         where m.horse_id = p_horse_id and m.finish_pos is not null and t.finish_pos is not null
      ) both_ on true
     where r.id = v_rival
     group by r.id, r.name, r.retired_at_week;
end;
$function$;

revoke all on function public.my_rival_record(uuid) from public, anon;
grant execute on function public.my_rival_record(uuid) to authenticated;

commit;
