-- 0034: 自分の馬を読むビュー（★UI-1 の前提・裁定 `REVIEW_UI_WIRING_VERDICT_20260918.md`）
--
-- 【★なぜ要るか】
--   ★`horses` は登録簿で **CLOSED** です（★`potential` / `genotype` を持つため・§12.4）。
--   → ★**厩舎・育成・出走登録の画面は、自分の馬を 1 頭も読めません。**
--   ★正典 410 行の作法どおり、★**残高を持つ表にポリシーを足すのではなく、別ビューを作ります。**
--
-- 【★出す／出さないの線】（★裁定が決めたもの。★開発側では決めていません）
--   ✅ 出す  … 血統（`sire_line` ほか・★§1.1「血をつなぐ」が中核。★血統は素質ではない）
--              調子・疲労（§7.4）／年齢・キャリアの残り／繁殖の回数／厩舎の格／G1 勝利数
--   🔴 出さない … `genotype` / `potential` / ★**`stats`** / `unlock_rate` / 適性の生値 /
--              `growth` / `temper` / `durability` / `frail` / `skill_genes` /
--              `inbreed_coeff` / `nicks_multiplier` / ★**`birth_snapshot`**
--
-- 🔴 ★**`stats` を出さない理由がいちばん大事です**（★裁定の言葉をそのまま残します）:
--   ★**オッズは `stats` から作られます**（`apps/worker/src/build-race.ts` の `abilityOf`）。
--   ★**数値で出せば、オッズを見る意味が消え、D-114 の設計そのものが無効になります。**
--   ★`potential × unlock_rate = stats` なので ★**`unlock_rate` も出せません**（★割り戻せる）。
--
-- ⚠️ ★**`birth_snapshot` は誕生時の `potential`/`stats`/`durability`/`temper` の写し**です
--    （✔ `0012_birth_snapshot.sql:19` の註記）。★**素質そのものなので出せません。**
--
-- 【★発見度（D-108）について】
--   ★列は要りません。★`discoveryStageOf(relevantRuns)` は**その条件での出走回数**から決まる純関数で
--   （✔ `packages/sim-engine/src/discovery.ts:35`）、★**戦績から計算できます。**
--
-- 【★絞り方】
--   ★`where owner_id = auth.uid()`（★`users` と同じ考え方。★他人の馬は 1 行も返しません）。
--   ★`authenticated` にだけ `select` を与えます（★`anon` には与えません）。

begin;

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
  h.created_at
from horses h
where h.owner_id = auth.uid();

comment on view my_horses is
  '★自分の馬（UI-1・裁定 REVIEW_UI_WIRING_VERDICT_20260918）。★horses は CLOSED なので、'
  '★出してよい列だけを選んだビューを作る（正典 410 行の作法）。'
  '🔴 potential / genotype / stats / unlock_rate / 適性の生値 / birth_snapshot は出さない — '
  '★オッズは stats から作られるので、数値で出すと D-114（強さの手がかりはオッズと戦績だけ）が無効になる。'
  '★列を足すときは apps/cli/test/my-horses-view.test.ts が分類を要求する';

-- ★anon には出さない（★`0018` の既定は閉じている。★念のため明示的に剥がす）
revoke all on my_horses from public, anon;
grant select on my_horses to authenticated;

commit;
