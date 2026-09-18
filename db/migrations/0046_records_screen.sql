-- 0046: 記録の画面が読む先（★UI-4・`/records`）
--
-- ============================================================================
-- 【★何を足すか】
--   ① ★`races.game_week` … ★**そのレースがゲーム内の何週めか**
--   ② ★`my_runs` ビュー   … ★**自分の馬の確定した出走**（★`my_horses` と同じ作法）
--
-- 【★① なぜ列を足すか — ★画面は「週」を導けません】
--   ★`/records` の戦績は ★**「◯週」**を出します。
--   ★週は ★**開催の起点（epoch）と 1 週の長さ**から決まります（`packages/scheduler/src/week.ts`）。
--   🔴 ★画面にそれを渡すと ★**画面が時計を持ちます**（★UI1-10 で `world_state` を作ったときの判断と同じ）。
--   🔴 ★`cycle_index / CYCLES_PER_WEEK` で割るのも**別の導き方**です。
--      ★ワーカーは ★**時刻から**週を決めています（`weekIndexAt(nowMs, epochMs)`）。
--      ★2 通りの導き方を置けば、★**ずれたときにどちらが正か言えません**（D-052）。
--   → ★**ワーカーが、世界時計と同じ関数で計算した値を行に書きます**。
--     ★これは `0039`（出走料・斤量）・`0041`（登録の締切）と ★**同じ形の 3 回め**です。
--
--   ⚠️ ★**既存の行は null のままです**（★`0039`/`0041` と同じ）。
--      ★埋め戻しません — ★**埋め戻すにはここで週を計算する必要があり**、
--      ★それこそが避けたい「2 つめの導き方」だからです。
--      ★画面は null を ★**「—」**と出します（★0 週と偽りません）。
--
-- 【★② なぜビューが要るか】
--   ★戦績は ★`race_entries`（CLOSED）と `horses`（CLOSED）の join でしか作れません。
--   ★`race_entries_public` は ★**1 レース分の出馬表**で、★「自分の馬の通算」を引く形ではありません。
--   → ★`my_horses`（`0034`）と同じく、★**本人スコープの専用ビュー**を 1 本立てます。
--
-- 【🔴 ★出せなかったもの — ★1 走あたりの賞金 PP】
--   ★デモの戦績表には ★**「賞金」列**があります。★**サーバーに源がありません**。
--     ★`pp_ledger` の `reason = 'prize'` は ★**`ref_id = race_id`** です（`apps/worker/src/payout.ts` / `prize-award.ts`）。
--     ★同じレースに自分の馬が 2 頭出ると ★**どちらの分か区別できません**。
--   ⚠️ ★**賞金表（`packages/scheduler/src/prize.ts`）を SQL に写すのは D-052 違反**なので、しません。
--   → ★**列を作らず、照会に出します**（★`QUESTIONS_UI4_20260919.md`）。★画面は賞金列を出しません。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① ゲーム内の週（★ワーカーが `weekIndexAt(scheduled_at, epoch)` で書く）
-- ---------------------------------------------------------------------------
alter table races add column if not exists game_week int;

comment on column races.game_week is
  '★そのレースがゲーム内の何週めか（★UI-4・2026-09-19）。★ワーカーが world_state と同じ weekIndexAt() で計算して書く。'
  '⚠️ ★ここを cycle_index から割り出さないこと — ★週は時刻から決まっており、2 通りの導き方を置くとずれても気づけない（D-052）。'
  '⚠️ ★0046 より前に作られたレースは null（★埋め戻さない。★埋め戻しはそれ自体が 2 つめの導き方になる）';

-- ---------------------------------------------------------------------------
-- ② 自分の馬の確定した出走（★`my_horses`（0034）と同じ作法）
-- ---------------------------------------------------------------------------
--   ★出す列と理由:
--     `race_id` / `horse_id`  … ★どの走りか。★画面の鍵
--     `horse_name`            … ★馬の名前（★`my_horses` も出している）
--     `game_week`             … ★何週めか（★上で足した列。★画面は導けない）
--     `scheduled_at`          … ★発走時刻（★「日付」列。★実時刻で並べる）
--     `race_name` / `grade` / `class_rank` … ★どのレースか・格（★`races_public` も出している）
--     `surface` / `distance` / `track_condition` … ★条件（★`races_public` も出している）
--     `gate`                  … ★枠番（★自分の走りを指すため）
--     `finish_pos`            … ★着順（★確定済みの行だけ）
--     `finish_time` / `margin`… ★走破時計と着差（★`races_public` の確定後と同じ範囲）
--     `popularity`            … ★人気（★D-114 が「強さの手がかりはオッズと戦績だけ」と定めた側）
--     `field_size`            … ★頭数（★「12 頭中 3 着」を言うため）
--   ★出さない列と理由:
--     `intervention_log` / `intervention_mult` / `cap_violations` … ★§8.8 の一次資料。★画面に要らない（R-29）
--     `odds`                  … ★購入時オッズ。★戦績表には出していない（★要るようになったら足す）
--     `owner_id`              … ★`auth.uid()` と一致するに決まっている。★出す意味がない
--
--   ⚠️ ★**いま持っている馬の走りだけ**が見えます（★`my_horses` と同じ性質）。
--      ★売った馬の過去の走りは消え、★買った馬の前の持ち主の走りは見えます。
--      ★これは「馬の戦績」であって「私の戦績」ではないためで、★`my_horses.wins` も同じ数え方です。
create or replace view my_runs as
select
  e.race_id,
  e.horse_id,
  h.name as horse_name,
  r.game_week,
  r.scheduled_at,
  r.name as race_name,
  r.grade,
  r.class_rank,
  r.surface,
  r.distance,
  r.track_condition,
  e.gate,
  e.finish_pos,
  e.finish_time,
  e.margin,
  e.popularity,
  (select count(*) from race_entries x where x.race_id = e.race_id) as field_size
from race_entries e
  join horses h on h.id = e.horse_id
  join races  r on r.id = e.race_id
where h.owner_id = auth.uid()
  and e.finish_pos is not null;

comment on view my_runs is
  '★自分の馬の確定した出走（★UI-4・2026-09-19）。★確定した走りだけ（finish_pos is not null）— ★登録しただけ・取消は入らない。'
  '★数え方は my_horses.starts と同じ（★違う数え方にすると「戦績 12 なのに 11 行しかない」になる）。'
  '★1 走あたりの賞金 PP は出していない — ★pp_ledger.ref_id は race_id で、同一レースに 2 頭出すと分けられない（★照会中）。'
  '★素質・現在能力・適性の生値は 1 つも出さない（D-114）';

revoke all on my_runs from public, anon;
grant select on my_runs to authenticated;

commit;
