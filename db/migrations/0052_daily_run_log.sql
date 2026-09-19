-- 0052: ★**日次の枝に入ったことを行に書く**（★2026-09-19・**DL-2**・裁定 `REVIEW_C_SEEDS_VERDICT_20260919.md`）
--
-- 【🔴 ★なぜ要るか — ★1 か月 誰も気づきませんでした】
--   ✔ ★実測（staging・2026-09-19）:
--     ★`point_flow_daily` = **0 行** ／ ★`story_daily` = **0 行** ／ ★`unlock_daily` は **2026-08-13** が最後。
--     ★日次のコードは **2026-08-08** から `main.ts` にあります（`7cc968e`）。
--   ✔ ★3 つの関数は ★**今日 動きます**（★実 DB で `rollback` 付きに通し、
--     ★`aggregateDay` が **1 行 書く**ことまで数えました）。
--   🔴 ★**それでも「なぜ書かれていないか」は DB から答えられませんでした。**
--
--   ★日次ブロックは、失敗しても
--       `[worker] 日次集計に失敗: <理由>`
--   ★を出して ★**ループを続けます**（★A-1 を壊さないため。★この設計は正しい）。
--   → ★★**理由は標準出力にしか出ません。★そして誰も見ていませんでした。**
--   → ★**R-16（静かな劣化）そのもの**です。★止めないまま、★**見えるようにします**。
--
-- 【★形】★`BT-6` で `day_started_at` を行にしたのと同じ考え方です。
--   ★**「標準出力にしか出ない」を行にする。**
--
-- ⚠️ ★**これは「止める」仕組みではありません。** ★ワーカーは今までどおり続けます。
--    ★変わるのは ★**後から DB に問えるようになる**ことだけです。
--
-- ⚠️ ★**時刻は `now()`（サーバー）**。★ワーカーの時計は使いません（憲法 4・§14）。

create table if not exists daily_run_log (
  -- ★ゲーム内の何日め（★`dayIndexAt` が出した値。★**SQL では計算しない**・D-052）
  day_index bigint not null,
  -- ★どの枝か（★1 つ落ちても他は続くので、★枝ごとに 1 行）
  step text not null,
  -- ★通ったか
  ok boolean not null,
  -- ★落ちたときの理由（★通ったら null）。★**黙って消さない**（D-111 ⑤ と同じ作法）
  detail text,
  -- ★何行 書いたか（★**「落ちなかった」と「書いた」は別**。★0 行の成功を見分けるため）
  rows_written int,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  primary key (day_index, step),
  constraint daily_run_log_detail_when_failed check (ok or detail is not null),
  constraint daily_run_log_rows_non_negative check (rows_written is null or rows_written >= 0)
);

comment on table daily_run_log is
  '★日次の枝に入ったことと、その結果を行に残す（★2026-09-19・DL-2）。'
  '🔴 ★日次ブロックは失敗してもループを続ける（A-1）ので、★理由は標準出力にしか出なかった。'
  '✔ ★実測: point_flow_daily と story_daily は 0 行、unlock_daily は 2026-08-13 が最後で、'
  '★コードは 2026-08-08 からあるのに 1 か月 誰も気づかなかった（R-16）。'
  '⚠️ ★これは「止める」仕組みではない。★後から DB に問えるようにするだけ。';

comment on column daily_run_log.day_index is
  '★ゲーム内の何日め。★正は TS の dayIndexAt() — ★SQL では計算しない（D-052）。'
  '★日付の文字列ではなく番号にするのは、★BT-6 で「1 日」の境目を 1 本にしたのと同じ理由。';
comment on column daily_run_log.step is
  '★枝の名前（aggregate / unlock / story / market / grade …）。★1 つ落ちても他は続くので枝ごとに 1 行。';
comment on column daily_run_log.rows_written is
  '🔴 ★何行 書いたか。★**「落ちなかった」と「書いた」は別**。'
  '★2026-09-19、aggregateDay を「✅ 通った」とだけ確かめて、★書いたかを数えていなかった。'
  '★0 行の成功（＝静かな劣化）を、ここで見分ける。';
comment on column daily_run_log.detail is
  '★落ちた理由。★通ったら null。★CHECK で「理由の無い失敗」を作れないようにしてある。';

-- ★直近を引くための索引（★「最後に日次が通ったのはいつか」を 1 問で）
create index if not exists daily_run_log_finished_idx on daily_run_log (finished_at desc);
