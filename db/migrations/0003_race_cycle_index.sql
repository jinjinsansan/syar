-- STAR 0003 — races にサイクル番号を持たせる（A-2 の一意性の担保）
--
-- ★これが無いと「同じサイクルのレースを二重に作らない」を DB で保証できません。
--   アプリ側の存在確認だけに頼ると、確認と挿入の間に割り込まれて二重になります。
--   一意制約が最後の砦です。

begin;

alter table races add column if not exists cycle_index bigint;
-- ★部分一意インデックス: 既存行（cycle_index が null）を壊さずに一意性を課す
create unique index if not exists races_cycle_index_uniq
  on races (cycle_index) where cycle_index is not null;

commit;
