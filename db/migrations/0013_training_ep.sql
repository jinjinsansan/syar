-- 0013: 調教の EP 消費（正典 §7.2・§11.4 / P3 の G-6）
--
-- 【★憲法③ サーバー権威】
--   EP の引き落としと台帳への記帳は**同一トランザクション**でなければなりません。
--   別々にすると「引かれたが記帳されていない」「記帳されたが引かれていない」が作れます。
--   → 関数の中で両方やります。クライアントにも、ワーカーのアプリコードにも分けません。
--
-- 【★二重記帳を「気をつける」で防がない】
--   週送りは**再実行されます**（ワーカーの再起動・障害復旧）。
--   P2 で `cycle_index` の一意制約が「同じサイクルのレースを2回作る」を止めたのと同じ形で、
--   **台帳そのものに冪等キーを持たせて、DB が二度目を拒む**ようにします。
--   ★アプリ側の「もう処理したか確認してから書く」は、同時実行ですり抜けます。
--
-- 【★正典に無いので実装しないもの（照会）】
--   - **EP が足りないときにどうするか**（Q-P3-23）。§7.2 は費用を定めますが、
--     払えない場合の扱い（休養に落とす／調教しない／借りられる）を書いていません。
--     → ここでは**例外を投げます**。呼ぶ側が決める話を、DB 側で発明しません。
--   - **プレイヤーがメニューを選ばなかった週の既定**（Q-P3-24）。

begin;

-- ★台帳の冪等キー。null は重複を許すので、既存行に遡って埋める必要はない
alter table ep_ledger add column if not exists dedupe_key text;
create unique index if not exists ep_ledger_dedupe_key_uniq
  on ep_ledger (dedupe_key) where dedupe_key is not null;

comment on column ep_ledger.dedupe_key is
  '★二度書きを DB で拒むための鍵（例: training:<horse_id>:<week>）。アプリ側の「確認してから書く」は同時実行ですり抜けるため、制約で止める';

/**
 * 調教1週ぶんの EP を引き落として記帳する。
 *
 * 戻り値: 引き落とし後の残高。★NPC 馬（所有者なし）は課金対象でないので null。
 *
 * ★`p_week` は絶対週。冪等キーに入るので、**同じ馬の同じ週は二度引かれません**。
 */
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
  -- ★NPC 馬には所有者がいないので EP を引かない。★ここで 0 を返すと
  --   「残高 0 のプレイヤー」と見分けがつかないので null を返す
  if v_owner is null then
    return null;
  end if;

  v_key := 'training:' || p_horse_id::text || ':' || p_week::text;

  -- ★再実行なら、そのときの残高をそのまま返して終わる（二度引かない）
  select balance_after into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_existing;
  end if;

  -- ★行ロック。同じプレイヤーの複数の馬を並列に進めても残高チェックをすり抜けさせない
  select entry_points into v_balance from users where id = v_owner for update;
  if not found then
    raise exception '所有者が存在しない: %', v_owner;
  end if;

  -- ★休養（0 EP）で残高 0 の行を作らない。台帳が動きの無い行で埋まる
  if p_amount = 0 then
    return v_balance;
  end if;

  if v_balance < p_amount then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, p_amount;
  end if;

  update users set entry_points = entry_points - p_amount where id = v_owner;

  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id, dedupe_key)
  values (v_owner, -p_amount, v_balance - p_amount, 'training', p_horse_id, v_key);

  return v_balance - p_amount;
end;
$$;

revoke all on function spend_training_ep(uuid, bigint, int) from public;
-- ★プレイヤーには渡しません。週送りはサーバー（ワーカー）だけが行います
revoke all on function spend_training_ep(uuid, bigint, int) from authenticated;

comment on function spend_training_ep(uuid, bigint, int) is
  '調教1週ぶんの EP を引き落として ep_ledger に記帳する（§7.2・§11.4）。★引き落としと記帳は同一トランザクション。★同じ馬の同じ週は dedupe_key により二度引かれない。★NPC 馬は null を返す（課金対象でない）';

commit;
