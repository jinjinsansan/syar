-- ---------------------------------------------------------------------------
-- ★**「1 日」が止まっていることを、画面と監視が同じ線で判定する**
--    ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §7 ①（2026-09-25・レビュー側の判断）
-- ---------------------------------------------------------------------------
--
-- 【★なぜ要るか】
--   ★`0080` のデイリーは 1 日 1 回の鍵を ★`world_state.day_started_at`（★ワーカーが毎周書く）から作ります。
--   → ★**ワーカーが止まると、その日の鍵が進まず、誰もデイリーを受け取れません。**
--   ★向きは ★**安全側**です（★発行しすぎない）。★レビュー側の判断も「そのままで構わない」。
--   🔴 ★ただし ★**画面が「今日のぶんは受け取り済み」と出し続ける**のは誤りです。
--     ★受け取ったから押せないのではなく、★**配布そのものが止まっている**からです。
--     ★裁定 §7 ①: 「★古いものを新しいように見せない」（★DP-1 と同じ）。
--
-- 【★線は 1 か所】（★D-052）
--   ★`day_boundary_stale_after_hours()` が ★**唯一の置き場所**です。
--   ★画面（`my_daily_ep_state`）と ★監視（`tools/check-weekly-cycle-health.mjs`）が ★**同じ関数を読みます**。
--   ⚠️ ★監視側は以前 ★**秒数を出すだけで線がありませんでした**（★数字は出るが誰も合否を言わない）。
--
-- 【★28 時間の根拠】
--   ★`day_started_at` は ★正常時 ★**0〜24 時間前**のどこかです（★`DAY_MS` = 24 時間・実時間）。
--   → ★24 時間を超えていれば ★**少なくとも 1 回 進みそこねて**います。
--   ★ワーカーは 6 分ごとに書くので、★境目の直後でも 24 時間 + 数分に届きえます。
--   → ★余裕 4 時間を足して ★**28 時間**。★短い停止で狼少年にならず、★1 日 飛べば必ず鳴ります。
--   ⚠️ ★較正定数ではなく ★**「古い」と呼ぶ線**です。★上げると止まっているのを隠し、
--      ★下げると正常な境目直後に鳴ります。
-- ---------------------------------------------------------------------------
begin;

create or replace function public.day_boundary_stale_after_hours()
returns int
language sql
immutable
as $$ select 28 $$;

comment on function public.day_boundary_stale_after_hours() is
  '★world_state.day_started_at を「古い」と呼ぶ線 [時間]。★画面と監視が同じここを読む。'
  '★TS 側は packages/scheduler の DAY_BOUNDARY_STALE_AFTER_HOURS（★ep-grant-sql.test.ts が突き合わせる）';

/**
 * ★**配布が止まっているか**。
 * ⚠️ ★行が無い・値が空のときも ★**止まっている扱い**にします（★R-27。
 *    ★「分からない」を「動いている」に倒すと、★止まっていることが誰にも見えません）。
 */
create or replace function public.world_day_stalled()
returns boolean
language plpgsql
stable
as $$
declare
  v_from timestamptz;
begin
  select day_started_at into v_from from world_state where id;
  if v_from is null then return true; end if;
  return now() - v_from > make_interval(hours => day_boundary_stale_after_hours());
end $$;

comment on function public.world_day_stalled() is
  '★ワーカーが「1 日」を書き進めていないか。★true のあいだデイリーは受け取れない（0080）ので、'
  '★画面は「受け取り済み」ではなく「配布が止まっています」と出す';

-- ---------------------------------------------------------------------------
-- ★読む口を作り直す（★`0080` に `distribution_stalled` を足す）
-- ---------------------------------------------------------------------------
-- ⚠️ ★中身は `0080` と同一で、★足したのは ★**戻りの 1 列**だけです。
-- 🔴 ★`create or replace` では ★**戻りの列を変えられません**（`cannot change return type of existing function`）。
--    ★`0080` が 3 列で作っているので、★**先に落とします**。
--    ⚠️ ★落とすと権限も消えるので、★下で `grant` を必ず貼り直します。
drop function if exists public.my_daily_ep_state();
create or replace function public.my_daily_ep_state()
returns table (amount bigint, claimable boolean, already_claimed boolean, distribution_stalled boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_amount bigint := ep_grant_amount('daily');
  v_cap bigint := ep_grant_amount('daily_cap');
  v_day_from timestamptz;
  v_issued bigint;
  v_done boolean;
  v_stalled boolean := world_day_stalled();
begin
  if v_user is null then
    raise exception '未認証' using errcode = 'ST001';
  end if;
  select day_started_at into v_day_from from world_state where id;
  if v_day_from is null then
    raise exception '1 日の境目が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST005';
  end if;

  select exists (
    select 1 from ep_ledger
     where dedupe_key = 'daily:' || v_user::text || ':' || v_day_from::text
  ) into v_done;

  select coalesce(sum(l.delta), 0) into v_issued
    from ep_ledger l
   where l.user_id = v_user
     and l.created_at >= v_day_from
     and ep_reason_class(l.reason) = 'issuance';

  -- ⚠️ ★止まっているときは ★**押せない**と返します（★押しても `claim_daily_ep` が同じ鍵で弾く）。
  --    ★画面はそのとき「受け取り済み」ではなく「配布が止まっています」と出します。
  return query select
    v_amount,
    (not v_done) and (v_issued + v_amount <= v_cap) and (not v_stalled),
    v_done,
    v_stalled;
end $$;

revoke all on function public.my_daily_ep_state() from public, anon;
grant execute on function public.my_daily_ep_state() to authenticated;

commit;
