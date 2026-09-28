-- ★**投票の締切を 発走の 1 分前に**（★2026-09-29・正典 §9.6・§10.2・レビュー側の裁定 cd46add）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。
--
-- 【🔴 ★なぜ】
--   ★正典 §9.6 の購入の流れは「発売開始 → ★発売締切 → 発走〜走行」。★締切は ★発走より前。
--   ★6 分の周では ★`PHASE_OFFSET_MS.salesClose`（`packages/scheduler/src/cycle.ts`）＝ 周の 5:00 ＝ ★発走の 1 分前。
--   ★パドック・返し馬の段（5:00〜6:00）は ★発売が閉じている前提の演出。
--   ★ところが `place_bet`（`0045`）は ★`scheduled_at <= now()` だけを見ていて、★**発走の瞬間まで受けていた**
--   （★2026-09-29 に 仕組みの説明の点検で発見・★正典に対する実装の欠落）。
--
-- 【★動かすもの】
--   ① ★締切の余裕（秒）を ★SQL の 1 か所に置く: `sales_close_lead_seconds()`（★`ep_grant_amount` と同じ形）。
--      ★TS の写し（`CYCLE_MS − PHASE_OFFSET_MS.salesClose`）との一致は ★網 `sales-close-sql.test.ts` が見る。★SQL に 60 を直書きしない。
--   ② ★`place_bet` の発売時間の判定だけを ★`scheduled_at − 余裕 <= now()` に変える。
--      ★本体は `0045` の定義を ★そのまま写し、★その 1 行だけ変えている（★拒む語は既存の「発売時間外」のまま）。
--   ⚠️ ★`create or replace` は ★既存の実行権を変えません（★末尾の revoke/grant は `0045` と同じ）。
-- ---------------------------------------------------------------------------
begin;

create or replace function public.sales_close_lead_seconds()
returns integer
language sql
immutable
as $$
  -- ★発走の何秒前に 発売を締め切るか（★正典 §9.6・★TS は CYCLE_MS − PHASE_OFFSET_MS.salesClose）
  select 60;
$$;

comment on function public.sales_close_lead_seconds() is
  '★発走の何秒前に発売を締め切るか（★2026-09-29・0096）。★place_bet が読む 1 か所。★TS の CYCLE_MS − PHASE_OFFSET_MS.salesClose と網で一致を見る';

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
  --   ★2026-09-29（`0096`）: ★発走の瞬間ではなく ★締切（発走 − `sales_close_lead_seconds()`）で閉じる（★正典 §9.6）
  if v_race.status <> 'scheduled'
     or v_race.scheduled_at - make_interval(secs => sales_close_lead_seconds()) <= now() then
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

revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;

commit;
