-- 0043: 市場・厩舎の格・物語帳の公開ビュー 3 本（★UI-3）
--       ★裁定 `REVIEW_ANON_EXPOSURE_VERDICT_20260918.md` が予告した「次の番」
--
-- ============================================================================
-- 【★経緯 — ★閉じたのはビューを作るまでの措置でした】
--   ★`0018:52` が ★**「実体テーブルには一切 grant しない。公開は `*_public` ビューにだけ」**と宣言。
--   🔴 ★その後に足された 3 表が ★**`grant select` で anon に開いていました**（`0024`/`0025`/`0027`）。
--   ★`0032`（AE-1）で ★**閉じました**。★裁定はそのとき、★**「公開が要るようになった今、
--     ★`*_public` ビューを作る番です（★正典 410 行の形）」**と書いています。
--   → ★**この移行がその「番」**です。
--
-- 【★出す列の決め方 — ★`0034`（`my_horses`）と同じ作法】
--   ★**既定を閉じて、必要なものだけ開けます**（R-29）。
--   ★**出す理由を 1 列ずつ書きます**。★検査（`apps/cli/test/ui3-public-views.test.ts`）が
--   ★**全列の分類**を要求します。
--
-- 【🔴 ★素質は 1 ビットも出しません（D-114）】
--   ★`horse_market_listing` は `0036` で ★**`stars` 列を落としました**。
--   ★買う人に見えるのは ★**馬そのもの（戦績・オッズ）と価格**だけです。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 馬の出品（★D-102）
-- ---------------------------------------------------------------------------
--   ★出す列と理由:
--     `horse_id`     … ★どの馬か。★`horses` は CLOSED のままなので、★これだけでは中身は見えません
--     `price_ep`     … ★払う額（★サーバーが書いた値。★利用者は申告できない・憲法 3）
--     `sell_back_ep` … ★手放したときに戻る額（★D-102 ③「買った額より十分小さく」を**数字で明示**）
--   ★出さない列と理由:
--     `id` / `created_at` … ★内部の識別子と時刻。★画面に要らない
--     `active`            … ★**行の有無で表す**（★下の `where` で絞る。★false の行は返さない）
--   ⚠️ ★`stars` は列ごとありません（`0036`・D-114 ②）。
create or replace view horse_market_listing_public as
select
  l.horse_id,
  l.price_ep,
  l.sell_back_ep
from horse_market_listing l
where l.active;

comment on view horse_market_listing_public is
  '★馬の出品の公開ビュー（D-102・★2026-09-19・UI-3）。★active な行だけを返す（★「出ていない」は行の有無で表す）。'
  '★素質の段は 1 ビットも出さない（★0036 で stars 列ごと落とした・D-114 ②）。'
  '★価格はサーバーが書いた値で、利用者は申告できない（憲法 3）';

grant select on horse_market_listing_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ② 厩舎の格の値段（★D-103 ④）
-- ---------------------------------------------------------------------------
--   ★出す列と理由:
--     `grade`    … ★どの格か（silver / gold）
--     `price_ep` … ★1 段上げるのに要る EP（★サーバーが `@star/training` の値から書く）
--   ★出さない列と理由:
--     `updated_at` … ★いつ書き換わったかは運用の記録。★画面に要らない
create or replace view stable_grade_price_public as
select
  p.grade,
  p.price_ep
from stable_grade_price p;

comment on view stable_grade_price_public is
  '★厩舎の格の値段の公開ビュー（D-103 ④・★2026-09-19・UI-3）。'
  '★値段はサーバー（ワーカー）が @star/training の GRADE_UNLOCK_EP から書き、RPC はその行の値で払わせる。'
  '★画面が値段を持つと三重帳簿になる（★EF-2 で片付けたのと同じ形）';

grant select on stable_grade_price_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ③ 生涯の記録（★§18・LR-6）
-- ---------------------------------------------------------------------------
--   ★**LR-6**: 「★**他人の馬の物語も見える**」→ ★`anon` にも開けます。
--   ★出す列と理由:
--     `horse_id`   … ★どの馬の物語か
--     `event_type` … ★出来事の種類（★`@star/training` の `StoryEventType` と同じ語）
--     `game_week`  … ★ゲーム内の週（★実時刻ではない・憲法 4）
--     `race_id`    … ★そのときのレース（★`races_public` と突き合わせられる）
--     `detail`     … ★着順・レース名・騎手名・判明した適性・産駒の馬名
--   ★出さない列と理由:
--     `id`         … ★内部の識別子。★並びは `game_week` と `race_id` で足ります
--     `created_at` … ★実時刻。★§18 はゲーム内の週で語るもので、★出すと**実時刻が混ざります**
--
--   ⚠️ 🔴 ★**`detail` に持ち主の情報が入っていないこと**が前提です。
--      ✔ 確かめました: `packages/training/src/story.ts:42` が
--        「★`detail` に入れてよいのは**ゲームの中の値だけ**（着順・馬名・レース名・騎手名・週）」と定め、
--        ★型（`StoryEvent`）にも持ち主の欄がありません。
--      ⚠️ ★**型が守っているだけ**なので、★検査で「持ち主の語が入っていないこと」も見ます。
create or replace view horse_story_event_public as
select
  e.horse_id,
  e.event_type,
  e.game_week,
  e.race_id,
  e.detail
from horse_story_event e;

comment on view horse_story_event_public is
  '★生涯の記録の公開ビュー（§18・LR-6「他人の馬の物語も見える」・★2026-09-19・UI-3）。'
  '★created_at（実時刻）は出さない — §18 はゲーム内の週で語るもので、出すと実時刻が混ざる。'
  '★detail に持ち主の情報は入らない（packages/training/src/story.ts の StoryEvent が型で縛る）';

grant select on horse_story_event_public to anon, authenticated;

commit;
