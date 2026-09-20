-- 0055: my_runs に賞金（prize_pp）を出す
--
-- 【★なぜ】
--   ★牧場の画面（`/stable`）は ★**馬ごとの獲得賞金**を出します（★`StableHorse.prizePP`）。
--   ⚠️ ★いま `my_runs` は ★**着順までしか出しておらず**、★賞金の出どころがありません。
--   🔴 ★出どころが無いまま 0 を出すと、★**「まだ稼いでいない」に見えます**（★嘘です）。
--   → ★`race_entries.prize_pp`（★`0049` で足した列）を、★**本人の行にだけ**出します。
--
-- 【⚠️ ★D-114 に触れないか】
--   ★D-114 は「★強さの手がかりは ★**オッズと戦績**だけ」。★賞金は ★**戦績の一部**です
--   （★着順・出走数を既に出しており、★賞金はそこから決まる公開情報）。
--   ★素質・現在能力・適性の生値は ★**1 つも足していません**。
begin;

create or replace view my_runs as
select
  e.race_id,
  e.horse_id,
  h.name as horse_name,
  r.game_week,
  r.scheduled_at,
  r.name as race_name,
  r.grade,
  r.class_rank,
  r.surface,
  r.distance,
  r.track_condition,
  e.gate,
  e.finish_pos,
  e.finish_time,
  e.margin,
  e.popularity,
  (select count(*) from race_entries x where x.race_id = e.race_id) as field_size,
  -- ★★2026-09-20 に足した列（★0055）。
  -- ⚠️ ★**末尾に足すこと**: ★`create or replace view` は列の名前や順を変えられません
  --    （★実測: `cannot change name of view column "field_size" to "prize_pp"`）。
  e.prize_pp
from race_entries e
  join horses h on h.id = e.horse_id
  join races  r on r.id = e.race_id
where h.owner_id = auth.uid();

revoke all on my_runs from public, anon;
grant select on my_runs to authenticated;

commit;
