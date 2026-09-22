-- ---------------------------------------------------------------------------
-- 0062 `request_initial_breeding` の列の参照を直す（★PLAN I-2・2026-09-22）
--
-- 🔴 ★0061 の関数は ★呼ぶと落ちました（★staging の実演 `tools/verify-player-breeding-live.mjs` で発見）:
--   `column reference "status" is ambiguous`
--   ★`returns table (request_id, status, failure_reason, result_id)` の列名は、★PL/pgSQL の中では ★**変数にもなります**。
--   ★`where … status <> 'failed'` の `status` が ★表の列か出力の変数か決まらず、★落ちます。
--   ⚠️ ★偽の DB の検査（`player-breeding.test.ts`）では ★原理的に見えません（★SQL を実行しないため）。
--
-- 【★直し方】
--   ★表の列は ★**すべて別名（`r.`）付きで**参照します。★出力の変数と名前が重なっても曖昧になりません。
--   ★`0061` は staging に適用済みなので ★**書き換えません**（★`migrate.mjs` がチェックサムで拒む・正しい挙動）。
-- ---------------------------------------------------------------------------

begin;

create or replace function public.request_initial_breeding(
  p_request_id uuid, p_sire_id uuid, p_dam_id uuid
) returns table (request_id uuid, status text, failure_reason text, result_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_id uuid;
  v_owner uuid;
  v_kind text;
  v_status text;
  v_reason text;
  v_result uuid;
begin
  v_user := assert_setup_complete();
  if p_request_id is null or p_sire_id is null or p_dam_id is null then
    raise exception '要求 ID・父・母が必要です' using errcode = 'ST020';
  end if;
  if p_sire_id = p_dam_id then
    raise exception '父と母に同じ馬は選べません' using errcode = 'ST022';
  end if;

  -- ★第 1 段: 同じ要求 ID が既に在れば、その行を返す
  select r.id, r.user_id, r.kind, r.status, r.failure_reason, r.result_id
    into v_id, v_owner, v_kind, v_status, v_reason, v_result
    from foal_requests r where r.id = p_request_id;
  if found then
    if v_owner <> v_user or v_kind <> 'breed_initial' then
      -- ★他人の要求の中身を返さない
      raise exception 'その要求 ID は使えません' using errcode = 'ST021';
    end if;
    return query select v_id, v_status, v_reason, v_result;
    return;
  end if;

  -- ★第 2 段: 初回は利用者ごとに 1 件。★既に在れば（別タブ・別の要求 ID）その行を返す
  select r.id, r.status, r.failure_reason, r.result_id
    into v_id, v_status, v_reason, v_result
    from foal_requests r
   where r.user_id = v_user and r.kind = 'breed_initial' and r.status <> 'failed'
   limit 1;
  if found then
    return query select v_id, v_status, v_reason, v_result;
    return;
  end if;

  -- ★同時に 2 本来た場合は部分一意（foal_requests_one_initial_per_user）が 1 本を落とす。
  --   ★落ちた側は、勝った側の行を返す
  begin
    insert into foal_requests (id, user_id, kind, sire_id, dam_id)
         values (p_request_id, v_user, 'breed_initial', p_sire_id, p_dam_id);
  exception when unique_violation then
    select r.id, r.status, r.failure_reason, r.result_id
      into v_id, v_status, v_reason, v_result
      from foal_requests r
     where r.user_id = v_user and r.kind = 'breed_initial' and r.status <> 'failed'
     limit 1;
    if not found then
      -- ★主キー（要求 ID）の衝突。★他人の行なら中身を返さない
      select r.id, r.user_id, r.kind, r.status, r.failure_reason, r.result_id
        into v_id, v_owner, v_kind, v_status, v_reason, v_result
        from foal_requests r where r.id = p_request_id;
      if not found or v_owner <> v_user or v_kind <> 'breed_initial' then
        raise exception 'その要求 ID は使えません' using errcode = 'ST021';
      end if;
    end if;
    return query select v_id, v_status, v_reason, v_result;
    return;
  end;

  return query select p_request_id, 'pending'::text, null::text, null::uuid;
end;
$function$;

revoke all on function public.request_initial_breeding(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_initial_breeding(uuid, uuid, uuid) to authenticated;

commit;
