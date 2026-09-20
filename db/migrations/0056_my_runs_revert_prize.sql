-- 0056: my_runs を 0046 の定義へ戻す（★0055 を取り消す）
--
-- ============================================================================
-- 🔴 【★なぜ戻すか — ★私が 2 つ壊しました（2026-09-20）】
--
--   ★`0055` で `my_runs` に `prize_pp` を足しました。★検査が 2 つ 止めました。
--
--   ★① ★**既存の決定に反していました**（★`PR-1`）
--     ★`apps/cli/test/ui4-screen-wiring.test.ts:199`:
--       「★`pp_ledger.ref_id` は `race_id` で、★同じレースに 2 頭出すと分けられない。
--        ★さらに ★**NPC 馬には `pp_ledger` の行が立たない**。
--        → ★**PR-1 で `race_entries` に一次資料を置くまで出さない**」
--     ⚠️ ★私は ★**「賞金は戦績の一部だから出してよい」と自分で判断**しました。
--       ★★決まっていたことを、★読まずに上書きしました。
--
--   ★② 🔴 ★**元のビューの条件を落としていました**
--     ★`0046` の `where` は ★**`h.owner_id = auth.uid() and e.finish_pos is not null`**。
--     ★私は ★**前半しか読まずに書き直し**、★`finish_pos is not null` を消しました。
--     → ★★**登録しただけ・取消の行が「走った」に混ざる**ところでした
--       （★`my_horses.starts` と数が合わなくなる）。
--     ★★**部分だけ読んで書き直した**のが原因です。★今日 2 度目です。
--
-- ✅ ★下は ★**`0046` の定義そのまま**（★機械で切り出して貼りました。★手で写していません）。
-- ============================================================================
begin;

-- ⚠️ ★`create or replace view` は ★**列を減らせません**
--   （★実測: `cannot drop columns from view`）。★一度 落としてから作り直します。
--   ★`my_runs` に依存しているものは在りません（★依存が在れば、この drop で落ちます）。
drop view if exists my_runs;

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
  (select count(*) from race_entries x where x.race_id = e.race_id) as field_size
from race_entries e
  join horses h on h.id = e.horse_id
  join races  r on r.id = e.race_id
where h.owner_id = auth.uid()
  and e.finish_pos is not null;

comment on view my_runs is
  '★自分の馬の確定した出走（★UI-4・2026-09-19）。★確定した走りだけ（finish_pos is not null）— ★登録しただけ・取消は入らない。'
  '★数え方は my_horses.starts と同じ（★違う数え方にすると「戦績 12 なのに 11 行しかない」になる）。'
  '★1 走あたりの賞金 PP は出していない — ★pp_ledger.ref_id は race_id で、同一レースに 2 頭出すと分けられない（★照会中）。'
  '★素質・現在能力・適性の生値は 1 つも出さない（D-114）';

revoke all on my_runs from public, anon;
grant select on my_runs to authenticated;

commit;
