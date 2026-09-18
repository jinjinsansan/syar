-- 0039: 出走料と斤量を「レースの行」に持たせる（★EF-2・EF-3・EF-4）
--       ★裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`
--
-- ============================================================================
-- 【🔴 ★追ったら、既に三重帳簿でした】
--   ★`/entry` を本番データに繋ごうとして、★出走料と斤量の**出どころが無い**ことに気づきました。
--
--   | 量 | どこにあったか |
--   |---|---|
--   | ★斤量 55 | ✔ 正＝`BASE_WEIGHT_KG`（`packages/race-engine/src/course-frozen.ts`・較正登録簿にある）<br>🔴 `apps/cli/src/race-field.ts` に直書き **3 か所**<br>🔴 `enter_race` の `insert ... weight` に直書き **＝ 4 つ目** |
--   | ★出走料 200 | 🔴 ★**TypeScript に定数が無い**（`CAREER_ASSUMPTION` の**説明文の中**にあるだけ）<br>🔴 `enter_race` の `v_fee := 200;` に直書き |
--
--   → ★**画面が値を持つと、さらに 1 つ増えます。** ★そこで止めて照会に回しました。
--
-- 【★裁定が示した形 — **D-103 ④ の先例**】
--   > 「★値段は DB に**サーバーが書き**、RPC はその行の値で払わせる」
--
--   ★**正 ＝ TypeScript**（`ENTRY_FEE_EP` / `BASE_WEIGHT_KG`）
--     → ★**ワーカーがレースの行に書く**（`pg-store.ts` の `createRace`）
--       → ★**`enter_race` はその行の値で払わせる／その行の値で `weight` を入れる**
--         → ★**`races_public` が返す** → ★**画面は読むだけ**。
--
--   ⚠️ ★**SQL に式も定数も書きません。** ★数が入っている列を読むだけです。
--
-- 【🔴 ★EF-4: 値は 1 つも変えていません】
--   ★出走料 **200**・斤量 **55** のままです。
--   ★登録料 200 EP は ★**正典 §3.4 の 1 キャリアの収支の前提**で、★**GB-6（経済の取り直し）に噛みます**。
--   ★動かすならそちらで、まとめて。★**この移行は出どころを 1 つにするだけ**です。
--
-- 【★既にある行の埋め方（★1 回だけの後始末）】
--   ★`0033` が `min_wins` でやったのと同じ形です。★**この移行の中だけ**で値を書き、
--   ★以後の行はワーカーが TypeScript の値を書きます。
--   ⚠️ ★**これは 1 回きりの後始末であって、継続的な二重定義ではありません。**
--
-- 【★埋まっていない行はどうするか】
--   ★`entry_fee_ep` が null のレースには ★**登録できません**（★下の `enter_race`）。
--   ⚠️ ★**「分からないなら通す」にしません**（R-27: 縮退は狭い側へ・`min_wins` と同じ形）。
--   ★古いワーカーが作った行が黙って「無料」になるのを防ぎます。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 列を足す
-- ---------------------------------------------------------------------------
alter table races add column if not exists entry_fee_ep int;
alter table races add column if not exists weight_kg int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'races_entry_fee_non_negative') then
    -- ⚠️ ★**上限は置きません**（★値をゲートにしない・EF-4）。★負だけを弾きます
    alter table races add constraint races_entry_fee_non_negative
      check (entry_fee_ep is null or entry_fee_ep >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_weight_positive') then
    alter table races add constraint races_weight_positive
      check (weight_kg is null or weight_kg > 0);
  end if;
end $$;

comment on column races.entry_fee_ep is
  '★このレースに登録するとき払う EP（★騎手の料金は別）。★ワーカーが @star/scheduler の ENTRY_FEE_EP を書く。'
  '★enter_race はこの行の値で払わせる（★D-103 ④ の先例）。★SQL に値を直書きしない';
comment on column races.weight_kg is
  '★このレースの斤量。★ワーカーが @star/race-engine の BASE_WEIGHT_KG を書く。'
  '★enter_race はこの行の値を race_entries.weight に入れる。★SQL に値を直書きしない';

-- ---------------------------------------------------------------------------
-- ② 既にある行を埋める（★1 回だけの後始末）
-- ---------------------------------------------------------------------------
--   ⚠️ ★**ここに書く 200 と 55 は、いま実際に使われている値そのものです**
--      （★`enter_race` の `v_fee := 200` と `insert ... weight ... 55`）。
--      ★**値を変えていないこと**が EF-4 です。
update races set entry_fee_ep = 200 where entry_fee_ep is null;
update races set weight_kg = 55 where weight_kg is null;

-- ---------------------------------------------------------------------------
-- ③ 公開ビューに出す（★EF-3・画面は公開ビューから読む）
-- ---------------------------------------------------------------------------
--   ⚠️ ★`0002` / `0035` は書き換えません（★`migrate.mjs` が適用済みファイルの改変を拒みます）。
--      ★`create or replace view` で列を**足すだけ**です（★既存の列の順序と名前は変えません）。
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
  -- ★出走料と斤量（★2026-09-19・EF-3）。★画面が自分で持たないために出す
  r.entry_fee_ep,
  r.weight_kg
from races r;

comment on view races_public is
  '★番組表の公開ビュー（§12.2）。★2026-09-18・CL-4 で min_wins / max_wins を、'
  '★2026-09-19・EF-3 で entry_fee_ep / weight_kg を足した — ★画面がこれらを自分で持つと、'
  '★TypeScript・SQL・画面の三重帳簿になる（★実際そうなりかけていた）。'
  '★seed_reveal は確定後だけ（§8.6）';

grant select on races_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ④ enter_race — ★直書きをやめ、行の値で払わせる
-- ---------------------------------------------------------------------------
--   ⚠️ ★**変えたのは 2 か所だけ**です（★`v_fee` の求め方と `weight` の入れ方）。
--      ★他の判定（資格・2 頭まで・EP 不足・冪等）は `0033` から 1 文字も変えていません。
--   ⚠️ ★**`0033` の本文をそのまま取ってきて、★上の 2 か所だけを直しています**。
--      🔴 ★最初は記憶で書き直し、★**diff を取って 7 か所変わっているのに気づきました**
--      （★存在しない `race_entries.client_token` を参照し、★`p_strategy` の検査を落としていました）。
--      ★**差分で確かめるまで、変えていないつもりでした。**
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
  -- ★§10.4 発走 60 分前まで。ゲーム内時刻の真実は Postgres の now() のみ（§14）
  if v_race.status <> 'scheduled' or v_race.scheduled_at <= now() + interval '60 minutes' then
    raise exception '登録の受付は終わっています（発走 60 分前まで）';
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
  '★出走登録（D-111 ①: 受付まで）。★2026-09-18・CL-4 で出走資格の判定を足し、'
  '★2026-09-19・EF-2 で出走料と斤量の直書きをやめた — ★どちらもレースの行に書かれた値を使う。'
  '★正は TypeScript（ENTRY_FEE_EP / BASE_WEIGHT_KG）で、ワーカーが行に書く（D-103 ④ の先例）。'
  '★値が無い行は通さない（R-27。★黙って「無料」「斤量 0」にしない）。'
  '★段の定義（勝利数 → 新馬/1勝/2勝/3勝/オープン）は packages/scheduler/src/eligibility.ts の 1 か所だけが持つ';

revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

commit;
