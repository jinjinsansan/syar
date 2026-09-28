-- ★0093: 騎手の名簿の表（jockeys）を ★利用者から閉じる（★2026-09-28・V-20 ②③・レビュー側の裁定 (a)）
--
-- 【なぜ】
--   ★`0082` は「名簿は秘密ではない・画面が料金を出す」として ★元の表を anon / authenticated に select で開けていました。
--   ★ところが ★元の表が開いていると、★後で誰かが列を 1 つ足した日に ★その列が黙って公開になります（★レビュー側）。
--   ★正典 §14.3「公開は _public の付いたビューだけ」は ★この形を防ぐためにあります。
--
-- 【誰が読んでいるか（★2026-09-28 に確かめた）】
--   ★DB の `jockeys` を読むのは ★`jockey_frozen_build()` だけで、★それを呼ぶのは ★`enter_race()`（★security definer）。
--     ★definer の中から呼ばれた関数は ★持ち主の権限で走るので、★表を閉じても出走登録は名簿を読めます。
--   ★画面・ワーカー・道具は ★表を直に読んでいません（★騎手選びの画面は TS の `JOCKEYS` から出す）。
--   ★`jockey_frozen_build()` を anon / authenticated が直に呼んでも、★いまでも `race_entries`（閉じている）で失敗します（★閉じても変わらない）。
--   → ★読む人がいないので ★公開ビュー（jockeys_public）は ★作りません（★面を増やさない）。★画面が DB から名簿を読む日に、★列を明示したビューを作る。
begin;

revoke all on table jockeys from public, anon, authenticated;

comment on table jockeys is
  '★騎手の名簿（★正は packages/scheduler/src/jockeys.ts の JOCKEYS・★ここは転記）。'
  '★enter_race が料金をここから引く（★クライアントの申告を使わない・憲法 3）。'
  '★一致は apps/cli/test/jockey-roster-sql.test.ts。'
  '★2026-09-28（0093）: ★利用者から閉じた（★読むのは enter_race の中の jockey_frozen_build だけ・definer の権限）';

commit;
