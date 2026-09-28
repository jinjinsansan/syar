-- ★0092: ワーカーの版を SSH なしで確かめる口（★2026-09-28・レビュー側の決定 (ii)）
--
-- 【なぜ】
--   ★本番のワーカーの版は ★VPS に入らないと分かりませんでした（★`readlink /opt/star-current`）。
--   ★09-26〜27 に「ワーカーは da73871」「b583ce2」と ★2 つの報告が食い違って見えた（★時刻が違っただけ）。
--   ★オーナーもレビュー側も ★自分で確かめられる形にします。
--
-- 【形】
--   ① `worker_status` … ★ワーカーが周の終わりに 1 行を upsert する（★版・起動時刻・最後の周の時刻・周の所要）。
--      ★anon / authenticated には ★閉じたまま（★exposure-registry: closed）。
--   ② `worker_heartbeat()` … ★返すのは ★`release_sha` と ★`last_cycle_at` の ★2 つだけ（★周の重さは返さない）。
--      ★画面の `/api/healthz` が anon で呼ぶ。★healthz は誰でも開ける URL なので、★外から読める範囲は healthz と同じ。
--      ★security definer ＋ search_path 固定 ＋ public から剥がして anon / authenticated にだけ execute
--      （★0086 で踏んだ「definer が無くて読めない」「drop で権限が消える」を繰り返さない）。
--
-- ⚠️ ★ワーカーの版は ★`/opt/star-current` の実体（★`/opt/star-releases/<40 桁の sha>`）の末尾から読む（★deploy.sh は変えない）。
--    ★40 桁でなければ 'unknown'（★分からないときに嘘を書かない）。
begin;

create table if not exists worker_status (
  name text primary key,
  release_sha text not null,
  started_at timestamptz not null,
  last_cycle_at timestamptz not null,
  cycle_ms integer not null,
  cycle_pct numeric(6, 1) not null,
  constraint worker_status_name_known check (name in ('star-worker')),
  constraint worker_status_sha_shape check (release_sha = 'unknown' or release_sha ~ '^[0-9a-f]{40}$'),
  constraint worker_status_cycle_ms_non_negative check (cycle_ms >= 0)
);

alter table worker_status enable row level security;
revoke all on table worker_status from public, anon, authenticated;

comment on table worker_status is
  '★ワーカーの版と周の記録（★0092・1 行）。★ワーカーが周の終わりに upsert する。'
  '★利用者には閉じる（★読むのは worker_heartbeat() の 2 つだけ）';

create or replace function public.worker_heartbeat()
returns table (release_sha text, last_cycle_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.release_sha, s.last_cycle_at
    from public.worker_status s
   where s.name = 'star-worker'
$$;

revoke all on function public.worker_heartbeat() from public;
grant execute on function public.worker_heartbeat() to anon, authenticated;

comment on function public.worker_heartbeat() is
  '★ワーカーの版と最後の周の時刻だけを返す（★0092）。★/api/healthz が anon で呼ぶ。'
  '★周の重さ・起動時刻・その他の列は返さない（★面を healthz と同じに保つ）';

commit;
