-- 0041: 出走登録の締切を「レースの行」に持たせ、publish より前にする（★ED-1）
--       ★裁定 `REVIEW_ENTRY_DEADLINE_VERDICT_20260919.md`
--       ★照会 `QUESTIONS_ENTRY_DEADLINE_20260919.md`（Q-ENTRY-1）
--
-- ============================================================================
-- 【★何が起きていたか】✔ 算術だけで出ました
--   ★`LOOKAHEAD_RACES = 2` × `CYCLE_MS = 6 分` → ★レースの行は ★**発走の 12 分前**に生まれます。
--   ★`enter_race` の締切は ★**発走の 60 分前**（§10.4・`interval '60 minutes'`）。
--   → 🔴 ★**どのレースも、生まれた瞬間に「締切後」**。★登録できる窓は 1 分もありませんでした。
--
-- 【🔴 ★根は締切ではありませんでした】★裁定より
--   ★正典 1318 行: 「1レース 8〜18頭。★**プレイヤー馬を優先し、残りを NPC 馬で充填**」
--   ★**正典は「登録 → 生成」の順**を定めています。★実装は ★**「生成 → 登録」**で逆でした。
--     ★正典: 登録（締切）→ 抽選 → 生成（プレイヤー馬を優先） → publish → 発走
--     🔴 実装: 生成（NPC だけ）→ publish → `enter_race` が `gate = max+1` で追加 → 発走
--   ⚠️ ★**順序を直すのは別便**（★裁定: 利用者 0 人の今は急がないが、人を迎える前に直す）。
--      ★**この移行は「当座の A」**です — ★**結線を止めないための締切の置き換え**だけ。
--
-- 【★どこに締切を置くか — **ED-1: `publish` より前**】
--   ★公開した出走表が嘘にならないように、★**publish（出走表の公開）より前**で締め切ります。
--   ★`PHASE_OFFSET_MS`（`packages/scheduler/src/cycle.ts`）:
--     ★`publish` ＝ サイクル先頭 ＋ 30 秒 ／ `start` ＝ サイクル先頭 ＋ 6 分
--     → ★**締切は発走の 5 分 30 秒前**（★行が生まれるのは 12 分前なので、★**窓は 6 分 30 秒**）。
--
-- 【★どう持たせるか — **D-103 ④ の先例**（`0039` と同じ形）】
--   ★**正 ＝ TypeScript**（`PHASE_OFFSET_MS`）→ ★**ワーカーが行に書く** → ★**RPC・ビュー・画面が読む**。
--   ⚠️ ★**SQL に `interval '60 minutes'` のような式を書きません。**
--      ★書くと ★**`PHASE_OFFSET_MS` と 2 か所**になります（D-052）。
--   ✅ ★副産物: ★**`enter_race` から時間のリテラルが 1 つ消えます。**
--
-- 【★埋まっていない行はどうするか】
--   ★`entry_deadline_at` が null のレースには ★**登録できません**（R-27・`min_wins`・`entry_fee_ep` と同じ形）。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 列を足す
-- ---------------------------------------------------------------------------
alter table races add column if not exists entry_deadline_at timestamptz;

comment on column races.entry_deadline_at is
  '★出走登録の締切（★2026-09-19・ED-1）。★ワーカーが cycleStartMs(idx) + PHASE_OFFSET_MS.publish を書く。'
  '★publish（出走表の公開）より前で締め切る — ★公開した出走表が嘘にならないように。'
  '★SQL に interval を書かない（★書くと PHASE_OFFSET_MS と 2 か所になる・D-052）';

-- ---------------------------------------------------------------------------
-- ② 既にある行を埋める（★1 回だけの後始末）
-- ---------------------------------------------------------------------------
--   ⚠️ ★ここに書く「5 分 30 秒」は ★**ワーカーが書くのと同じ値**です
--      （★`CYCLE_MS` 6 分 − `PHASE_OFFSET_MS.publish` 30 秒）。
--      ★**継続的な二重定義ではありません** — ★以後の行はワーカーが TypeScript の値を書きます。
--   ⚠️ ★既存の行はすべて過去のレースなので、★この値で登録できるようにはなりません（★意図どおり）。
update races
   set entry_deadline_at = scheduled_at - interval '5 minutes 30 seconds'
 where entry_deadline_at is null;

-- ---------------------------------------------------------------------------
-- ③ 公開ビューに出す（★画面が「あと何分で締切か」を出せるように）
-- ---------------------------------------------------------------------------
create or replace view races_public as
select
  r.id,
  r.name,
  r.grade,
  r.class_rank,
  r.surface,
  r.distance,
  r.track_condition,
  r.course_id,
  r.scheduled_at,
  r.seed_commit,
  case when r.status in ('settled', 'cancelled') then r.seed_reveal else null end as seed_reveal,
  r.status,
  r.purse,
  r.min_wins,
  r.max_wins,
  r.entry_fee_ep,
  r.weight_kg,
  r.cycle_index,
  -- ★登録の締切（★2026-09-19・ED-1）。★画面が自分で計算しないために出す
  r.entry_deadline_at
from races r;

comment on view races_public is
  '★番組表の公開ビュー（§12.2）。★CL-4 で min_wins / max_wins、★EF-3 で entry_fee_ep / weight_kg、'
  '★EF-5 で cycle_index、★ED-1 で entry_deadline_at を足した。'
  '★R 番号は slotOfDay(cycle_index) で導く。★締切は画面で計算しない（★サーバーが書いた値を読む）。'
  '★seed_reveal は確定後だけ（§8.6）';

grant select on races_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ④ enter_race — ★行に書かれた締切で判定する
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`0039` の本文をそのまま取ってきて、★締切の 3 行だけを差し替えています**。
--      ★差分で「消えた行が 3 つだけ」を確かめました。
--      🔴 ★この便で **2 度**、記憶で書き直して存在しないものを発明しました
--      （`enter_race` で 7 か所、`my_horses` で列 6 つ）。★**置き換えるときは本文を取ってくる**。
CREATE OR REPLACE FUNCTION public.enter_race(
  p_race_id uuid, p_horse_id uuid, p_strategy text, p_jockey_frozen jsonb, p_client_token uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_race races%rowtype;
  v_owner uuid;
  v_mine int;
  v_gate int;
  v_fee int;
  v_jockey_fee int;
  v_total int;
  v_balance bigint;
  v_entry_id uuid;
  v_wins int;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then raise exception '未認証'; end if;
  if p_client_token is null then raise exception '冪等キー（client_token）が必要'; end if;
  if p_strategy not in ('nige', 'senko', 'sashi', 'oikomi') then
    raise exception '脚質が不正: %', p_strategy;
  end if;

  -- ★再送なら既存の登録を返して終わる（EP を二度引かない）
  select id into v_entry_id from race_entries
   where race_id = p_race_id and horse_id = p_horse_id;
  if found then return v_entry_id; end if;

  select * into v_race from races where id = p_race_id;
  if not found then raise exception 'レースが存在しない'; end if;
  -- ★★締切（★2026-09-19・**ED-1**）。ゲーム内時刻の真実は Postgres の now() のみ（§14）
  --   🔴 ★旧: `scheduled_at <= now() + interval '60 minutes'` — ★**SQL に時間を直書き**。
  --      ★レースの行が生まれるのは発走の 12 分前（`LOOKAHEAD_RACES` 2 × 6 分）なので、
  --      ★**どのレースも生まれた瞬間に「締切後」**でした（★照会 Q-ENTRY-1）。
  --   ★新: ★**レースの行に書かれた締切**（★正は TS の `PHASE_OFFSET_MS.publish`・D-103 ④）。
  --   ⚠️ ★**無い行は通しません**（R-27・`min_wins`・`entry_fee_ep` と同じ形）。
  if v_race.status <> 'scheduled' then
    raise exception 'このレースは受付を終えています';
  end if;
  if v_race.entry_deadline_at is null then
    raise exception 'このレースには登録の締切の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  if now() >= v_race.entry_deadline_at then
    raise exception '登録の受付は終わっています（出走表の公開まで）';
  end if;

  -- ★自分の馬か（★現役であること）
  select owner_id into v_owner from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  if exists (select 1 from horses where id = p_horse_id and retired_at_week is not null) then
    raise exception '引退した馬は登録できません';
  end if;

  -- ★★出走資格（★2026-09-18・CL-4）
  --   ★段の定義はここに書きません。★レースに保存された数（min_wins / max_wins）と比べるだけです。
  if v_race.min_wins is null then
    raise exception 'このレースには出走資格の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  select count(*) into v_wins
    from race_entries where horse_id = p_horse_id and finish_pos = 1;
  if v_wins < v_race.min_wins or (v_race.max_wins is not null and v_wins > v_race.max_wins) then
    raise exception 'この馬はこのレースに出られません（勝利数 % ／ このレースの資格 % 〜 %）',
      v_wins, v_race.min_wins, coalesce(v_race.max_wins::text, '上限なし')
      using errcode = 'ST002';
  end if;

  -- ★★同じレースに 1 人 2 頭まで（D-104・T-7'）
  select count(*) into v_mine
    from race_entries e join horses h on h.id = e.horse_id
   where e.race_id = p_race_id and h.owner_id = v_user;
  if v_mine >= 2 then
    raise exception '同じレースに出せるのは 2 頭までです（§6.7・§10.4）';
  end if;

  -- ★料金（★登録料 ＋ 騎手の料金・D-105 ②）。★騎手を選ばなければ登録料だけ
  -- ★★料金（★2026-09-19・**EF-2**）
  --   🔴 ★旧: `v_fee := 200;` と **SQL に直書き**していました。
  --   ★新: ★**レースの行に書かれた値**で払わせます（★正は TS の `ENTRY_FEE_EP`・D-103 ④ の先例）。
  --   ⚠️ ★**無い行は通しません**（R-27: 分からないなら狭い側。★`min_wins` と同じ形）。
  if v_race.entry_fee_ep is null then
    raise exception 'このレースには出走料の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  v_fee := v_race.entry_fee_ep;
  v_jockey_fee := coalesce((p_jockey_frozen ->> 'feeEP')::int, 0);
  if v_jockey_fee < 0 then raise exception '騎手の料金が不正'; end if;
  v_total := v_fee + v_jockey_fee;

  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;
  if v_balance < v_total then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, v_total
      using errcode = 'ST001';
  end if;

  -- ★枠は登録の順（★抽選と確定の枠順はワーカーが決め直す・§10.4）
  select coalesce(max(gate), 0) + 1 into v_gate from race_entries where race_id = p_race_id;

  -- ★★斤量（★2026-09-19・**EF-2**）
  --   🔴 ★旧: `values (..., 55, ...)` と **SQL に直書き**（★TS の 3 か所に続く **4 つ目**の写し）。
  --   ★新: ★**レースの行に書かれた値**（★正は TS の `BASE_WEIGHT_KG`）。
  if v_race.weight_kg is null then
    raise exception 'このレースには斤量の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
  values (p_race_id, p_horse_id, v_gate, v_race.weight_kg, p_strategy, p_jockey_frozen)
  returning id into v_entry_id;

  update users set entry_points = entry_points - v_total where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_total, v_balance - v_total, 'entry_fee', p_race_id);

  return v_entry_id;
end;
$function$;

comment on function public.enter_race(uuid, uuid, text, jsonb, uuid) is
  '★出走登録（D-111 ①: 受付まで）。★CL-4 で出走資格、★EF-2 で出走料と斤量、'
  '★ED-1 で締切を、いずれも**レースの行に書かれた値**から読む形にした。'
  '★正は TypeScript（ENTRY_FEE_EP / BASE_WEIGHT_KG / PHASE_OFFSET_MS）で、ワーカーが行に書く（D-103 ④）。'
  '★値が無い行は通さない（R-27）。'
  '🔴 ★ただし「登録 → 生成」の順序（正典 1318）にはなっていない — ★それは別便'
  '（裁定 REVIEW_ENTRY_DEADLINE_VERDICT_20260919.md）';

revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

commit;
