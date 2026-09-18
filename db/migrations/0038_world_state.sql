-- 0038: いまが何週かをサーバーが返す（★UI1-10・正典 §14「画面は時計を持たない」）
--       ★裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`
--
-- ============================================================================
-- 【★なぜ要るのか】
--   ★`/setup` を本番に繋いだとき、★**馬の年齢を出せませんでした**。
--   ★`horses.birth_year` / `birth_week` はありますが、★**いまが何週かを画面が知りません**。
--   → ★画面が自分で計算するには ★**開催の起点（epoch）と 1 週の長さ**が要ります。
--     🔴 ★**それは画面が時計を持つということ**です（★正典 §14・憲法 3「クライアント計算を信用しない」）。
--
-- 【★どう解くか — **D-103 ④ の先例**に倣う】
--   > 「★値段は DB に**サーバーが書き**、RPC はその行の値で払わせる」
--   ★**正 ＝ TypeScript** → ★**ワーカーが DB の表に書く** → ★**ビュー・画面が読む**。
--
--   ⚠️ ★**SQL で週を計算しません。** ★`weekIndexAt(nowMs, epochMs)` の式を SQL に写すと、
--      ★`WEEK_MS`（`packages/scheduler/src/week.ts`）が **2 か所**になります（★D-052・二重帳簿）。
--      ★この案件は同じ形で繰り返し失敗しています。
--   → ★**ワーカーが毎サイクル `game_week` を書き込みます。** ★SQL は数を持つだけです。
--
-- 【★止まったら分かる形にする】
--   ★`updated_at` も一緒に書きます。★**古ければワーカーが止まっています。**
--   ⚠️ ★**画面が「古いかどうか」を判定するのも時計です** — ★そこは `now()` との差を
--      ★**ビューが返します**（★`stale_seconds`）。★画面は数を読むだけです。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 世界の状態（★1 行だけ）
-- ---------------------------------------------------------------------------
--   ★`id` は常に true。★`check` で 1 行しか入らないようにします（★単一行表の定石）。
create table if not exists world_state (
  id boolean primary key default true,
  -- ★いまの週（★`weekIndexAt` が出した値。★**SQL では計算しない**）
  game_week bigint not null,
  updated_at timestamptz not null default now(),
  constraint world_state_single_row check (id),
  constraint world_state_week_non_negative check (game_week >= 0)
);

comment on table world_state is
  '★世界の状態（★1 行だけ）。★2026-09-19・UI1-10。★いまが何週かをワーカーが書き、画面は読むだけ。'
  '★SQL では週を計算しない — weekIndexAt の式を写すと WEEK_MS が 2 か所になる（D-052）。'
  '★画面が epoch と週の長さを持つのは「画面が時計を持つ」ことで、正典 §14 に反する';

alter table world_state enable row level security;
-- ⚠️ ★表そのものは閉じます（★R-29: 既定を閉じて、公開ビューだけ開ける）
revoke all on world_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ② 公開ビュー（★画面が読むのはこれだけ）
-- ---------------------------------------------------------------------------
--   ★`stale_seconds` … ★最後に書かれてから何秒経ったか。
--     ⚠️ ★**画面に「古いか」を判定させません** — ★数を返し、★閾値は呼ぶ側が決めます。
--     ★これも「画面が時計を持たない」の一部です（★`now()` はサーバーの時計）。
create or replace view world_state_public as
select
  w.game_week,
  extract(epoch from (now() - w.updated_at))::int as stale_seconds
from world_state w;

comment on view world_state_public is
  '★いまの週（★UI1-10）。★画面はここだけを読む。★stale_seconds はサーバーの時計で測った「最後に書かれてからの秒数」で、'
  '★ワーカーが止まっていれば増え続ける。★閾値は画面に持たせない（★数を返すだけ）';

grant select on world_state_public to anon, authenticated;

commit;
