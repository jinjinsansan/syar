-- STAR 0008 — 景品交換の RPC（正典 §11.3・§14.4）
--
-- ★place_bet と同じ構造にします: 同一トランザクション・冪等キー・行ロック。
--   PP の減算と在庫の減算と履歴の記録が**分かれていると**、
--   「PP だけ減って景品が出ない」事故が起きます。

begin;

alter table prize_exchanges add column if not exists client_token uuid;
create unique index if not exists prize_exchanges_token_uniq
  on prize_exchanges (user_id, client_token);

create or replace function exchange_prize(
  p_prize_id bigint,
  p_client_token uuid
) returns bigint
language plpgsql
security definer
-- ★definer 関数で search_path を固定しないと、呼び出し元が同名関数を
--   先に見つけさせて任意コードを実行できる
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_prize prize_catalog%rowtype;
  v_pp bigint;
  v_id bigint;
begin
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
$$;

revoke all on function exchange_prize(bigint, uuid) from public;
grant execute on function exchange_prize(bigint, uuid) to authenticated;

commit;
