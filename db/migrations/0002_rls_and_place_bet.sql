-- STAR 0002 — RLS と 発売 RPC（正典 §14.4・§15.3・§8.6・§9.5）
--
-- ⚠️ 未適用。レビュー用（QUESTIONS_P2 Q-2 で「実行前に読んでほしい」と出した SQL です）。
--
-- 【A-4 について、正典の書き方をそのままでは実装できない点】
--   指示書は「RLS で `status != 'scheduled'` の行のみ露出」と書いていますが、
--   **発走前のレースは見えないと馬券が買えません**。隠したいのは行ではなく
--   `seed_reveal` という**列**で、Postgres の RLS は行単位なので列を隠せません。
--   → 実体テーブルへの select を剥奪し、**列をマスクしたビュー**を公開経路にします。
--     RLS も併せて張りますが、A-4 の実効はビュー側です。
--     この読み替えでよいか照会します（QUESTIONS_P2 に追記）。

begin;

-- ============================================================================
-- A-4: seed_reveal を確定前に露出させない（§8.6）
-- ============================================================================
alter table races enable row level security;
alter table race_entries enable row level security;
alter table bets enable row level security;
alter table ep_ledger enable row level security;
alter table pp_ledger enable row level security;

-- 実体テーブルは触らせない。読み取りはビュー経由に一本化する
revoke all on races from anon, authenticated;
revoke all on ep_ledger, pp_ledger from anon, authenticated;

create or replace view races_public
with (security_invoker = true) as
select
  r.id,
  r.name,
  r.grade,
  r.class_rank,
  r.surface,
  r.distance,
  r.track_condition,
  r.course_id,
  r.scheduled_at,
  -- ★commit は発走前に公開する（§8.6 の要件そのもの）
  r.seed_commit,
  -- ★reveal は確定後だけ。ここが漏れると Provably Fair が無意味になる
  case when r.status in ('settled', 'cancelled') then r.seed_reveal else null end as seed_reveal,
  r.status,
  r.purse
from races r;

grant select on races_public to anon, authenticated;

-- 台帳は本人の行だけ
create policy ep_ledger_own on ep_ledger for select using (user_id = auth.uid());
create policy pp_ledger_own on pp_ledger for select using (user_id = auth.uid());
create policy bets_own on bets for select using (user_id = auth.uid());
-- ★馬券の書き込みはポリシーで許さない。発売は下の RPC だけが行う
--   （クライアントが insert できると、残高を減らさずに馬券を作れる）

-- ============================================================================
-- A-5: EP 減算と馬券発行の原子性（§14.4）
-- ============================================================================
--
-- 【なぜ1つの関数に全部入れるのか】
--   「残高を確認 → EP を引く → 馬券を作る」をアプリ側で3回に分けると、
--   ネットワーク断で「EP だけ減って馬券が無い」事故が起きます（§14.4）。
--   Postgres の関数は**単一トランザクション**なので、途中で落ちれば全部戻ります。
--   A-5 の「壊して確かめる」検証は、この関数の途中で例外を起こして
--   **EP も馬券も動いていないこと**を確認する形になります。
--
-- 【security definer にする理由と、その危険】
--   呼び出し元（ログインユーザー）に users / bets の書き込み権限を与えないためです。
--   ただし definer は**呼び出し元の権限を無視する**ので、
--   `user_id` を引数で受け取ってはいけません（他人の EP で買えてしまう）。
--   **必ず auth.uid() を使う。**
create or replace function place_bet(
  p_race_id uuid,
  p_bet_type text,
  p_selection jsonb,
  p_amount int
) returns bigint
language plpgsql
security definer
-- search_path を固定する。definer 関数で未固定だと、呼び出し元が同名の関数を
-- 先に見つけさせて任意コードを実行できる（definer 関数の典型的な穴）
set search_path = public, pg_temp
as $$
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
  if v_user is null then
    raise exception '未認証';
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
    -- 自馬が絡まない買い目は買えない
    if not exists (
      select 1 from race_entries e
      join horses h on h.id = e.horse_id
      where e.race_id = p_race_id
        and h.owner_id = v_user
        and p_selection @> to_jsonb(e.gate)
    ) then
      raise exception '自馬出走レースでは自馬絡みの馬券のみ購入できる（§9.5）';
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

  insert into bets (user_id, race_id, bet_type, selection, amount, odds_at_purchase)
  values (v_user, p_race_id, p_bet_type, p_selection, p_amount, v_odds)
  returning id into v_bet_id;

  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -p_amount, v_balance - p_amount, 'bet', p_race_id);

  return v_bet_id;
end;
$$;

revoke all on function place_bet(uuid, text, jsonb, int) from public;
grant execute on function place_bet(uuid, text, jsonb, int) to authenticated;

commit;
