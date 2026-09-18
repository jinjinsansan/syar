-- 0050: ★「1 日」の境目を 1 本にする（★**BT-6 ②⑤**）
--       ★裁定 `REVIEW_BET_ALLOWANCE_VERDICT_20260919.md` §3
--
-- ============================================================================
-- 【🔴 ★何が起きていたか — ★数えました（2026-09-19）】
--   ★生きている定義のうち、「1 日」を自分で決めているのは ★**2 か所**でした:
--
--     ① ★`bet_allowance`（`0047`） … `date_trunc('day', now())`
--        → ★**500,000 EP の歯止め**（§9.4）が、これで切れます。
--     ② ★ワーカー（`apps/worker/src/main.ts:247`） … `current_date`
--        → ★**日次集計（§3.4）・出品の更新・開放率の記録**が、これで切れます。
--
--   ⚠️ ★どちらも ★**セッションの TimeZone** にしたがいます。★宣言した場所はありません。
--   ⚠️ ★さらに ★**接続が違います** — ★① は PostgREST（`security definer`）、★② は node-postgres。
--   → ★★**同じ「1 日」のつもりで、★別々に切れうる 2 つ**でした。
--
--   ✔ ★測定（2026-09-19・staging）: ★DB の TimeZone = UTC・★`STAR_EPOCH_ISO` = `2026-08-08T00:00:00Z`
--     → ★**ずれ 0.0 分**。★ただし ★**どちらも「そうである」と宣言していない**ので「たまたま」です。
--   ✔ ★そして一致しているその時刻は ★**00:00 UTC ＝ 09:00 JST** — ★**誰も選んでいない時刻**に
--     ★歯止めが戻ります（★`G1_HOURS_JST` は JST で考えているのに）。
--
-- 【★どう解くか — ★`0048`（`week_started_at`）と同じ形】
--   ★**正 ＝ TypeScript の `dayIndexAt` / `dayStartMs`**（`packages/scheduler/src/programme.ts`）。
--   → ★ワーカーが ★**毎周** `world_state.day_started_at` に書き、
--     ★SQL は ★**その行を読むだけ**にします。
--   ⚠️ ★**SQL に `date_trunc` も `current_date` も書きません。**
--   ⚠️ ★**ワーカー自身の日次の判定も、同じ関数から引きます**（★**BT-6 ⑤**）—
--      ★片方だけ直すと「直した」という記憶だけが残ります。
--
-- 【⚠️ ★公開ビューには出しません】
--   ★画面は「1 日の境目」を要りません（★`week_started_at` は `/records` が要ったので出しました）。
--   ★既定を閉じます（R-29）。★`bet_allowance` は `security definer` なので実体を読めます。
-- ============================================================================

begin;

alter table world_state add column if not exists day_started_at timestamptz;

comment on column world_state.day_started_at is
  '★いまの「1 日」が実時刻でいつ始まったか（★BT-6 ②⑤・2026-09-19）。'
  '★ワーカーが dayStartMs(dayIndexAt(now, epoch), epoch) で毎周書く（★week_started_at と同じ形）。'
  '⚠️ ★SQL 側で date_trunc / current_date を使わないこと — ★セッションの TimeZone にしたがい、'
  '★接続ごとに別の時刻で切れる。★500,000 EP の歯止め（§9.4）の境目がそれでは測れない';

-- ---------------------------------------------------------------------------
-- ★`bet_allowance` — ★「1 日」を行から読む（★`0047` の本文を取ってきて 1 か所だけ直す）
-- ---------------------------------------------------------------------------
create or replace function bet_allowance(
  p_user uuid,
  p_race_id uuid,
  p_bet_type text
)
returns table (remaining_ep bigint, binding text, binding_label text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_lim bet_limits%rowtype;
  v_day_from timestamptz;
  v_race_total bigint;
  v_kind_total bigint;
  v_day_total bigint;
  v_own boolean;
  v_rest_kind bigint;
  v_rest_race bigint;
  v_rest_day bigint;
begin
  -- ★★BT-5: ★**券種を省けない**。★省けると「全券種の合計を 1 券種とみなす」答えになる
  if p_bet_type is null then
    raise exception '券種が必要（★あと何 EP かは券種ごとに違う）'
      using errcode = 'ST004';
  end if;

  select * into v_lim from bet_limits where id;
  if not found then
    -- ★**無い行は通さない**（R-27・BT-4 ②）
    raise exception '投票の上限が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST002';
  end if;

  -- ★★BT-6 ②⑤: ★**「1 日」の境目はワーカーが書いた行から読む**（★ここで決めない）
  select day_started_at into v_day_from from world_state where id;
  if v_day_from is null then
    -- ★**無い行は通さない**（R-27）。★黙って date_trunc に落とすと、また 2 か所になる
    raise exception '1 日の境目が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST005';
  end if;

  select coalesce(sum(amount), 0) into v_race_total
    from bets where user_id = p_user and race_id = p_race_id and status <> 'refunded';
  -- ★★BT-5: ★**渡された券種だけ**を数える
  select coalesce(sum(amount), 0) into v_kind_total
    from bets where user_id = p_user and race_id = p_race_id
      and bet_type = p_bet_type and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_day_total
    from bets where user_id = p_user and created_at >= v_day_from
      and status <> 'refunded';

  -- ★自馬が出走するレースか（§9.5）。★出走していれば「1 レース合計」が上書きされます
  select exists (
    select 1 from race_entries e join horses h on h.id = e.horse_id
     where e.race_id = p_race_id and h.owner_id = p_user
  ) into v_own;

  v_rest_kind := v_lim.per_kind_ep - v_kind_total;
  v_rest_race := (case when v_own then v_lim.own_race_ep else v_lim.per_race_ep end) - v_race_total;
  v_rest_day  := v_lim.per_day_ep - v_day_total;

  -- ★**いちばんきついものが答え**（★ここが唯一の優先順位）
  remaining_ep := greatest(0, least(v_rest_kind, v_rest_race, v_rest_day));
  -- ⚠️ ★言葉は「効いている上限の名前」（★`0045`）。★「達しています」と書かない
  if v_rest_day <= v_rest_kind and v_rest_day <= v_rest_race then
    binding := 'day';
    binding_label := '今日の上限';
  elsif v_rest_race <= v_rest_kind then
    binding := case when v_own then 'own_race' else 'race' end;
    binding_label := case when v_own
      then '自分の馬が出るレースの上限'
      else 'このレースの上限' end;
  else
    binding := 'kind';
    binding_label := 'この券種の上限';
  end if;
  return next;
end $fn$;

comment on function bet_allowance(uuid, uuid, text) is
  '★あと何 EP 投票できるか（★2026-09-19・BT-1/BT-2/BT-5/BT-6）。★place_bet も my_bet_allowance もこれを呼ぶ。'
  '★2026-09-19・BT-6 ②⑤: ★「1 日」の境目を world_state.day_started_at から読む — '
  '★date_trunc も current_date も、セッションの TimeZone にしたがい、接続ごとに別の時刻で切れる。'
  '★ワーカーの日次の判定も同じ関数（dayIndexAt）から引く（★片方だけ直すと「直した」記憶だけが残る）。'
  '★4 つの内訳は返さない（★返すと呼ぶ側が min を取れ、優先順位が外に出る）';

revoke all on function bet_allowance(uuid, uuid, text) from public, anon, authenticated;

commit;
