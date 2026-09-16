-- 0029: 生涯の記録の行数を毎日残す（★正典 §18 **LR-10**・裁定 `REVIEW_STORY_GROWTH_VERDICT_20260916.md`）
--
-- 【なぜ要るか】
--   ★LR-8「行は増え続ける（削除しない）。★増え方を測って報告する」は 2026-09-16 の測定で履行しました。
--   ★ただし D-079 ⑧（在庫の見張り）と同じ形を引いた以上、★**定期的に見る仕組み**が要ります。
--
-- 【★閾値を置きません】
--   ★1 年 43 万行・0.06 GiB なら ★**容量は論点ではありません**。
--   ★見るべきは「★**急に増えた／急に止まった**」という変化です。
--   → ★日次の行を残すだけにして、★判定は人が読む側に置きます（★閾値は「通るだけの検査」になりやすい）。
--
-- 【★「止まった」を捕まえられることが大事】
--   ⚠️ ★2026-09-16 に ★**15 種のうち 2 種しか書かれていない**ことが、★測って初めて分かりました。
--      ★`tools/settle-races.mjs` が `epochMs` を渡さず ★**確定しても物語が 1 行も書かれない**期間もありました。
--      ★どちらも「増えすぎ」ではなく ★**「増えていない」**側の壊れ方です。
--
-- 【★`point_flow_daily` に混ぜない】
--   ★あれは §4.6 の**資金フロー**の表です。★物語の行数は資金ではありません（★D-052・表の意味を混ぜない）。
--   ★`unlock_daily`（0015）と同じ作法で、★独立した表にします。
begin;

create table if not exists story_daily (
  date date primary key,
  -- ★その時点の総行数（★消さない表なので単調に増えるはず）
  rows bigint not null,
  -- ★出来事を持つ馬の数
  horses bigint not null,
  -- ★種類ごとの行数（★どの種類が書かれていないかが読める）
  by_type jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint story_daily_rows_non_negative check (rows >= 0),
  constraint story_daily_horses_non_negative check (horses >= 0)
);

comment on table story_daily is
  '★生涯の記録の行数を毎日残す（正典 §18 LR-10）。★閾値は置かない — 見るのは「急に増えた／急に止まった」という変化。★止まったことを捕まえるのが目的（2026-09-16 に 15 種のうち 2 種しか書かれていないことが測定で初めて分かった）。';

comment on column story_daily.by_type is
  '★種類ごとの行数。★0 の種類が並んでいたら「書く経路が無い」ことの印。';

-- ★読み取りも利用者には開けません（★運営の監視の表。§4.6 の point_flow_daily と同じ扱い）
alter table story_daily enable row level security;
revoke insert, update, delete, truncate on story_daily from anon, authenticated;

commit;
