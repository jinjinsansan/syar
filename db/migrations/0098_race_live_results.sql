-- ★**発走時刻から 結果の映像を流す**（★2026-09-29・オーナー「小窓は発走時刻になったら自動的にレースを放映して欲しい」・レビュー側 B）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。★順は ★移行 → ワーカー → 画面（★手順書 ⑥・⑦）。
--
-- 【🔴 ★なぜ】
--   ★着順は ★発走の後の周の頭で ★確定（settleRace）と同時に書かれ、★画面は それを見てから映像を用意していた
--   → ★小窓は ★発走 +75 秒から「録画」として流れていた（★発走の瞬間は 走る絵が無い）。
--
-- 【★形 — 決めると締めるを 2 段に割る】
--   ① 決める（★発売締切の後・発走の前）: ★ワーカーが settleRace と同じ計算（★同じ種・決定論）をして ★**この表にだけ**書く。
--      ★races.status は scheduled のまま。★race_entries.finish_pos・seed_reveal・bets・PP には ★**触れない**。
--   ② 締める（★映像が終わった後）: ★いまの settleRace のまま（★着順を race_entries に・seed_reveal・払戻・賞金・記録）。
--   ★締切（`sales_close_lead_seconds()`）の後にしか ① を走らせないので ★**賭けが結果に触れられない**（★照合はむしろ強まる）。
--
-- 【🔴 ★公開の条件（★段と時刻を「かつ」で）】
--   ★race_entries_public の着順は ★settled なら race_entries から、★scheduled かつ 発走時刻を過ぎていれば この表から、★それ以外は null。
--   ★中止（cancelled）・公示（announced）・発走前は ★どちらにも当たらない ＝ ★出ない。
--   ⚠️ ★着順を読む他の口（horse_starts・horse_wins・my_runs・my_horse_discovery_runs・initial_horse_candidates・ワーカーの直読み 5 か所）は
--      ★race_entries.finish_pos を読むので ★② まで何も変わらない（★1 行も触らない）。
--
-- ⚠️ ★ビューは ★`0089` の定義をそのまま写し、★着順の 2 列の式だけを変える（★列の名前・型・並びは変えない）。
-- ---------------------------------------------------------------------------
begin;

create table if not exists race_live_results (
  race_id uuid not null references races (id),
  gate int not null,
  finish_pos int not null,
  finish_time numeric not null,
  resolved_at timestamptz not null default now(),
  primary key (race_id, gate)
);

comment on table race_live_results is
  '★① 決めた着順（★2026-09-29・0098）。★発売締切の後にワーカーが書く。★公開は race_entries_public が 発走時刻を過ぎてから。'
  '★確定（② settleRace）は race_entries に書く — ★ここは発走の映像のためだけ';

alter table race_live_results enable row level security;
revoke all on table race_live_results from public, anon, authenticated;

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
  h.id as horse_id
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
  '★2026-09-29（`0098`）: ★着順は 確定なら race_entries・★確定前でも発走時刻を過ぎていれば race_live_results（★段と時刻を「かつ」で）';

grant select on race_entries_public to anon, authenticated;

commit;
