-- 0047: ★券種を必須にする（★BT-5）／★`my_bet_allowance` をビューから関数へ
--       ★裁定 `REVIEW_BET_ALLOWANCE_VERDICT_20260919.md`
--
-- ============================================================================
-- 【🔴 ★何が起きていたか — ★`0044` は ★**BT-2 で塞いだはずの穴を自分で開けていました**】
--   ★`bet_allowance(p_user, p_race_id, p_bet_type default null)` の中:
--       select ... into v_kind_total from bets
--        where ... and (p_bet_type is null or bet_type = p_bet_type)
--   → ★`p_bet_type` が null のとき、★**`v_kind_total` は「そのレースの全券種の合計」**になります。
--     ★つまり ★**`v_race_total` と同じ値**です。
--   → `v_rest_kind = 30,000 − レース合計` は ★**常に `v_rest_race = 50,000 − レース合計` 以下**。
--     ★**`binding` はほぼ必ず `kind` になり、残りは 30,000 で頭打ち**になります。
--
--   ★単勝 10,000 ＋ 複勝 10,000 を買った人:
--     ★本当の残り      … ★**30,000**（★新しい券種なら「このレースの上限」50,000 が効く）
--     🔴 ★ビューの答え … ★**10,000**／「この券種の上限」（★券種はまだ選ばれていないのに）
--   → ★★**買えるのに「買えない」と出ます。★これは誰も気づかない側の壊れ方**です
--     （★`0044` の註記で開発側自身が「後者は誰も気づきません」と書いた形そのもの）。
--
-- 【★なぜ起きたか — ★意味が決まっていない任意引数】
--   ★`default null` を「券種の上限を飛ばす」つもりで書き、★実装は
--   ★**「全部を 1 つの券種とみなす」**になっていました。★**書いた本人も読み違えています**。
--   → ★**意味が決まっていない任意引数は罠**です（R-29: 既定を閉じ、必要なものだけ開ける）。
--
-- 【★どう直すか】
--   ① ★`p_bet_type` から ★**既定値を外す**（★2 引数の呼び方が**存在しなくなります**）
--   ② ★`null` を ★**明示的に拒む**（★呼び手が動的 SQL で null を渡しても止まる）
--   ③ ★ビュー `my_bet_allowance` を ★**落とし**、★**同名の関数**にする
--      （★ビューは引数を取れず、★「券種を渡す」形にできないため）
--   ④ ★値は 1 ビットも変えていません（★`bet_limits` の 4 つ）
--
-- 【⚠️ ★券種の語彙をここでは検査しません】
--   ★券種の一覧は ★**`bets_type_known` の CHECK**（`0001:232`）が持っています。
--   ★ここに写すと ★**同じ一覧が 2 か所**になります（D-052）。
--   ★知らない券種を渡した場合の答えは ★**「その券種はまだ 1 EP も買っていない」**で、
--   ★**通してしまうことはありません** — ★実際に買うには `place_bet` → `bets` への挿入が要り、
--   ★そこで CHECK が止めます。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① ビューを先に落とす（★関数と同名にするため）
-- ---------------------------------------------------------------------------
drop view if exists my_bet_allowance;

-- ---------------------------------------------------------------------------
-- ② 規則の本体（★`0044` の本文を取ってきて、★券種の扱いだけを直す）
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`create or replace` では既定値を外せません**
--      （Postgres: `cannot remove parameter defaults from existing function`）。
--      → ★**一度落とします**。★`place_bet` は plpgsql なので実行時に解決され、
--        ★同じトランザクションの中で作り直せば壊れません。
drop function if exists bet_allowance(uuid, uuid, text);

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

  select coalesce(sum(amount), 0) into v_race_total
    from bets where user_id = p_user and race_id = p_race_id and status <> 'refunded';
  -- ★★BT-5: ★**渡された券種だけ**を数える（★`or p_bet_type is null` を外した）
  select coalesce(sum(amount), 0) into v_kind_total
    from bets where user_id = p_user and race_id = p_race_id
      and bet_type = p_bet_type and status <> 'refunded';
  -- ⚠️ 🔴 ★**「1 日」の境目は BT-6 で扱います**（★ここは `0044` のまま・★AL-11 に合流）。
  --    ★測定（2026-09-19・staging）: `date_trunc('day', now())` と `dayIndex()` は ★**同じ時刻**でした。
  --    ★ただし ★**epoch が 00:00Z ちょうど**で ★**DB の TimeZone が UTC** だったからで、
  --    ★どちらも固定されていません（★staging の 7,370/7,370 と同じ「たまたま」）。
  select coalesce(sum(amount), 0) into v_day_total
    from bets where user_id = p_user and created_at >= date_trunc('day', now())
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
  '★あと何 EP 投票できるか（★2026-09-19・BT-1/BT-2/BT-5）。★place_bet も my_bet_allowance もこれを呼ぶ。'
  '★2026-09-19・BT-5: ★p_bet_type の既定値 null を外した — ★null のとき「全券種の合計を 1 券種とみなす」'
  '答えになり、★買えるのに「この券種の上限」と出ていた（★誰も気づかない側の壊れ方）。'
  '★4 つの内訳は返さない（★返すと呼ぶ側が min を取れ、優先順位が外に出る）。'
  '★券種の語彙はここでは検査しない — ★一覧は bets_type_known の CHECK が持つ（D-052）';

revoke all on function bet_allowance(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ③ 画面が呼ぶ口（★ビューではなく関数。★券種を必ず渡す）
-- ---------------------------------------------------------------------------
--   ⚠️ ★ビューでは引数を取れないため、★**券種を渡す形にできません**。
--      ★`0044` はそこで `null` を渡していました — ★**それが BT-5 の原因**です。
--   ★画面は ★**券種を選ぶたびに呼び直します**（★`0044` の註記が予告していた形）。
create or replace function my_bet_allowance(p_race_id uuid, p_bet_type text)
returns table (remaining_ep bigint, binding text, binding_label text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '未認証'; end if;
  return query select * from bet_allowance(v_user, p_race_id, p_bet_type);
end $fn$;

comment on function my_bet_allowance(uuid, text) is
  '★画面が読む「あと何 EP 投票できるか」（★2026-09-19・BT-1/BT-5）。★同名のビューを 0047 で落として関数にした — '
  '★ビューは引数を取れず、★券種を渡せないため（★0044 は null を渡していて、★全券種の合計を 1 券種とみなしていた）。'
  '★上限そのものは渡さない — ★渡すと画面が min を取り、優先順位という第 5 の知識を持つ（BT-0）';

revoke all on function my_bet_allowance(uuid, text) from public, anon;
grant execute on function my_bet_allowance(uuid, text) to authenticated;

commit;
