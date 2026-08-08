-- STAR 0004 — cycle_index の一意インデックスを部分指定なしに直す
--
-- ★0003 では `where cycle_index is not null` の**部分**一意インデックスにしたが、
--   `on conflict (cycle_index)` は部分インデックスを推論できず
--   「there is no unique or exclusion constraint matching the ON CONFLICT specification」
--   で落ちた。
--   Postgres は **NULL 同士を重複と見なさない**ので、部分条件はそもそも不要だった。

begin;
drop index if exists races_cycle_index_uniq;
create unique index races_cycle_index_uniq on races (cycle_index);
commit;
