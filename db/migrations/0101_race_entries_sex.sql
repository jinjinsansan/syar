-- ★**出走表の公開ビューに 性別を足す**（★2026-10-02・オーナー「牝馬戦では さすがにメスの馬の絵が必要」）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。★順は ★移行 → 画面（★画面が この列を読む前に 適用する）。
--
-- 【★なぜ】
--   ★小窓テレビのパドック・出走馬の紹介で ★牝馬は牝馬の絵を出す。★テレビは出走表を ★race_entries_public から読むが、
--   ★性別の列が無かった。★性別は 公開して差し支えない属性（★出馬表に「牝3」と出している）。
--
-- 【★変えないこと】
--   ★既存の列・条件・権限は 0098 のまま（★末尾に h.sex を 1 列足すだけ）。

begin;

create or replace view race_entries_public as
select
  e.race_id,
  case when r.status = 'announced' then null else e.gate end as gate,
  h.name as horse_name,
  e.strategy,
  e.weight,
  e.popularity,
  -- ★着順は ★確定なら race_entries から ／ ★確定前でも 発走時刻を過ぎていれば ① の表から（★段と時刻を「かつ」で・0098）
  case
    when r.status = 'settled' then e.finish_pos
    when r.status = 'scheduled' and r.scheduled_at <= now() then lr.finish_pos
    else null
  end as finish_pos,
  case
    when r.status = 'settled' then e.finish_time
    when r.status = 'scheduled' and r.scheduled_at <= now() then lr.finish_time
    else null
  end as finish_time,
  coalesce(u.stable_name, s.prefix) as owner_label,
  (h.owner_id is not null and h.owner_id = auth.uid()) as is_mine,
  h.id as horse_id,
  -- ★性別（★0101・牝馬の絵を出し分ける）。★列は末尾に足す（★`create or replace view` は 既存の列の順を変えられない）
  h.sex
from race_entries e
join races r on r.id = e.race_id
join horses h on h.id = e.horse_id
left join race_live_results lr on lr.race_id = e.race_id and lr.gate = e.gate
left join users u on u.id = h.owner_id
left join npc_stables s on s.id = h.npc_stable_id;

comment on view race_entries_public is
  '★出走表の公開ビュー。★owner_id は出さない（`0006`）。★is_mine はサーバーが auth.uid() で判定（BT-3）。'
  '★2026-09-19・D-117（DF-3）: ★status = announced のあいだは gate を null にする。'
  '★2026-09-26（`0089`）: ★horse_id を足した（★毛色は coatOfHorseId）。'
  '★2026-09-29（`0098`）: ★着順は 確定なら race_entries・★確定前でも発走時刻を過ぎていれば race_live_results（★段と時刻を「かつ」で）'
  '★2026-10-02（`0101`）: ★性別 sex を足した（★牝馬の絵）。';

grant select on race_entries_public to anon, authenticated;

commit;
