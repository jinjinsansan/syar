-- ---------------------------------------------------------------------------
-- ★**市場の出品に、馬の名前と戦績を付ける**（★D-102 ③・D-114）
--    ★`buy_horse` の入口を作る前に要る読む口（★レビュー側 承認の 3 条件 ③「動いてから入口」）
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★なぜ要るか】
--   ★`buy_horse`（`0070`）は ★**動きます**（✔ staging で 20 件 確認・`tools/verify-buy-horse.mjs`）。
--   🔴 ★しかし ★**画面に出せません** — ★`horse_market_listing_public`（`0043`）が返すのは
--     ★`horse_id` / `price_ep` / `sell_back_ep` の ★**3 列だけ**で、★**馬の名前が在りません**。
--   ✔ ★`horses` は ★`anon` に閉じています（★実測: `permission denied for table horses`）。
--   → ★**名前の無い馬を「買いますか」と出すことになります。**
--
-- 【★出してよい根拠（★私が決めた線ではありません）】
--   ✔ ★**D-102 ③**（★2026-09-18・T-11 の改訂）: 「★**走った実績のある馬だけ買える**。
--     ★候補は `is_initial_horse_candidate` の補集合〔`exists (… finish_pos is not null)`〕」
--     → ★**戦績が在ることが買える条件そのもの**です。★戦績は隠すものではありません。
--   ✔ ★**D-114**: 「★強さの絶対値を推し量る手がかりは ★**オッズと戦績だけ**とする」
--     → ★戦績は ★**出してよい**と正典が明言しています。
--   ✔ ★**D-102 ③** の「★振り直しが成立しないこと」は ★**素質**の話で、★戦績の話ではありません。
--     ★価格は §10.5 の式（`3,000 + G1勝利数 × 8,000 + 総獲得賞金/20`）＝ ★**戦績から出ます**。
--     → ★価格を出しておいて戦績を隠すと、★**利用者は価格から戦績を逆算する**だけです。
--   ✔ ★前例: ★`retired_horses_public`（`0083`）は ★名前＋戦績＋牧場名を出しています（★同じ考え方・LR-6）。
--
-- 【🔴 ★出さないもの】
--   ★素質・能力・現在値・遺伝子・発見度の段（★**D-114**）。★持ち主の情報（★出品は NPC の馬だけ）。
--
-- ⚠️ ★戦績の式は ★`my_retired_horses()`（`0075`）と `retired_horses_public`（`0083`）と ★**同じ**です
--    （★D-052。★3 か所で違う数え方をしない。★検査が突き合わせます）。
--
-- ⚠️ ★**レビュー側に確認をお願いしたい点**: ★上の根拠で「名前＋戦績」を出しました。
--    ★もし ★**名前だけ**にすべきなら、★戦績の 3 列を落としてください（★view なので戻せます）。
-- ---------------------------------------------------------------------------
begin;

create or replace view horse_market_listing_public as
select
  l.horse_id,
  l.price_ep,
  l.sell_back_ep,
  -- ★名前（★これが無いと「名前の無い馬」を売ることになります）
  h.name as horse_name,
  h.sex as horse_sex,
  h.birth_week as horse_birth_week,
  -- ⚠️ ★`my_retired_horses()`（`0075`）と ★**同じ式**（★二重管理にしない）
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos = 1) as wins,
  (select count(*) from race_entries e where e.horse_id = h.id and e.finish_pos is not null) as starts,
  h.g1_wins
from horse_market_listing l
join horses h on h.id = l.horse_id
where l.active;

comment on view horse_market_listing_public is
  '★市場の出品（★D-102）。★名前と戦績を出す — ★D-102 ③ が「走った実績のある馬だけ買える」と定め、'
  '★D-114 が「手がかりはオッズと戦績だけ」と明言しているため。'
  '★素質・能力・発見度は出さない（D-114）。'
  '★戦績の式は my_retired_horses()（0075）と retired_horses_public（0083）と同じ — '
  '★apps/cli/test/market-public-view.test.ts が突き合わせる';

grant select on horse_market_listing_public to anon, authenticated;

commit;
