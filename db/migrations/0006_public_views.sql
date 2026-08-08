-- STAR 0006 — 読み取り用の公開ビュー（正典 §14.3・§12）
--
-- ★anon に見せてよい列だけを出します。実体テーブルは引かせません。
--   A-4 で races について実証した形を、出馬表とオッズにも適用します。

begin;

-- ============================================================================
-- 出馬表
-- ============================================================================
-- ★確定前に見せてはいけないもの:
--    finish_pos / finish_time … 結果そのもの
--    intervention_log        … §8.8 の一次資料（他人の操作が見える）
--    cap_violations          … 運営の内部記録
--   → 確定後だけ着順を出し、介入ログと内部記録は**そもそも列に含めません**。
create or replace view race_entries_public as
select
  e.race_id,
  e.gate,
  h.name as horse_name,
  e.strategy,
  e.weight,
  -- 人気はモンテカルロ勝率順位（§9.2）。発売前から見せてよい
  e.popularity,
  -- ★確定後だけ着順を出す
  case when r.status = 'settled' then e.finish_pos else null end as finish_pos,
  case when r.status = 'settled' then e.finish_time else null end as finish_time,
  -- 所有者名（★NPC は厩舎の冠名を出す。owner_id は出さない）
  coalesce(u.stable_name, s.prefix) as owner_label
from race_entries e
join races r on r.id = e.race_id
join horses h on h.id = e.horse_id
left join users u on u.id = h.owner_id
left join npc_stables s on s.id = h.npc_stable_id;

grant select on race_entries_public to anon, authenticated;
revoke all on race_entries from anon, authenticated;

-- ============================================================================
-- オッズ（§9.2）
-- ============================================================================
-- ★probability（モンテカルロ実測の的中確率）は出しません。
--   オッズから逆算はできますが、生の確率を出すと「運営の見立て」を
--   そのまま配ることになり、§9.2 が固定オッズにした趣旨から外れます。
create or replace view race_odds_public as
select race_id, bet_type, selection, odds, capped
from race_odds;

grant select on race_odds_public to anon, authenticated;
revoke all on race_odds from anon, authenticated;

-- ★horses も直接は引かせない（genotype や potential が見えると素質が丸見えになる。
--   §5.5「素質はプレイヤー非公開」）
revoke all on horses from anon, authenticated;

commit;
