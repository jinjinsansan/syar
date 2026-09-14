-- 0021: spend_training_ep をワーカー専用として閉じる（監査 H-3＋H-4・D-095 候補）
--
-- ============================================================================
-- ⚠️ 【下書き・未適用】（2026-09-14 開発側）
--   本体は `0020` に再掲された定義（`pg_get_functiondef()` の出力）から作りました。
--   指示書 AF-3 §4-1 が求める「稼働中の定義を取得し、staging と本番の md5 が一致することを
--   確かめてから生成」は、**DB への接続許可を待っているため、まだ実施していません**。
--   → 照合で `0020` の本文と食い違いが出たら、このファイルを作り直します。**照合前に適用しないこと。**
--
-- 【何をするか（3 つを同じファイルで・裁定 §4-2）】
--   ① 本体から `assert_setup_complete()` を外す
--        ワーカーは Postgres に直結し、利用者の JWT を持たないので、`0020` 以降は
--        **毎回「未認証」で例外**になり、持ち馬が全頭休養に落ちていた（監査 H-3）。
--        D-080 は「利用者が呼ぶ RPC」を前提にした決定で、ワーカーだけが呼ぶこの関数は想定外だった（裁定 §3-6）。
--   ② public・anon・authenticated から EXECUTE を剥がす
--        `0013`・`0014` は public と authenticated だけを剥がし、**anon が抜けていた**（監査 H-4）。
--        この関数は額を呼ぶ側が決め、呼んでいるのが誰かを見ない。
--        anon に EXECUTE があれば、残高と同じ額を 1 回渡すだけで持ち主の EP を 0 にできた（裁定 §3-1）。
--        ★①だけを入れると、この穴が戻る。**①と②は同じトランザクションでしか入れない。**
--   ③ EP 不足に専用の SQLSTATE（`ST001`）を付ける
--        ワーカーはこの SQLSTATE だけを「休養に落とす」理由として扱う
--        （`apps/worker/src/training-runner.ts` の `EP_SHORT_SQLSTATE`）。
--        メッセージの文字列一致は使わない（文言を直した日に黙って外れる）。
--        値の一致は `apps/cli/test/rpc-guard.test.ts` が照合する。
--
-- 【採らなかった形】
--   関数の中で「ワーカーからの呼び出しなら検査を飛ばす」と分岐する形。
--   接続ロールの名前はプーラを挟むと変わりうるので、判定を誤ると**広く通る側**に倒れる（R-27・裁定 §4-2）。
--
-- 【`0020` の本文からの変更点】（この 2 か所だけ）
--   - 先頭のセットアップ判定の 1 行を削除
--   - EP 不足の例外に `using errcode = 'ST001'` を追加
-- ============================================================================
begin;

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
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, p_amount
      using errcode = 'ST001';
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

-- ★ワーカー（Postgres 直結）だけが呼ぶ。利用者のロールには実行させない（②）
revoke all on function public.spend_training_ep(uuid, bigint, integer) from public, anon, authenticated;

commit;
