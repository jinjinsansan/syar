-- 0020: 既存の書き込み RPC に assert_setup_complete() を入れる（D-080）
--
-- ============================================================================
-- 【なぜ別ファイルなのか】
--   適用済みのマイグレーションは書き換えません（`migrate.mjs` がチェックサムで落とします）。
--   `create or replace function` は**本体を丸ごと**必要とするため、
--   ここに3関数の現行定義を再掲したうえで、**先頭に1行だけ**足しています。
--
-- 【★本体は手で写していません】
--   `pg_get_functiondef()` で**稼働中の定義をそのまま取得**し、本体の `begin` の直後に
--   `perform assert_setup_complete();` を1行挿入したものです。
--   ★併せて **staging と本番の定義が md5 で一致すること**を確認してから生成しました
--   （食い違っていたら、どちらを写したのかが分からなくなります）。
--
-- 【何が変わるか】
--   3つとも「未認証」は既に弾いていましたが、**「認証済みだが口座が無い」を見ていません**でした。
--   D-078 で「auth ユーザーはあるが `users` 行が無い」が**正常な中間状態**になるので、
--   ここを明示的に拒否します。★落ち方を RPC ごとにばらけさせない（D-080）。
-- ============================================================================
begin;

-- ── exchange_prize ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exchange_prize(p_prize_id bigint, p_client_token uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_prize prize_catalog%rowtype;
  v_pp bigint;
  v_id bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キーが必要'; end if;

  -- ★再送なら既存の交換を返して終わる（PP を二度引かない）
  select id into v_id from prize_exchanges where user_id = v_user and client_token = p_client_token;
  if found then return v_id; end if;

  -- ★在庫を行ロックで取る。同時交換で在庫がマイナスにならない
  select * into v_prize from prize_catalog where id = p_prize_id for update;
  if not found then raise exception '景品が存在しない'; end if;
  if not v_prize.active then raise exception '掲載されていない景品'; end if;
  if v_prize.stock <= 0 then raise exception '在庫切れ'; end if;

  select prize_points into v_pp from users where id = v_user for update;
  if v_pp < v_prize.cost_pp then raise exception 'PP が不足している'; end if;

  -- --- 同一トランザクション ---
  update prize_catalog set stock = stock - 1 where id = p_prize_id;
  update users set prize_points = prize_points - v_prize.cost_pp where id = v_user;

  -- ★reason は 'prize_exchange'。**EP に戻す経路を作らない**（S-5・P-3）
  insert into pp_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_prize.cost_pp, v_pp - v_prize.cost_pp, 'prize_exchange', null);

  insert into prize_exchanges (user_id, prize_id, cost_pp, client_token)
  values (v_user, p_prize_id, v_prize.cost_pp, p_client_token)
  returning id into v_id;

  return v_id;
end;
$function$
;

-- ── place_bet ──────────────────────────────────────────────
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

  insert into bets (user_id, race_id, bet_type, selection, amount, odds_at_purchase, client_token)
  values (v_user, p_race_id, p_bet_type, p_selection, p_amount, v_odds, p_client_token)
  returning id into v_bet_id;

  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -p_amount, v_balance - p_amount, 'bet', p_race_id);

  return v_bet_id;
end;
$function$
;

-- ── spend_training_ep ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_training_ep(p_horse_id uuid, p_week bigint, p_amount integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_balance bigint;
  v_key text;
  v_existing bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if p_amount < 0 then
    raise exception '調教の EP は負にできない（受け取った値: %）', p_amount;
  end if;

  select owner_id into v_owner from horses where id = p_horse_id;
  if not found then
    raise exception '馬が存在しない: %', p_horse_id;
  end if;
  if v_owner is null then
    return null;
  end if;

  v_key := 'training:' || p_horse_id::text || ':' || p_week::text;

  select balance_after into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_existing;
  end if;

  select entry_points into v_balance from users where id = v_owner for update;
  if not found then
    raise exception '所有者が存在しない: %', v_owner;
  end if;

  if p_amount = 0 then
    return v_balance;
  end if;

  if v_balance < p_amount then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, p_amount;
  end if;

  begin
    -- ★記帳を先に行う。ここで一意制約に当たれば、残高はまだ動いていない
    insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
    values (v_owner, -p_amount, v_balance - p_amount, 'training', p_horse_id, v_key);
  exception when unique_violation then
    -- ★同時に走った別のトランザクションが先に記帳した。既に引かれているので、その残高を返す
    select balance_after into v_existing from ep_ledger where dedupe_key = v_key;
    return v_existing;
  end;

  update users set entry_points = entry_points - p_amount where id = v_owner;
  return v_balance - p_amount;
end;
$function$
;

commit;
