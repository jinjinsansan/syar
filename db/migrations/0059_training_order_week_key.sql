-- 0059: 調教の指示の「週」の鍵を、読む側と合わせる
--
-- ============================================================================
-- 🔴 【★これが無いと、★指示は 1 度も効きません】
--
--   ✔ ★現物（★2026-09-21 に突き合わせました）:
--     ★読む側 `apps/worker/src/training-runner.ts:306`
--         `const weeks = r.rows.map((x) => Number(x.last_processed_week));`
--         → ★**`week = last_processed_week` の注文を読みます**
--         （★`:318` `const week = last;` … ★これから処理する週が `last` です）
--     ★書く側 `0057` / `0058` の RPC
--         `if v_processed is not null and p_week <= v_processed then raise ...`
--         → ★**`p_week = last_processed_week` を拒否します**
--
--   → ★★**ワーカーが読む唯一の鍵を、★RPC がちょうど拒む形**でした。
--     ★★**書いても読まれず、★読もうとしても書けない。★機構が原理的に発火しません。**
--
--   ⚠️ ★型検査でも、★偽の DB でも出ません（★両側とも「正しく」動いているため）。
--     ★★**2 つの鍵を並べて読んで、★初めて出ました。**
--
-- 【★直し方】
--   ★拒むのは ★**過ぎた週だけ**（`p_week < v_processed`）にします。
--   ★`p_week = v_processed`（★これから処理する週）は ★**受け付けます**。
--   ⚠️ ★処理中に上書きされる可能性は残りますが、★週送りは 1 取引で走るので
--     ★**途中の馬に別の献立が混ざることはありません**（★読んだ後に書かれたら次週から効きます）。
-- ============================================================================
begin;

create or replace function public.set_training_order(
  p_horse_id uuid, p_week bigint, p_menu text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_processed bigint;
begin
  -- 🔴 ★D-080: ★書き込み RPC は、★まずセットアップの完了を確かめる
  perform assert_setup_complete();
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  select owner_id, last_processed_week into v_owner, v_processed
    from horses where id = p_horse_id for update;
  if v_owner is null or v_owner <> v_user then
    raise exception '自分の馬ではありません' using errcode = 'ST011';
  end if;
  -- 🔴 ★**過ぎた週だけ**を拒みます（★`<=` から `<` へ・★上の註記）
  if v_processed is not null and p_week < v_processed then
    raise exception '★その週は既に処理されています（week=%, 済=%）', p_week, v_processed
      using errcode = 'ST012';
  end if;
  insert into training_orders (horse_id, week, menu)
       values (p_horse_id, p_week, p_menu)
  on conflict (horse_id, week) do update set menu = excluded.menu, created_at = now();
end;
$function$;

revoke all on function public.set_training_order(uuid, bigint, text) from public, anon;
grant execute on function public.set_training_order(uuid, bigint, text) to authenticated;

commit;
