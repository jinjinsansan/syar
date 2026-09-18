-- 0045: 「効いている上限」の文言を直す（★`0044` の取りこぼし）
--
-- ============================================================================
-- 【🔴 ★何が間違っていたか】✔ staging で呼んで気づきました
--   ★`bet_allowance()` は ★**「いま効いているのはどの上限か」**を返す関数です。
--   🔴 ★ところが `0044` は ★**「…の上限に達しています」**と返していました。
--   → ★**何も買っていない人（残り 30,000 EP）にも「この券種の上限に達しています」**と出ます。
--
--   ★**名前と文言がずれていました** — ★`binding`（効いている）を返しているのに、
--   ★`binding_label` が `reached`（達した）の言葉になっていました。
--
-- 【★どう直すか】
--   ★`binding_label` は ★**上限の名前だけ**にします（「この券種の上限」）。
--   ★**「達した」かどうかは `remaining_ep = 0` かどうか**で、★**呼ぶ側が言います**。
--   ★`place_bet` の例外文は「◯◯を超えます（あと N EP まで）」にします。
--
-- ⚠️ ★**`0044` は書き換えていません**（★`migrate.mjs` が適用済みファイルの改変を拒みます。
--    ★実際に拒まれ、この番号に分けました）。★**規則も値も変えていません** — ★言葉だけです。
-- ============================================================================

begin;

create or replace function bet_allowance(
  p_user uuid,
  p_race_id uuid,
  p_bet_type text default null
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
  select * into v_lim from bet_limits where id;
  if not found then
    -- ★**無い行は通さない**（R-27・BT-4 ②）
    raise exception '投票の上限が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST002';
  end if;

  select coalesce(sum(amount), 0) into v_race_total
    from bets where user_id = p_user and race_id = p_race_id and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_kind_total
    from bets where user_id = p_user and race_id = p_race_id
      and (p_bet_type is null or bet_type = p_bet_type) and status <> 'refunded';
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
  -- ⚠️ 🔴 ★**「達しています」と書かないこと**（★2026-09-19・`0045` で直しました）。
  --    ★ここが返すのは ★**「いま効いているのはどの上限か」**であって、★**達したかどうかではありません**。
  --    🔴 ★`0044` は「達しています」と返しており、★**何も買っていない人（残り 30,000）にもそう出ていました**
  --      （★staging で実際に呼んで気づきました）。
  --    ★「達した」かどうかは ★**`remaining_ep = 0` かどうか**で、★呼ぶ側が言います。
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
  v_allow record;
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

  -- ★★上限（★2026-09-19・**BT-1 / BT-2**）
  --   🔴 ★旧: ★**4 つの上限を SQL に直書き**し、★比較もここで書いていました
  --      （30,000 / 50,000 / 500,000 / 5,000）。
  --   ★新: ★**`bet_allowance()` を呼ぶ**だけです。
  --     ★**規則（どれがいちばんきついか）は、その 1 本だけが持ちます**（BT-2）。
  --     ★`my_bet_allowance`（画面が読むビュー）も ★**同じ 1 本**を呼びます。
  --   ⚠️ ★**これが無いと、RPC とビューが同じ規則を別々に実装します** —
  --      ★ビューが緩ければ「押してから弾かれる」、★厳しければ「買えるのに買えないと出る」。
  --      ★後者は**誰も気づきません**（★`my_horses.wins` で自分から挙げた形と同じ）。
  --   ⚠️ ★§9.5 の「自馬を全頭含む」は ★**金額の話ではない**ので、★ここに残します。
  select * into v_allow from bet_allowance(v_user, p_race_id, p_bet_type);
  if v_allow.remaining_ep < p_amount then
    raise exception '%を超えます（あと % EP まで）', v_allow.binding_label, v_allow.remaining_ep
      using errcode = 'ST003';
  end if;

  -- ★§9.5 自馬出走レースの制限（八百長利得の遮断装置）
  --   ⚠️ ★**金額の上限は `bet_allowance()` が見ています**。★ここは**買い目の形**だけを見ます。
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
$function$;

comment on function bet_allowance(uuid, uuid, text) is
  '★あと何 EP 投票できるか（★2026-09-19・BT-1/BT-2、★0045 で文言を訂正）。'
  '★binding_label は「いま効いている上限の名前」であって「達した」ではない — '
  '★達したかどうかは remaining_ep = 0 かどうかで、呼ぶ側が言う。'
  '★place_bet も my_bet_allowance もこれを呼ぶ（★規則を 2 か所に書かないため）';

revoke all on function bet_allowance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;

commit;
