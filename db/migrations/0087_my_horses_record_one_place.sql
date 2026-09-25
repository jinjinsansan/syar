-- ---------------------------------------------------------------------------
-- ★**`my_horses` の戦績も、関数 1 つに寄せる**（★D-052・★`0086` の続き）
-- ---------------------------------------------------------------------------
--
-- 【★なぜ別の移行にしたか】
--   ★`0086` は ★**staging に適用済み**です。★適用済みの移行は書き換えられません
--   （★`tools/migrate.mjs` がチェックサムで正しく拒みます）。→ ★追記します。
--
-- 【🔴 ★なぜ 4 か所目が見つかったか】
--   ★レビュー側の追加条件は ★**3 か所**（`0075` / `0083` / `0085`）でした。
--   ★網（`apps/cli/test/horse-record-one-place.test.ts`）を ★**いま効いている定義だけ**に絞ったら、
--   ★**`view my_horses`（`0040`）**が挙がりました。★誰も数えていなかった 4 か所目です。
--   ⚠️ ★最初 網を ★**移行の全部**に当てたので、★歴史（`0074`・`0075`・`0083`・`0085`）まで挙がり、
--      ★本物の 1 件が ★**紛れていました**。★「最後の定義だけ」に絞って初めて見えました。
--
-- 【🔴 ★ここを揃えないと起きること（★正典 CL-4）】
--   ★`my_horses` の註記が自分でこう書いています:
--     「★`enter_race` と ★**同じ数え方**（`finish_pos = 1`）。
--      ⚠️ ★違う数え方にすると、★**画面が「出られる」と言った馬が RPC に弾かれます**」
--   → ★画面（`my_horses`）と RPC（`enter_race`）が ★**別々に数えている**のが現状です。
--     ★この移行で ★画面側を関数に寄せます。
--   ⚠️ 🔴 ★**`enter_race` はまだ自分で数えています。** ★そちらも寄せるべきかは ★レビュー側に出しました
--      （★私は「寄せるべき」と考えています。★`stable` な関数を書き込みの経路から呼ぶのは Postgres では普通で、
--      ★最初に私が書いた「意味が変わる」という理由は ★**誤りでした**）。
--
-- ⚠️ ★**中身は `0040` と同一で、★変えたのは戦績の 2 行だけ**です。
-- ---------------------------------------------------------------------------
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
  h.created_at,
  /**
   * ★**勝利数**。★数え方は ★`horse_wins()`（`0086`）に寄せました（★2026-09-25）。
   * ⚠️ ★`enter_race` と ★**同じ数え方でなければなりません**（★CL-4）。
   *    ★違うと ★**画面が「出られる」と言った馬が RPC に弾かれます**。
   * ⚠️ ★`h.g1_wins` とは別物です（★あちらは **G1 だけ**・`0001:138`）。
   */
  horse_wins(h.id) as wins,
  /** ★出走数（★確定した分だけ。★`horse_starts()`・`0086`） */
  horse_starts(h.id) as starts
from horses h
where h.owner_id = auth.uid();

comment on view my_horses is
  '★自分の馬（`0034`）。★2026-09-19 に wins / starts を足した — ★D-114 が「強さの手がかりはオッズと戦績だけ」'
  'と定めたため。★2026-09-25: ★戦績の数え方を horse_wins / horse_starts（0086）に寄せた（D-052）。'
  '⚠️ ★enter_race と同じ数え方であること（★CL-4。★違うと画面と RPC が食い違う）';

commit;
