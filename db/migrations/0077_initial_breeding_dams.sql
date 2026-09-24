-- ---------------------------------------------------------------------------
-- 0077 初回の配合で選べる「母」を読む口（★2026-09-24）
--
-- 【★なぜ要るか】
--   ★オーナー決定（2026-09-22）の案 A は「★付与 1 頭 ＋ ★**無償の生産 1 頭**」。
--   ★`request_initial_breeding`（0061/0062）も `my_initial_breeding`（0061/0073）も
--   ★**本番に入っています**が、★**呼ぶ画面がありません**（報告 `REPORT_SERVER_WITHOUT_SCREEN_20260924.md` §2）。
--   → ★登録した人は、★受け取れるはずの馬を ★**1 頭 受け取れていません**。
--
--   ★画面を作るのに 1 つ足りませんでした: ★**候補の母を読む口**です。
--   ★父は `npc_stallion_facts`（0071）が在ります。★母は ★`/stable/breed`（自分の牝馬 × NPC 種牡馬）では
--   ★**自分の馬だった**ので、★読む口が作られていませんでした。
--   ✔ ★利用者が呼べる関数を全部並べて確かめました（★`grant execute on function` の走査）。
--
-- 【★条件は 1 か所から】
--   ★述語は ★`apps/worker/src/player-breeding.ts` の `damCandidateExists` と ★**同じ**です
--   （★`isInitialParent` ＋ 産める条件）。★確定の判定はワーカーで、★ここは ★**下見**です。
--   ⚠️ ★閾値（年齢の下限・生涯の産駒数の上限）は ★**渡してもらいます**（★D-052・SQL に定数を写さない）。
--      ★`my_onboarding_state`（0067/0068）と ★同じ引数の形にしてあります。
--
-- 【★いまの週が読めないとき】
--   ★`world_state` が無い・古いことがあります（★0068 の実害: ★staging で行が 0 でした）。
--   → ★`age_known = false` を返し、★**年齢での絞り込みをしません**（★候補を空にしない）。
--      ★画面は「いま選べないかもしれない」を出すだけ。★確定の判定はワーカーです。
--   ⚠️ ★ここで空を返すと、★画面は「候補切れ」と誤って出します（★0068 と同じ罠）。
--
-- 【★並び】
--   🔴 ★`order by h.id` に ★**しません**。★本番の母は 1,897 頭で、★画面には一部しか出せません。
--      ★全員に同じ先頭を見せると、★同じ母に集まり、★確定で弾かれる人が増えます。
--   → ★**利用者ごとに違う、★毎回同じ**並びにします（`md5(利用者 || 馬)`）。
--      ⚠️ ★乱数ではありません（★憲法 4）。★同じ人は何度開いても同じ順です。
--
-- ⚠️ ★素質・能力の数値は返しません（★D-114）。★名前・生まれ・産んだ数・獲得賞金だけ。
-- ---------------------------------------------------------------------------

begin;

create or replace function public.initial_breeding_dams(
  p_min_breeding_age_weeks int, p_max_lifetime_foals int, p_limit int
) returns table (
  horse_id uuid, name text, birth_week bigint, foal_count int, total_prize_pp bigint,
  -- ★候補の総数（★画面が「N 頭から選べます」と出すため。★`p_limit` で切る前の数）
  total_count bigint,
  -- ★いまの週が読めたか（★false なら年齢で絞っていない）
  age_known boolean
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
  v_total bigint;
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

  select count(*) into v_total
    from horses h
   where h.sex = 'female' and h.owner_id is null and h.retirement_role = 'honored'
     and not h.bred_this_year and h.foal_count < p_max_lifetime_foals
     and h.birth_week is not null
     and (not v_known or v_week - h.birth_week >= p_min_breeding_age_weeks);

  return query
    select h.id, h.name, h.birth_week, h.foal_count, horse_total_prize_pp(h.id), v_total, v_known
      from horses h
     where h.sex = 'female' and h.owner_id is null and h.retirement_role = 'honored'
       and not h.bred_this_year and h.foal_count < p_max_lifetime_foals
       and h.birth_week is not null
       and (not v_known or v_week - h.birth_week >= p_min_breeding_age_weeks)
     order by md5(v_user::text || h.id::text)
     limit p_limit;
end;
$function$;

comment on function public.initial_breeding_dams(int, int, int) is
  '★初回の配合で選べる母の候補（★2026-09-24・0077・案 A の「無償の生産 1 頭」）。'
  '★述語は apps/worker/src/player-breeding.ts の damCandidateExists と同じ（★確定の判定はワーカー）。'
  '★並びは利用者ごとに違い、★同じ人には毎回同じ（★乱数ではない・憲法 4）。'
  '★素質・能力は返さない（★D-114）';

revoke all on function public.initial_breeding_dams(int, int, int) from public, anon;
grant execute on function public.initial_breeding_dams(int, int, int) to authenticated;

commit;
