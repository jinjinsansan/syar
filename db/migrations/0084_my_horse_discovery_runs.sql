-- ---------------------------------------------------------------------------
-- ★**自分の馬が、どんな条件で何回 走ったか**（★発見度の素）
--    ★正典 **D-108**・**D-116**「発見＝距離・馬場・脚質・気性の判明」
--    ★裁定 `REVIEW_DISCOVERY_AXES_20260925.md` §4（2026-09-25）
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★なぜ要るか】
--   ★`/stable/retired` の「判明した能力」は ★**見本のデータ**で、しかも
--   ★**軸が正典と違っていました**（★能力 4 つを出していた。★正典は距離・馬場・脚質・気性）。
--   ★`0034` は「★列は要りません。★戦績から計算できます」と書いていましたが、
--   ★**その計算をする口は作られていませんでした**（★D-119 の族）。
--
-- 【★この口が返すもの・返さないもの】（★裁定 §4 条件 3）
--   ✅ 返す: ★**回数と戦績の事実だけ**（★条件の生の値ごとの出走回数）
--   🔴 返さない: ★素質・現在値・★**発見の段**（`unknown`/`hint`/`narrow`/`known`）
--   ⚠️ ★段は ★**TS の 1 か所**（`discoveryStageOf`・`@star/sim-engine`）が決めます（★D-108 ②・条件 2）。
--      ★SQL で段を計算しません。★2 か所で決めると、★片方だけ直した日に段がずれます。
--
-- 【⚠️ ★距離の「帯」をここで決めません】（★D-052）
--   ★正典 §8.2 の 5 段は ★`DISTANCE_BANDS`（`@star/race-engine`）が持っています。
--   ★ここで `case when distance <= 1400 ...` と書くと ★**帯が 2 通り**になります。
--   → ★**生の距離ごとに数えて返し**、★帯に束ねるのは TS にやらせます。
--
-- 【★「道悪」も決めません】
--   ★`track_condition` の生の値ごとに返します。★どれを道悪と呼ぶかは ★製品の宣言が既に持っています:
--   ✔ `packages/race-engine/src/coefficients.ts:107` … ★`good` は 1.0（★適性が効かない）
--   ✔ `packages/race-engine/src/balance.ts:72` … 「★稍重・重・不良でのみ heavy_aptitude が効く（4 段）」
--   → ★**good 以外が道悪**です（★私が決めた線ではありません）。★束ねるのは TS 側。
--
-- 【★気性は返しません】（★裁定の答え ③）
--   ★`RUNAWAY_BASE` が 0 なので、★暴走の回数で数えると ★**永久に「？？？」**になります。
--   → ★この便では ★**軸を出しません**。★簿の戻る条件は「★D-112 が入ったら」。
-- ---------------------------------------------------------------------------
begin;

-- ★自分の馬だけ（★裁定の答え ⑤・条件 3）
create or replace function public.my_horse_discovery_runs(p_horse_id uuid)
returns table (
  surface text,
  track_condition text,
  distance int,
  strategy text,
  runs int
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;

  /**
   * 🔴 ★**自分の馬だけ**（★他人の馬に発見度を出さない・★D-114「手がかりはオッズと戦績だけ」）。
   * ⚠️ ★`0083` で ★他人の引退馬が一覧に出るようになったので、★ここは ★**必ず持ち主を見ます**。
   *    ★見ないと、★一覧で選んだ他人の馬の発見度が出てしまいます。
   */
  select h.owner_id into v_owner from horses h where h.id = p_horse_id;
  if not found then
    raise exception '馬が存在しません' using errcode = 'ST029';
  end if;
  if v_owner is null or v_owner <> v_user then
    raise exception '自分の馬ではありません' using errcode = 'ST030';
  end if;

  return query
    select
      r.surface,
      r.track_condition,
      r.distance,
      e.strategy,
      count(*)::int
      from race_entries e
      join races r on r.id = e.race_id
     -- ⚠️ ★**確定した出走だけ**（★`my_retired_horses()` の出走数と同じ数え方・D-052）
     where e.horse_id = p_horse_id and e.finish_pos is not null
     group by r.surface, r.track_condition, r.distance, e.strategy
     -- ★並びは決定論（★同じ入力で同じ結果）
     order by r.surface, r.track_condition, r.distance, e.strategy;
end $$;

comment on function public.my_horse_discovery_runs(uuid) is
  '★発見度の素（★D-108・D-116）。★条件の生の値ごとの出走回数だけを返す。'
  '★段（unknown/hint/narrow/known）は返さない — ★discoveryStageOf（@star/sim-engine）が TS の 1 か所で決める。'
  '★距離の帯と「道悪」の束ね方も返さない（★DISTANCE_BANDS と製品の宣言が持つ）。'
  '★自分の馬だけ（★他人の馬に強さの手がかりを配らない・D-114）';

revoke all on function public.my_horse_discovery_runs(uuid) from public, anon;
grant execute on function public.my_horse_discovery_runs(uuid) to authenticated;

commit;
