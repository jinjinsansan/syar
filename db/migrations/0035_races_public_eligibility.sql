-- 0035: 公開ビューに出走資格の範囲を出す（★CL-4 の「画面側にも出す」を満たすため）
--       ★指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md` **CL-4**
--       「★**画面側にも『このレースには出られません』を出す**（★黙って弾かない・R-27）」
--
-- 【★なぜ要るか】
--   ★`0033` で `races.min_wins` / `max_wins`（出走資格）を足しましたが、
--   ★**公開ビュー `races_public` に出していませんでした。**
--   → ★**画面は「この馬がこのレースに出られるか」を判定できません。**
--   → ★押してから RPC に弾かれるだけになり、★CL-4 が禁じた「黙って弾く」形になります。
--
-- 【★出してよい理由】
--   ✔ ★**`class_rank` は既に公開しています**（`0002:46`）。★`min_wins` / `max_wins` は
--     ★**そのクラスの言い換え**であり、★新しい情報を 1 つも足しません
--     （★段の定義は `packages/scheduler/src/eligibility.ts` の 1 か所・D-052）。
--   ✔ ★素質にも seed にも触れません（★D-114・§8.6）。
--
-- ⚠️ ★`0002` は書き換えません（★`migrate.mjs` が適用済みファイルの改変を拒みます）。
--    ★`create or replace view` で列を**足すだけ**です（★既存の列の順序と名前は変えません）。

begin;

create or replace view races_public as
select
  r.id,
  r.name,
  r.grade,
  r.class_rank,
  r.surface,
  r.distance,
  r.track_condition,
  r.course_id,
  r.scheduled_at,
  -- ★commit は発走前に公開する（§8.6 の要件そのもの）
  r.seed_commit,
  -- ★reveal は確定後だけ。ここが漏れると Provably Fair が無意味になる
  case when r.status in ('settled', 'cancelled') then r.seed_reveal else null end as seed_reveal,
  r.status,
  r.purse,
  -- ★出走資格の範囲（★2026-09-18・`0033`・CL-4）。★class_rank の言い換えで、新しい情報を足さない
  r.min_wins,
  r.max_wins
from races r;

comment on view races_public is
  '★番組表の公開ビュー（§12.2）。★2026-09-18・CL-4 で min_wins / max_wins を足した — '
  '★画面が「この馬はこのレースに出られるか」を判定できないと、押してから RPC に弾かれるだけになる（R-27）。'
  '★class_rank が既に公開なので、新しい情報は足していない。★seed_reveal は確定後だけ（§8.6）';

grant select on races_public to anon, authenticated;

commit;
