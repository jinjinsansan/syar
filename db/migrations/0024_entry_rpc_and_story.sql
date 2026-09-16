-- 0024: 出走登録の RPC・§9.5 の是正・厩舎の格・生涯の記録（ゲーム本体 第 3 便）
--
-- ============================================================================
-- 【この移行がすること（5 つ・1 トランザクション）】
--   ① ★`place_bet` を **正典 §9.5 どおり**に直す（★自馬が複数なら**全頭を含む組合せだけ**）
--   ② 出走登録の RPC `enter_race`（★同じレースに 1 人 2 頭まで・D-104）
--   ③ `race_entries` に **騎手の凍結**（D-105 ④）
--   ④ `horses` に **厩舎の格**（D-103）
--   ⑤ **生涯の記録** `horse_story_event`（正典 §18・LR-1〜LR-8）
--
-- 【★① と ② を同じ移行に入れる理由】（裁定 `REVIEW_GAME_BODY_1_VERDICT_20260916.md` §5-2 の 3）
--   ★**出走登録と投票は同じ便で出す。** 片方だけ入れると、
--   ★「2 頭出走できるのに、片方だけを含む買い目が通る」という穴が開きます。
--
-- 【★`place_bet` の本体について】
--   ★`0020` の定義（`pg_get_functiondef()` の出力）を土台に、★**§9.5 の判定 1 か所だけ**を差し替えました。
--   ★他の行は 1 文字も変えていません（★先頭の `assert_setup_complete()` も残っています・D-080）。
--   ⚠️ ★`rpc-guard.test.ts` は「**最後の定義**」を見ます。★土台を写さずに書くと、
--      ★D-080 の判定や上限の検査が**黙って消えます**。
--
-- 【★この移行では触らないもの】
--   ★馬の購入（EP で NPC の馬を迎える）は**次の移行**にします。★所有の移転は
--   ★`horses.owner_id` と `npc_stable_id` の排他（`0001` の CHECK）に触るので、
--   ★出走登録と同じトランザクションに混ぜません（★1 つの移行で 1 つのことだけ）。
-- ============================================================================
begin;

-- ── ③ 騎手の凍結（D-105 ④）──────────────────────────────────
--   ★出走登録の時点の騎手を**値で**残します（★名簿を後から変えても過去のレースが動かない・D-055 と同じ理屈）。
--   ★中身: { v: 1, jockeyId, name, feeEP, bond, effect }（`@star/scheduler` の `freezeJockey` が作る形）
--   ⚠️ ★`effect` は**この便では 0**（D-105 ③・着順に効かせるのは別の便）。
alter table race_entries
  add column if not exists jockey_frozen jsonb;

comment on column race_entries.jockey_frozen is
  '★出走登録の時点で凍結した騎手 {v,jockeyId,name,feeEP,bond,effect}。確定・再計算はこれを読む（名簿から引き直さない）。effect は第 1 便では 0。null は 0024 より前の行。';

-- ── ④ 厩舎の格（D-103）───────────────────────────────────
--   ★馬ごと。★既定は bronze（＝格を入れる前と 1 ビットも同じ振る舞い）。
--   ⚠️ ★**素質の上限（potential）は変えません。** ★格が動かすのは調教費と 1 週の伸びだけで、
--      ★同じ EP を注いだときの強さは全格で同じです（`gainPerEpRatio` が 1.0）。
alter table horses
  add column if not exists stable_grade text not null default 'bronze';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'horses_stable_grade_known') then
    alter table horses add constraint horses_stable_grade_known
      check (stable_grade in ('bronze', 'silver', 'gold'));
  end if;
end $$;

comment on column horses.stable_grade is
  '★厩舎の格（bronze/silver/gold・D-103）。調教費と 1 週の伸びに同じ倍率が掛かるので、同じ EP での強さは変わらない（買えるのは時間）。potential には触らない。';

-- ── ⑤ 生涯の記録（正典 §18・LR-1〜LR-8）──────────────────────
--   ★LR-1 消さない／LR-2 所有ではない／LR-4 文章は定型（文は保存しない・種類と値だけ残す）／
--   ★LR-5 着順にも経済にも効かない（読み取り専用）／LR-6 他人の馬も見えるが個人情報は持たない。
--   ⚠️ ★**文章そのものを保存しません。** ★保存するのは「種類」と「値」で、
--      ★文は `@star/training` の `storyLineOf` が組み立てます（★文言を直した日に過去の行が古くなるのを防ぐ）。
create table if not exists horse_story_event (
  id bigserial primary key,
  horse_id uuid not null references horses (id),
  -- ★出来事の種類（`@star/training` の `StoryEventType` と同じ語）
  event_type text not null,
  -- ★ゲーム内の週（★実時刻ではない・憲法 4）
  game_week bigint not null,
  race_id uuid references races (id),
  -- ★着順・騎手名・判明した適性・産駒の馬名など（★持ち主の情報は入れない・LR-6）
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint horse_story_event_type_known check (
    event_type in (
      'birth', 'first-training', 'debut', 'first-win', 'trait-discovered', 'injury', 'comeback',
      'graded-win', 'top-grade-win', 'jockey-bond', 'career-high', 'final-race', 'retirement',
      'first-offspring', 'offspring-win'
    )
  ),
  constraint horse_story_event_week_non_negative check (game_week >= 0)
);

create index if not exists horse_story_event_horse_week_idx
  on horse_story_event (horse_id, game_week, id);

comment on table horse_story_event is
  '★生涯の記録（正典 §18）。消さない・所有ではない・週送りの対象にしない・文章は保存せず種類と値だけ残す（文は storyLineOf が組み立てる）。';

-- ★読み取りは誰でも（LR-6「他人の馬の物語も見える」）。★書き込みは RPC 経由だけ。
alter table horse_story_event enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'horse_story_event' and policyname = 'horse_story_event_read') then
    create policy horse_story_event_read on horse_story_event for select using (true);
  end if;
end $$;
revoke insert, update, delete, truncate on horse_story_event from anon, authenticated;
grant select on horse_story_event to anon, authenticated;

-- ── ② 出走登録の RPC（D-104・D-105）──────────────────────────
--   ★同じレースに 1 人 2 頭まで（3 頭目は拒否）。★騎手は登録の時点で凍結する。
--   ★料金は **登録料 ＋ 騎手の料金** を EP で 1 回に払う（★`entry_fee` で記帳・D-105 ②）。
--   ⚠️ ★**着順に効くものは 1 つも入れません**（★凍結の `effect` は 0 のまま保存するだけ）。
CREATE OR REPLACE FUNCTION public.enter_race(
  p_race_id uuid, p_horse_id uuid, p_strategy text, p_jockey_frozen jsonb, p_client_token uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_race races%rowtype;
  v_owner uuid;
  v_mine int;
  v_gate int;
  v_fee int;
  v_jockey_fee int;
  v_total int;
  v_balance bigint;
  v_entry_id uuid;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キー（client_token）が必要'; end if;
  if p_strategy not in ('nige', 'senko', 'sashi', 'oikomi') then
    raise exception '脚質が不正: %', p_strategy;
  end if;

  -- ★再送なら既存の登録を返して終わる（EP を二度引かない）
  select id into v_entry_id from race_entries
   where race_id = p_race_id and horse_id = p_horse_id;
  if found then return v_entry_id; end if;

  select * into v_race from races where id = p_race_id;
  if not found then raise exception 'レースが存在しない'; end if;
  -- ★§10.4 発走 60 分前まで。ゲーム内時刻の真実は Postgres の now() のみ（§14）
  if v_race.status <> 'scheduled' or v_race.scheduled_at <= now() + interval '60 minutes' then
    raise exception '登録の受付は終わっています（発走 60 分前まで）';
  end if;

  -- ★自分の馬か（★現役であること）
  select owner_id into v_owner from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  if exists (select 1 from horses where id = p_horse_id and retired_at_week is not null) then
    raise exception '引退した馬は登録できません';
  end if;

  -- ★★同じレースに 1 人 2 頭まで（D-104・T-7'）
  select count(*) into v_mine
    from race_entries e join horses h on h.id = e.horse_id
   where e.race_id = p_race_id and h.owner_id = v_user;
  if v_mine >= 2 then
    raise exception '同じレースに出せるのは 2 頭までです（§6.7・§10.4）';
  end if;

  -- ★料金（★登録料 ＋ 騎手の料金・D-105 ②）。★騎手を選ばなければ登録料だけ
  v_fee := 200;
  v_jockey_fee := coalesce((p_jockey_frozen ->> 'feeEP')::int, 0);
  if v_jockey_fee < 0 then raise exception '騎手の料金が不正'; end if;
  v_total := v_fee + v_jockey_fee;

  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;
  if v_balance < v_total then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, v_total
      using errcode = 'ST001';
  end if;

  -- ★枠は登録の順（★抽選と確定の枠順はワーカーが決め直す・§10.4）
  select coalesce(max(gate), 0) + 1 into v_gate from race_entries where race_id = p_race_id;

  insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
  values (p_race_id, p_horse_id, v_gate, 55, p_strategy, p_jockey_frozen)
  returning id into v_entry_id;

  update users set entry_points = entry_points - v_total where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_total, v_balance - v_total, 'entry_fee', p_race_id);

  return v_entry_id;
end;
$function$
;

-- ★利用者が呼ぶ RPC。authenticated だけに実行させる（`0022` と同じ形・V-20 ④）
revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

-- ── ① place_bet を §9.5 どおりに直す ─────────────────────────
--   ★`0020` の定義を土台に、**§9.5 の判定 1 か所だけ**を差し替えています（他は 1 文字も変えていません）。
--   ★変更点: 「自馬のどれか 1 頭を含めばよい」→ ★**「自馬を全頭含むこと」**
--   ★理由: §9.5-3「同一レースに自馬が複数いる場合は、それら全頭を含む組合せのみ可」。
--          ★D-104 で 2 頭まで出せるようになったので、1 頭だけを含む買い目を許すと
--          ★**もう 1 頭を負けさせる利得**が残ります（八百長利得の遮断装置・D-006 の前提）。
--   ⚠️ ★帰結: **2 頭出すと単勝・複勝は買えません**（1 頭しか選べないため）。
--      ★画面は理由を明示すること（黙って拒否しない・裁定 §5-2 の 2）。
CREATE OR REPLACE FUNCTION public.place_bet(p_race_id uuid, p_bet_type text, p_selection jsonb, p_amount integer, p_client_token uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_race races%rowtype;
  v_odds numeric(9,1);
  v_balance bigint;
  v_race_total bigint;
  v_kind_total bigint;
  v_day_total bigint;
  v_own_horse boolean;
  v_bet_id bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then
    raise exception '未認証';
  end if;
  if p_client_token is null then
    raise exception '冪等キー（client_token）が必要';
  end if;

  -- ★再送なら既存の馬券を返して終わる（EP を二度引かない）
  select id into v_bet_id from bets where user_id = v_user and client_token = p_client_token;
  if found then
    return v_bet_id;
  end if;

  -- ★行ロック。同じユーザーの同時購入で残高チェックをすり抜けさせない
  select entry_points into v_balance from users where id = v_user for update;
  if not found then
    raise exception 'ユーザーが存在しない';
  end if;

  select * into v_race from races where id = p_race_id;
  if not found then
    raise exception 'レースが存在しない';
  end if;
  -- ★発売時間内か。ゲーム内時刻の真実は Postgres の now() のみ（§14）
  if v_race.status <> 'scheduled' or v_race.scheduled_at <= now() then
    raise exception '発売時間外';
  end if;

  -- ★オッズはサーバー側の race_odds から取る。クライアントの申告値を使わない
  select ro.odds into v_odds
  from race_odds ro
  where ro.race_id = p_race_id and ro.bet_type = p_bet_type and ro.selection = p_selection;
  if not found then
    raise exception '発売していない買い目';
  end if;

  -- §9.4 上限（金額の下限・単位・1点上限は bets の CHECK が受け持つ）
  select coalesce(sum(amount), 0) into v_race_total
    from bets where user_id = v_user and race_id = p_race_id and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_kind_total
    from bets where user_id = v_user and race_id = p_race_id and bet_type = p_bet_type and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_day_total
    from bets where user_id = v_user and created_at >= date_trunc('day', now()) and status <> 'refunded';

  if v_kind_total + p_amount > 30000 then
    raise exception '1レース1券種の上限（30,000 EP）を超える';
  end if;
  if v_race_total + p_amount > 50000 then
    raise exception '1レース合計の上限（50,000 EP）を超える';
  end if;
  if v_day_total + p_amount > 500000 then
    raise exception '1日合計の上限（500,000 EP）を超える';
  end if;

  -- ★§9.5 自馬出走レースの制限（八百長利得の遮断装置）
  select exists (
    select 1 from race_entries e
    join horses h on h.id = e.horse_id
    where e.race_id = p_race_id and h.owner_id = v_user
  ) into v_own_horse;

  if v_own_horse then
    -- ★★自馬が複数なら「全頭を含む組合せ」だけ（§9.5-3・2026-09-16 の是正）
    --   ⚠️ 以前は「自馬のどれか 1 頭を含めばよい」だった。1 頭までしか出せない間は同じ意味だが、
    --      D-104 で 2 頭まで出せるようになったので、片方だけを含む買い目を許すと
    --      もう 1 頭を負けさせる利得が残る。
    if exists (
      select 1 from race_entries e
      join horses h on h.id = e.horse_id
      where e.race_id = p_race_id
        and h.owner_id = v_user
        and not (p_selection @> to_jsonb(e.gate))
    ) then
      raise exception '自馬出走レースでは自馬を全頭含む買い目のみ購入できる（§9.5）';
    end if;
    if v_race_total + p_amount > 5000 then
      raise exception '自馬出走レースの上限（5,000 EP）を超える';
    end if;
  end if;

  if v_balance < p_amount then
    raise exception 'EP が不足している';
  end if;

  -- --- ここから先は同一トランザクション。途中で例外が出れば全部戻る ---
  update users set entry_points = entry_points - p_amount where id = v_user;

  insert into bets (user_id, race_id, bet_type, selection, amount, odds_at_purchase, client_token)
  values (v_user, p_race_id, p_bet_type, p_selection, p_amount, v_odds, p_client_token)
  returning id into v_bet_id;

  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -p_amount, v_balance - p_amount, 'bet', p_race_id);

  return v_bet_id;
end;
$function$
;

-- ★★再定義したら、権限も同じ移行で置き直す（★`0022` の revoke は「前の定義」に対するものになるため）
--   ⚠️ ★これを忘れると、`rpc-guard.test.ts` が
--      「最後の定義より後に public からの revoke が無い（開きすぎ）」で落ちます。
--      ★**落ちるのが正しい** — ★`create or replace` で権限は消えませんが、
--      ★「定義より後に revoke がある」を検査の条件にしているのは、
--      ★**再定義のたびに権限を明示させる**ためです（黙って開いた状態を作らせない）。
revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;

commit;
