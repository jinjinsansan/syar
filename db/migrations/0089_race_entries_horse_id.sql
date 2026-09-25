-- ★**出走表の公開ビューに `horse_id` を足す**（★2026-09-26・毛色を「その馬のもの」にするため）
--   ★裁定 `REVIEW_OWNER_SCOPE_AND_STUD_FEE_20260925.md` §9-1（★9 毛色の焼き直しと実レースの結線）
--   ★簿 `COAT-PALOMINO-WHITE-NOT-BAKED` の ③
--
-- 【🔴 ★なぜ要るか】
--   ★`packages/render/src/coat.ts` の `coatOfHorseId(horseId)` が ★**毛色の唯一の出どころ**です
--   （★`COAT_WEIGHTS` … 鹿毛 30 / 黒鹿毛 16 / 栗毛 16 / 芦毛 10 / 栃栗毛 8 / 青鹿毛 8 / 青毛 6 / 月毛 3 / 白毛 3）。
--   🔴 ★ところが `/race` は ★**枠番から毛色を引いています**（`race/page.tsx` の `COAT_BY_GATE`）。
--     ★だから ★**月毛と白毛が 1 度も画面に出ません**（★18 枠の表に入っていない）。
--     ★焼きは 2026-09-24 に ★9 毛色 91 枚で済んでいます（★簿）。★引く側だけが追いついていません。
--   → ★実レースの馬の毛色を出すには ★**馬 ID** が要ります。
--
-- 【⚠️ ★なぜ SQL 側で毛色を計算しないか】
--   ★`coatOfHorseId` は ★FNV-1a ＋ Murmur3 の仕上げ ＋ `COAT_WEIGHTS` です。
--   ★これを SQL に写すと ★**重みが 2 か所になります**（★D-052 違反・★裁定の条件 ①
--   ★「毛色の重みは coat.ts を唯一の出どころにする」に反する）。
--   → ★**SQL は馬 ID を渡すだけ**。★毛色を決めるのは ★`coat.ts` のまま。
--
-- 【★`owner_id` は出しません（★`0006`・LR-6）】
--   ✔ ★先例: ★`0083_retired_horses_public.sql` は ★**既に `h.id as horse_id` を公開**しています
--     （★他人の引退馬の物語が見える・LR-6）。★だから馬 ID 自体は公開してよい値です。
--   ⚠️ ★公開するのは ★**馬 ID だけ**。★`owner_id` は ★従来どおり出しません。
--
-- 【⚠️ ★`create or replace view` の制約】
--   ★既にある列の ★**名前・型・並び**は変えられません。★新しい列は ★**末尾にだけ**足せます。
--   → ★`0051` の定義をそのまま写し、★`horse_id` を ★**最後**に足します。
--   ★`0051` が最新の定義であることを確かめてから書いています（★`0044` → `0051` の順）。
--
-- ★DB の中身は 1 行も変わりません（★ビューの定義だけ）。

create or replace view race_entries_public as
select
  e.race_id,
  -- 🔴 ★**締切の前は null**（★**DF-3**・2026-09-19）。
  --   ★`fill` が全枠を振り直すので、★**締切の前に見せた枠は嘘になります**。
  --   ★画面は null を「未定」と出します（★0 や 1 と混ぜない）。
  case when r.status = 'announced' then null else e.gate end as gate,
  h.name as horse_name,
  e.strategy,
  e.weight,
  e.popularity,
  case when r.status = 'settled' then e.finish_pos else null end as finish_pos,
  case when r.status = 'settled' then e.finish_time else null end as finish_time,
  coalesce(u.stable_name, s.prefix) as owner_label,
  -- ★これは自分の馬か（★2026-09-19・BT-3）。★anon では常に偽
  (h.owner_id is not null and h.owner_id = auth.uid()) as is_mine,
  -- ★**毛色の素**（★2026-09-26・`0089`）。★毛色そのものは `coat.ts` の `coatOfHorseId` が決めます。
  --   ⚠️ ★枠番から毛色を引かないこと（★枠はその日の枠で、★馬の毛色ではありません）。
  h.id as horse_id
from race_entries e
join races r on r.id = e.race_id
join horses h on h.id = e.horse_id
left join users u on u.id = h.owner_id
left join npc_stables s on s.id = h.npc_stable_id;

comment on view race_entries_public is
  '★出走表の公開ビュー。★owner_id は出さない（`0006`）。★is_mine はサーバーが auth.uid() で判定（BT-3）。'
  '★2026-09-19・D-117（DF-3）: ★status = announced のあいだは gate を null にする — '
  '★fill が全枠を振り直すので、★締切の前に見せた枠は嘘になる（★ED-1 と同じ理由）。'
  '★2026-09-26（`0089`）: ★horse_id を足した — ★毛色は `coat.ts` の coatOfHorseId(horseId) が唯一の出どころで、'
  '★枠番から引くと月毛・白毛が永久に出ない（★簿 COAT-PALOMINO-WHITE-NOT-BAKED ③）。'
  '★重みを SQL に写さないため、★サーバーは馬 ID だけを渡す（D-052）';

grant select on race_entries_public to anon, authenticated;
