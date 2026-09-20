-- 0058: set_training_order に assert_setup_complete() を足す（D-080）
--
-- 🔴 【★なぜ】
--   ★`0057` で作った書き込み RPC が、★**`assert_setup_complete()` を呼んでいませんでした**。
--   ✔ ★`apps/cli/test/rpc-guard.test.ts` が捕まえました:
--     「★すべての書き込み RPC が `assert_setup_complete()` を呼ぶ（★ワーカー専用関数を除く）」
--   ⚠️ ★私は ★**既に在る規則を読まずに RPC を書きました**。★検査が止めてくれました。
--   ★`0057` は staging に適用済みなので、★**書き換えず**にここで差し替えます
--   （★`migrate.mjs` は適用済みファイルの書き換えを正しく拒みます）。
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
  if v_processed is not null and p_week <= v_processed then
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
