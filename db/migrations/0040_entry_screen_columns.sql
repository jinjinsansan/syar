-- 0040: `/entry` を本番データに繋ぐために足りない列（★EF-5・出走資格の判定）
--       ★裁定 `REVIEW_EF_AND_WEEK_VERDICT_20260919.md`
--
-- ============================================================================
-- 【★何が足りなかったか】✔ 画面を繋ごうとして数えました
--
--   | 画面が要るもの | 出どころ |
--   |---|---|
--   | 発走時刻・格・馬場・距離・状態・出走料・斤量 | ✔ `races_public`（`0035`・`0039`）|
--   | 出走頭数 | ✔ `race_entries_public` を数えれば出る |
--   | 🔴 **R 番号** | ★`slotOfDay(cycleIndex)` から導けるが、★**`cycle_index` が公開ビューに無い** |
--   | 🔴 **その馬の勝利数** | ★`enter_race` は数えるが、★**画面が数える口が無い**<br>★`race_entries` は `CLOSED`、★`race_entries_public` に **`horse_id` が無い** |
--
-- ⚠️ 🔴 ★**`my_horses` の列は `0034` の本文をそのまま取ってきています**。
--    ★最初は記憶で書き、★**存在しない列を 6 つ発明していました**
--    （`coat_color`・`birth_snapshot_taken`・`stable_id`・`training_menu`・`sex_restricted`・`stud_fee`）。
--    ★`enter_race` で同じことをやった **1 時間後**です。★差分を取って気づきました。
--    → ★**既存の定義を置き換えるときは、必ず本文を取ってきて差分を見る。**
--    ★なお `coat_color` が無いこともここで確かめました（★UI1-8 の報告と一致）。
--
-- 【★① R 番号 — **導けるようにする**（EF-5）】
--   ★裁定: 「★R 番号は `slotOfDay` から導けるので出どころを 1 か所に」。
--   → ★**数を保存しません**。★`cycle_index` を公開ビューに出し、
--     ★画面が `slotOfDay(cycleIndex)`（`packages/scheduler/src/programme.ts`）を呼びます。
--   ⚠️ ★**`race_no` の列を足さないこと** — ★足すと ★**`slotOfDay` と 2 か所**になります（D-052）。
--   ★`cycle_index` を出してよい理由: ★番組表は §12.2 で**未ログインでも見える**もので、
--     ★発走時刻が既に公開されている以上、★**新しい情報を 1 つも足しません**。
--
-- 【★② 勝利数 — **戦績は見せてよいもの**】
--   ★**D-114**: 「★強さの絶対値を推し量る手がかりは ★**オッズと戦績だけ**とする」
--   → ★**勝利数は「見せてよい」側**です。★`my_horses` に足します。
--   ⚠️ ★**数え方は `enter_race` と同じ**でなければいけません（★`finish_pos = 1`）。
--      ★違う数え方をすると、★**画面が「出られる」と言った馬が RPC に弾かれます**
--      （★CL-4 が禁じた「押してから弾かれる」形）。
--   ⚠️ ★`horses.g1_wins` とは別物です（★あちらは **G1 だけ**・`0001:138`）。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① `races_public` に `cycle_index` を出す（★EF-5）
-- ---------------------------------------------------------------------------
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
  r.seed_commit,
  case when r.status in ('settled', 'cancelled') then r.seed_reveal else null end as seed_reveal,
  r.status,
  r.purse,
  r.min_wins,
  r.max_wins,
  r.entry_fee_ep,
  r.weight_kg,
  -- ★R 番号のもと（★2026-09-19・EF-5）。★画面が `slotOfDay()` で導く。★数は保存しない
  r.cycle_index
from races r;

comment on view races_public is
  '★番組表の公開ビュー（§12.2）。★2026-09-18・CL-4 で min_wins / max_wins、'
  '★2026-09-19・EF-3 で entry_fee_ep / weight_kg、★EF-5 で cycle_index を足した。'
  '★R 番号は slotOfDay(cycle_index) で導く — ★race_no の列を足すと slotOfDay と 2 か所になる（D-052）。'
  '★seed_reveal は確定後だけ（§8.6）';

grant select on races_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ② `my_horses` に勝利数と出走数を出す（★D-114「手がかりは戦績」）
-- ---------------------------------------------------------------------------
--   ⚠️ ★`0034` は書き換えません（★適用済み）。★`create or replace view` で置き換えます。
--   ⚠️ ★**列の並びと名前は `0034` のまま**で、★末尾に 2 列足すだけです。
create or replace view my_horses as
select
  h.id,
  h.owner_id,
  h.name,
  h.sex,
  -- ★血統（★§1.1 の中核。★素質ではない）
  h.generation,
  h.sire_id,
  h.dam_id,
  h.sire_line,
  h.dam_sire_line,
  h.pedigree_cache,
  -- ★年齢・キャリア
  h.birth_year,
  h.birth_week,
  h.last_processed_week,
  h.rest_until_week,
  h.career_ended,
  h.retired_at_week,
  h.retirement_reason,
  h.retirement_role,
  -- ★調子・疲労（§7.4）
  h.condition,
  h.fatigue,
  -- ★厩舎の格（D-103）
  h.stable_grade,
  -- ★戦績（★D-114 が名指しした手がかり。★残りは race_entries から数える）
  h.g1_wins,
  -- ★繁殖
  h.foal_count,
  h.coverings_this_year,
  h.bred_this_year,
  h.created_at,
  /**
   * ★**勝利数**（★2026-09-19）。★`enter_race` と ★**同じ数え方**（`finish_pos = 1`）。
   * ⚠️ ★違う数え方にすると、★**画面が「出られる」と言った馬が RPC に弾かれます**（CL-4）。
   * ⚠️ ★`h.g1_wins` とは別物です（★あちらは **G1 だけ**・`0001:138`）。
   */
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos = 1) as wins,
  /** ★出走数（★確定した分だけ。★登録しただけ・取消は `finish_pos` が null なので入りません） */
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos is not null) as starts
from horses h
where h.owner_id = auth.uid();

comment on view my_horses is
  '★自分の馬（`0034`）。★2026-09-19 に wins / starts を足した — ★D-114 が「強さの手がかりはオッズと戦績だけ」'
  'と定めており、★戦績は見せてよい側。★数え方は enter_race と同じ finish_pos = 1（★違うと「押してから弾かれる」）。'
  '★素質・現在能力・適性の生値は 1 つも出さない（★apps/cli/test/my-horses-view.test.ts が全列の分類を要求する）';

revoke all on my_horses from public, anon;
grant select on my_horses to authenticated;

commit;
