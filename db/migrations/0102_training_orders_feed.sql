-- ★**調教の献立に「エサ（飼葉）」を足す**（★2026-10-03・正典 D-127・§7.2 の 9 番目の献立）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。★順は ★移行 → ワーカーと画面（★画面が feed を送る前に 適用する）。
--
-- 【★なぜ】
--   ★`training_orders.menu` の CHECK（0057）は ★`MENU_IDS` の 8 つしか通さない。★エサを選ぶと ★指示が書けない。
--
-- 【★変えないこと】（★D-127 ③「既存の行を壊さない」）
--   ★既存の 8 つは そのまま通る（★制約を広げる向き・★既存の行は 1 行も書き換えない）。
--   ★`set_training_order` は 献立を自分で検査せず この CHECK に頼る（0059）ので ★関数は変えない。

begin;

alter table training_orders drop constraint if exists training_orders_menu_known;
alter table training_orders add constraint training_orders_menu_known check (
  menu in ('hill', 'wood', 'pool', 'gate', 'partner', 'hard', 'light', 'rest', 'feed')
);

commit;
