-- 0057: 調教の指示を置く場所（TRAINING-INSTRUCTION-NOT-READ）
--
-- ============================================================================
-- 【🔴 ★なぜ要るか】
--   ★`/training` で献立を選べますが、★**誰も読んでいませんでした。**
--   ✔ ★現物（`apps/worker/src/training-runner.ts:319`）:
--       `let menu = defaultMenu(age, state.fatigue);`
--     ★ワーカーは ★**自分で決めます**。★利用者の選択を読む経路が ★**0 件**でした。
--   ⚠️ ★`horse_week_log.menu_chosen`（`0011`）は ★**ワーカーが「何を選んだか」を書く記録**で、
--     ★**指示の入れ物ではありません**（★読む側が居ない）。
--   🔴 ★このまま `spend_training_ep` を呼ぶと ★**EP だけ減って調教は変わりません** —
--     ★★「繋がっていない」より悪い状態です。★だから先にここを作ります。
--
-- 【★設計（★レビュー側の裁定・2026-09-20）】
--   ① ★置き場 … ★この表。★`unique (horse_id, week)` で ★**1 週 1 つ**
--   ② ★書く口 … ★RPC `set_training_order`。★**所有の確認はサーバー側**（憲法 §0.2-4）
--   ③ ★読む口 … ★`training-runner` が `defaultMenu` の**前に**読む
--   ④ ★締切 … ★**まだ処理されていない週**だけ書ける
--
-- 【🔴 ★EP をここで減らさない】
--   ★減らすのは ★**ワーカーが実際に調教したとき**（★`spend_training_ep` は既にそこに在る）。
--   → ★★**「EP だけ減って何も起きない」が原理的に起きません。**
-- ============================================================================
begin;

create table if not exists training_orders (
  horse_id uuid not null references horses(id),
  -- ★どの週の指示か（★ゲームの週。★`horses.last_processed_week` と同じ尺度）
  week bigint not null,
  -- ★献立（★`@star/training` の `MENU_IDS` と同じ 8 つ）
  menu text not null,
  created_at timestamptz not null default now(),
  primary key (horse_id, week),
  -- 🔴 ★**任意の文字列を書かせない**（★C-1 と同じ作法。★画面の綴り間違いをここで止める）
  constraint training_orders_menu_known check (
    menu in ('hill', 'wood', 'pool', 'gate', 'partner', 'hard', 'light', 'rest')
  ),
  constraint training_orders_week_non_negative check (week >= 0)
);

comment on table training_orders is
  '★利用者が選んだ調教の献立（★2026-09-20・TRAINING-INSTRUCTION-NOT-READ）。'
  '★1 頭 1 週 1 つ（primary key）。★指示が無い週は★既定の献立で調教される（★裁定 (a)）。'
  '🔴 ★EP はここで減らさない — ★減らすのは★ワーカーが実際に調教したとき。'
  '★★そうしないと「EP だけ減って何も起きない」が起きる。';

-- ★クライアントは直に読み書きしない（★RPC 経由・V-20 の登録簿では closed）
revoke all on training_orders from anon, authenticated;

-- ── ★書く口（★所有の確認はサーバー側） ──────────────────────
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
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  -- 🔴 ★所有と、★その週がまだ処理されていないことを★同じ 1 文で確かめる
  select owner_id, last_processed_week into v_owner, v_processed
    from horses where id = p_horse_id for update;
  if v_owner is null or v_owner <> v_user then
    raise exception '自分の馬ではありません' using errcode = 'ST011';
  end if;
  -- ⚠️ ★処理済みの週へは書けない（★締切。★過去を書き換えさせない）
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
