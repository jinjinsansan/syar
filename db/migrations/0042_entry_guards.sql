-- 0042: 出走登録の門番を直す（★EN-2・EN-3）
--       ★裁定 `REVIEW_ENTRY_GUARDS_VERDICT_20260919.md`
--
-- ============================================================================
-- 【🔴 ★EN-2 — 権限の検査が、冪等の検査より後ろにありました】
--
--   ★`enter_race` の並び（★`0041` まで）:
--     ```
--     ① 未認証を弾く
--     ② 冪等キーが無ければ弾く
--     ③ ★**再送なら既存の登録を返して終わる**（race_id, horse_id）   ← ★ここで return
--     ---------------- ★この下にあったもの ----------------
--       レースの存在 / status / 締切 / ★**自分の馬か** / 引退 / 資格 / 2 頭まで / 料金 / 残高
--     ```
--   → 🔴 ★**「自分の馬か」が早期 return の下にあります。**
--     ★**他人の馬の `horse_id` を渡すと、例外を出さずにその行の `id` が返ります**
--     （★`security definer` なので RLS も効きません）。★画面には「登録できました」と出ます。
--
--   ★今日の実害は限定的です（✔ `entry_id` を受け取る RPC は **0 件**）。
--   🔴 ★ただし ★**§8b の介入は `entry_id` を鍵にするのが自然**なので、
--     ★その日に「**他人の馬に介入できる**」に変わります。
--
--   → ★**順序を入れ替えるだけで消えます。** ★所有と引退の検査を ★**冪等の検査より前**へ。
--
-- 【🔴 ★EN-3 — `p_client_token` は要求されて捨てられていました】
--   ✔ 数えました: `0041` の中で `p_client_token` が出るのは ★**2 か所だけ**
--     （★引数の宣言／★null なら raise）。★その後どこにも使われません。
--   ✔ `race_entries` に `client_token` の列は ★**ありませんでした**
--     （★`bets`〔`0002:89`〕・`prize_exchanges`〔`0008:9`〕には**あり、一意索引まで**）。
--   → ★**宣言している鍵と、効いている鍵（`race_id, horse_id`）が違います。**
--
--   🔴 ★**この罠は既に 1 度発火しています** — ★`0039` を書くとき、開発側が
--     ★**存在しない `race_entries.client_token` を参照する書き換え**をしました。
--     ★**引数がその列の存在を尤もらしく見せていた**からです（★差分で気づいて直しました）。
--
--   ★**足します**（★`bets` と同じ形）。★副産物:
--     ✅ ★**「生成が作った行（null）」と「本人の登録（not null）」が区別できます** —
--        ★**D-117（登録 → 生成 の順序）を直す便が、まさに必要とする証拠**です。
--
-- ⚠️ ★**EN-1（`owner_id is null` をプールに足す）は SQL ではありません** — ★ワーカー側です。
--    ★同じ便で入れています（`apps/worker/src/horse-repo.ts`）。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① EN-3: `race_entries.client_token`（★`bets` と同じ形）
-- ---------------------------------------------------------------------------
alter table race_entries add column if not exists client_token uuid;

comment on column race_entries.client_token is
  '★登録の冪等キー（★2026-09-19・EN-3）。★`bets.client_token`（0002）と同じ形。'
  '★これまで enter_race は p_client_token を要求しながら捨てており、'
  '★効いていた鍵は (race_id, horse_id) だった（★宣言と実体が違う）。'
  '★null は「ワーカーの生成が作った行」＝ 本人の登録ではない — ★D-117 を直す便がこの区別を使う';

/**
 * ★**同じ馬・同じ鍵は 1 行だけ**（★`bets` の `(user_id, client_token)` と同じ形）。
 * ⚠️ ★`where client_token is not null` … ★**生成が作った行（null）を縛らない**ため。
 *    ★これが無いと、★**null 同士が衝突しないのに索引だけが重くなります**。
 */
create unique index if not exists race_entries_client_token_idx
  on race_entries (horse_id, client_token) where client_token is not null;

-- ---------------------------------------------------------------------------
-- ② EN-2: 権限の検査を、冪等の検査より前へ
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`0041` の本文をそのまま取ってきて、★並べ替えと 1 行の追加だけ**をしています。
--      ★判定そのもの（★資格・2 頭まで・料金・残高・締切）は 1 文字も変えていません。
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

  -- ★★自分の馬か（★2026-09-19・**EN-2** で**ここへ上げました**）
  --   🔴 ★旧はこの検査が ★**冪等の早期 return より後ろ**にありました。
  --      → ★**他人の馬の id を渡すと、例外を出さずにその行の id が返って**いました
  --        （★`security definer` なので RLS も効きません）。
  --   ★**権限の検査は、何よりも先に。** ★冪等は「同じ人が同じことを 2 度した」ときの話であって、
  --     ★**別人が別の馬について尋ねたとき**に使ってよいものではありません。
  select owner_id into v_owner from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  if exists (select 1 from horses where id = p_horse_id and retired_at_week is not null) then
    raise exception '引退した馬は登録できません';
  end if;

  -- ★再送なら既存の登録を返して終わる（EP を二度引かない）
  --   ⚠️ ★**所有を確かめた後**なので、★他人の馬の行を返すことはありません。
  --   ⚠️ ★鍵は今も `(race_id, horse_id)` です（★`client_token` は EN-3 で**記録**を始めただけで、
  --      ★**判定を変えていません** — ★変えると「同じ馬を同じレースに 2 回」が通り得ます）。
  select id into v_entry_id from race_entries
   where race_id = p_race_id and horse_id = p_horse_id;
  if found then return v_entry_id; end if;

  select * into v_race from races where id = p_race_id;
  if not found then raise exception 'レースが存在しない'; end if;
  -- ★★締切（★2026-09-19・**ED-1**）。ゲーム内時刻の真実は Postgres の now() のみ（§14）
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

  -- ★★出走資格（★2026-09-18・CL-4）
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

  -- ★★料金（★2026-09-19・EF-2）。★レースの行に書かれた値で払わせる
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

  -- ★★斤量（★2026-09-19・EF-2）。★レースの行に書かれた値
  if v_race.weight_kg is null then
    raise exception 'このレースには斤量の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  -- ★★`client_token` を**記録**する（★2026-09-19・**EN-3**）
  --   ★これまで要求しておいて捨てていた。★null は「生成が作った行」と区別できる
  insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen, client_token)
  values (p_race_id, p_horse_id, v_gate, v_race.weight_kg, p_strategy, p_jockey_frozen, p_client_token)
  returning id into v_entry_id;

  update users set entry_points = entry_points - v_total where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_total, v_balance - v_total, 'entry_fee', p_race_id);

  return v_entry_id;
end;
$function$;

comment on function public.enter_race(uuid, uuid, text, jsonb, uuid) is
  '★出走登録（D-111 ①: 受付まで）。★2026-09-19・EN-2 で**所有と引退の検査を冪等の早期 return より前**へ — '
  '★旧は他人の馬の id を渡すと例外なしでその行の id が返っていた（security definer なので RLS も効かない）。'
  '★EN-3 で client_token を記録する（★これまで要求して捨てていた。★null は生成が作った行）。'
  '★CL-4 で出走資格、★EF-2 で出走料と斤量、★ED-1 で締切を、いずれもレースの行の値から読む。'
  '🔴 ★「登録 → 生成」の順序（正典 §10.4・D-117）にはまだなっていない — ★それは別便';

revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

commit;
