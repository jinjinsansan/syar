-- ---------------------------------------------------------------------------
-- 0078 初回の配合の母の候補: 述語を 1 か所にする（★2026-09-24・レビュー側の条件 ①）
--
-- 【★何が悪かったか】
--   ★`0077` は ★**同じ述語を 2 回**書いていました（★総数を数える `select count(*)` と、★行を返す `return query`）。
--   ★片方だけ直した日に、★**「N 頭から選べます」と実際に出る行が食い違います**。
--   ★しかも ★**どちらも正しく動く**ので、★気づくのは利用者が数え始めてからです。
--
-- 【★直し方】
--   ★`with candidates as (...)` で ★**1 回だけ**書き、★総数も行もそこから取ります。
--
-- ⚠️ ★`0077` は staging に適用済みなので ★**書き換えません**（★`migrate.mjs` がチェックサムで拒みます）。
--    ★`create or replace` で上書きします。★**引数も戻りの列も変えません**（★画面は無変更）。
--
-- ⚠️ ★**ワーカー側（`apps/worker/src/player-breeding.ts` の `damCandidateExists`）との重複は残ります。**
--    ★あちらは確定の判定で、★こちらは下見です。★層が違うので 1 つにできません。
--    → ★**実演で突き合わせます**（`tools/verify-initial-breeding-dams.mjs` の ③:
--      ★「RPC が返す総数」と「ワーカーの述語で直に数えた件数」の一致）。
-- ---------------------------------------------------------------------------

begin;

create or replace function public.initial_breeding_dams(
  p_min_breeding_age_weeks int, p_max_lifetime_foals int, p_limit int
) returns table (
  horse_id uuid, name text, birth_week bigint, foal_count int, total_prize_pp bigint,
  total_count bigint, age_known boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_week bigint;
  v_known boolean := false;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  if p_min_breeding_age_weeks is null or p_max_lifetime_foals is null or p_limit is null then
    raise exception '候補の判定に要る値（年齢の下限・生涯の産駒数の上限・件数）を渡してください' using errcode = 'ST040';
  end if;
  if p_limit <= 0 or p_limit > 200 then
    raise exception '件数は 1〜200 です' using errcode = 'ST040';
  end if;

  -- ★いまの週（★ワーカーが書く）。★読めなければ年齢で絞らない（★0068 と同じ考え方）
  select w.game_week into v_week from world_state w where w.id = true;
  v_known := found;

  return query
  with candidates as (
    -- ★★述語はここ 1 か所だけ（★0078 の主旨）
    select h.id, h.name as horse_name, h.birth_week as bw, h.foal_count as fc
      from horses h
     where h.sex = 'female' and h.owner_id is null and h.retirement_role = 'honored'
       and not h.bred_this_year and h.foal_count < p_max_lifetime_foals
       and h.birth_week is not null
       and (not v_known or v_week - h.birth_week >= p_min_breeding_age_weeks)
  ), counted as (
    select count(*) as n from candidates
  )
  select c.id, c.horse_name, c.bw, c.fc, horse_total_prize_pp(c.id),
         (select n from counted), v_known
    from candidates c
   order by md5(v_user::text || c.id::text)
   limit p_limit;
end;
$function$;

comment on function public.initial_breeding_dams(int, int, int) is
  '★初回の配合で選べる母の候補（★0077 → ★0078 で述語を 1 か所に）。'
  '★述語は apps/worker/src/player-breeding.ts の damCandidateExists と同じ（★確定の判定はワーカー）。'
  '★並びは利用者ごとに違い、★同じ人には毎回同じ（★乱数ではない・憲法 4）。'
  '★素質・能力は返さない（★D-114）';

revoke all on function public.initial_breeding_dams(int, int, int) from public, anon;
grant execute on function public.initial_breeding_dams(int, int, int) to authenticated;

commit;
