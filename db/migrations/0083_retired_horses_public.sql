-- ---------------------------------------------------------------------------
-- ★**引退馬の公開の一覧**（★正典 **LR-6**・§18・§1.4-4）
--    ★裁定 `REVIEW_RETIRED_SCREEN_PORTS_20260925.md` §4（2026-09-25・レビュー側が範囲を確定）
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★なぜ要るか — ★正典に在るのに渡す側が無かった】
--   ★正典 **LR-6**（`:2265`）: 「★**他人の馬の物語も見える**（§1.4-4 共通世界の社会性）。
--   ★ただし ★**持ち主の個人情報は出さない**（★**表示名・牧場名まで**）」
--   ✔ ★物語のほうは ★既に公開されています（`horse_story_event_public`・`0043`）。
--   🔴 ★しかし ★**引退馬の一覧は `my_retired_horses()`（自分の分だけ）しか在りませんでした。**
--     → ★`/stable/retired`（馬物語帳）は ★他人の馬を ★**1 頭も出せません**でした。
--     ★2026-09-25 まで、そこは ★**見本のデータ**で埋まっていました（★本物だと思わせる形）。
--   → ★**D-119 の族**（★決めた・画面は出す・★渡す側が無い）。★今日 5 例目です。
--
-- 【★出す列・出さない列は ★裁定 §4 が決めました】（★私が決めていません）
--   ✅ 出す: ★馬の名前／性別／生年（週）／★**戦績の事実**（出走数・勝数・重賞勝ち数）／
--            ★父と母の名前（血統）／★**牧場名**（★LR-6 の上限）／★引退した週・役割
--   🔴 出さない: ★素質・能力・現在値・遺伝子・発見度の段（★**D-114**）／
--            ★利用者の表示名・メール・`user_id`（★**LR-6**）
--   ⚠️ ★`users.display_name` は ★**1 文字も出しません**。★出すのは `users.stable_name` だけです。
--
-- 【★条件（★裁定 §4）】
--   ★① 並び順と件数は ★**決定論**（★同じ入力で同じ結果・★件数の上限を持つ）
--   ★② `anon` にも開けてよい（★`horse_story_event_public` と同じ扱い）
--   ★③ ★**見本の行を混ぜない**
--   ★④ ★口が出来たら ★釘と画面の「準備しています」を ★**同じ便で**外す
--
-- 【⚠️ ★戦績の数え方を 2 通りにしない】
--   ★`my_retired_horses()`（`0075`）と ★**同じ式**を使います:
--     ★勝数 … `finish_pos = 1` ／ ★出走数 … `finish_pos is not null`
--   ★片方だけ直すと、★自分の馬と他人の馬で ★**違う戦績**が出ます（★D-052）。
--   → ★`apps/cli/test/retired-public-view.test.ts` が ★2 つの式を突き合わせます。
-- ---------------------------------------------------------------------------
begin;

create or replace view retired_horses_public as
select
  h.id as horse_id,
  h.name as horse_name,
  h.sex as horse_sex,
  h.birth_week as horse_birth_week,
  h.retired_at_week,
  h.retirement_role,
  h.foal_count,
  h.g1_wins,
  -- ⚠️ ★`my_retired_horses()`（`0075`）と ★**同じ式**（★二重管理にしない）
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos = 1) as wins,
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos is not null) as starts,
  (select s.name from horses s where s.id = h.sire_id) as sire_name,
  (select d.name from horses d where d.id = h.dam_id) as dam_name,
  /**
   * ★**牧場名まで**（★LR-6 の上限）。
   * ⚠️ ★`u.display_name` を ★**足さないこと**。★持ち主が誰かは出しません。
   * ★持ち主がいない馬（★NPC）は `null` になります（★「どこの馬でもない」が正しい）。
   */
  (select u.stable_name from users u where u.id = h.owner_id) as stable_name
from horses h
where h.retired_at_week is not null;

comment on view retired_horses_public is
  '★引退馬の公開の一覧（★正典 LR-6「他人の馬の物語も見える／持ち主の個人情報は出さない」・'
  '★裁定 REVIEW_RETIRED_SCREEN_PORTS_20260925.md §4・2026-09-25）。'
  '★出すのは牧場名まで（★display_name は 1 文字も出さない）。'
  '★素質・能力・発見度は出さない（D-114）。'
  '★戦績の式は my_retired_horses()（0075）と同じ — ★retired-public-view.test.ts が突き合わせる';

-- ★② `anon` にも開ける（★`horse_story_event_public` と同じ扱い）
grant select on retired_horses_public to anon, authenticated;

commit;
