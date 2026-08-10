-- 0014: spend_training_ep の同時実行を関数側で吸収する（P3 G-6）
--
-- 【何が起きたか】
--   G-6 の④で、同じ馬の同じ週を**同時に5本**叩きました。
--   記帳は1行・引き落としは1回で正しかったのですが、**1本が一意制約違反で失敗**しました。
--
--   「先に select して、無ければ insert」は、select と insert のあいだに
--   別のトランザクションが入ると必ずこうなります。★制約が最後の砦として働いた形です。
--
-- 【なぜ直すか】
--   ★呼ぶ側（ワーカー）から見ると、これは「課金に失敗した」に見えます。
--     実際には**既に課金済み**なので、そこで週送りを止めるのは誤りです。
--   → 一意制約違反を関数の中で捕まえ、**既に引かれている残高を返します**。
--     ★制約は外しません。外すと二度引きが本当に通ります。
begin;

create or replace function spend_training_ep(
  p_horse_id uuid,
  p_week bigint,
  p_amount int
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_balance bigint;
  v_key text;
  v_existing bigint;
begin
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
$$;

revoke all on function spend_training_ep(uuid, bigint, int) from public;
revoke all on function spend_training_ep(uuid, bigint, int) from authenticated;

commit;
