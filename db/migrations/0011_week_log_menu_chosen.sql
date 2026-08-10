-- 0011: 週の記録に「選んだメニュー」を足す（P3 B-1）
--
-- 【なぜ要るか】
--   §7.6 のイベントが「休養にする」を選ばせると、`menu` が rest に差し替わります。
--   ところが EP は差し替え前のメニューぶんを既に払っています。
--   ★初回の B-1 で、非休養 137週に対し EP 消費が 138週になり、1週合いませんでした。
--     記録が `menu`（実行後）しか持っていなかったので、**何に払ったかが読めません**。
begin;
alter table horse_week_log add column if not exists menu_chosen text;
comment on column horse_week_log.menu_chosen is
  '★プレイヤーが選んだメニュー。menu（実際に行ったもの）と違う週は、イベントか故障休養で差し替わっている';
commit;
