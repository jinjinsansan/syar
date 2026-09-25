-- ---------------------------------------------------------------------------
-- ★**`enter_race` の戦績も、関数 1 つに寄せる**（★D-052・★CL-4）
--    ★裁定 `REVIEW_MARKET_PUBLIC_VIEW_20260925.md`（2026-09-25・レビュー側の指示）
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★なぜ「片方だけ寄せた状態」が危ないか】
--   ★`0087` で ★画面が読む `my_horses.wins` を `horse_wins()` に寄せました。
--   ★しかし ★`enter_race`（★登録の可否を決める側）は ★**まだ自分で数えていました**。
--   → ★★**画面と RPC が別々に数える状態**です。★これは正典 **CL-4** が名指しした形で、
--     ★`my_horses` の註記自身が「★違う数え方にすると、
--     ★**画面が「出られる」と言った馬が RPC に弾かれます**」と書いています。
--   ⚠️ ★私は最初、★ここを除外する理由に「`stable` な関数を書き込みの経路から呼ぶと意味が変わる」と
--      ★書きました。🔴 ★**誤りでした**（★Postgres では普通のことです）。
--
-- 【★変えたのは 1 か所だけ】（★裁定の条件 ①）
--   ★`0082` の本文を ★**機械で切り出し**、★次の 1 か所だけを置き換えました:
--     ★旧: `select count(*) into v_wins from race_entries where horse_id = … and finish_pos = 1;`
--     ★新: `v_wins := horse_wins(p_horse_id)::int;`
--   ⚠️ ★`::int` が要ります（★`horse_wins` は `bigint`・★`v_wins` は `int`）。
--   ★判定そのもの（★所有・引退・段・締切・資格・2 頭まで・料金・残高・枠・斤量・騎手）は
--   ★**1 文字も変えていません**（★正規化した差分で確かめました）。
-- ---------------------------------------------------------------------------
begin;
create or replace function public.enter_race(
  p_race_id uuid, p_horse_id uuid, p_strategy text, p_jockey_id text, p_client_token uuid
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_race races%rowtype;
  v_owner uuid;
  v_mine int;
  v_gate int;
  v_fee int;
  v_jockey_fee int;
  v_jockey_frozen jsonb;
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
  select owner_id into v_owner from horses where id = p_horse_id for update;
  if not found then raise exception '馬が存在しない'; end if;
  if v_owner is null or v_owner <> v_user then raise exception '自分の馬ではありません'; end if;
  if exists (select 1 from horses where id = p_horse_id and retired_at_week is not null) then
    raise exception '引退した馬は登録できません';
  end if;

  -- ★再送なら既存の登録を返して終わる（EP を二度引かない）
  select id into v_entry_id from race_entries
   where race_id = p_race_id and horse_id = p_horse_id;
  if found then return v_entry_id; end if;

  select * into v_race from races where id = p_race_id;
  if not found then raise exception 'レースが存在しない'; end if;
  /**
   * ★★**D-117**（2026-09-19）: ★受け付けるのは ★**`announced`**（★枠だけの段）です。
   */
  if v_race.status <> 'announced' then
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
  -- ★★戦績の数え方は `horse_wins()`（`0086`）に寄せた（★2026-09-25・D-052・CL-4）
  --   ⚠️ ★`my_horses.wins`（★画面が読む）と ★**同じ関数**でなければなりません。
  --      ★違うと ★**画面が「出られる」と言った馬が、ここで弾かれます**。
  v_wins := horse_wins(p_horse_id)::int;
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
  /**
   * 🔴 ★**(a) 騎手の料金は名簿から引く**（★2026-09-25・裁定 `REVIEW_JOCKEY_FEE_20260925.md` ②）。
   *   ⚠️ ★旧は `coalesce((p_jockey_frozen ->> 'feeEP')::int, 0)` ＝ ★**クライアントの申告**でした。
   *     ★画面が `feeEP` を送っていなかったので ★**誰からも 1 EP も引かれていません**でした。
   *     ★そして繋いだら ★`feeEP: 0` を送るだけで無料になる形でした（★憲法 3）。
   *   ★`jockey_frozen_build` は ★知らない ID で ★**落ちます**（★黙って 0 にしない）。
   */
  v_jockey_frozen := jockey_frozen_build(p_jockey_id, p_horse_id);
  v_jockey_fee := coalesce((v_jockey_frozen ->> 'feeEP')::int, 0);
  if v_jockey_fee < 0 then raise exception '騎手の料金が不正'; end if;
  v_total := v_fee + v_jockey_fee;

  select entry_points into v_balance from users where id = v_user for update;
  if not found then raise exception 'ユーザーが存在しない'; end if;
  if v_balance < v_total then
    raise exception 'EP が不足している（残高 % / 必要 %）', v_balance, v_total
      using errcode = 'ST001';
  end if;

  /**
   * ★枠は登録の順。
   * ⚠️ 🔴 ★**fill が全部振り直します**（★プレイヤー馬が先・NPC が後・§10.4）。
   *    ★ここの値は ★**締切までの仮の番号**で、★**画面には見せません**（★**DF-3**）。
   */
  select coalesce(max(gate), 0) + 1 into v_gate from race_entries where race_id = p_race_id;

  -- ★★斤量（★2026-09-19・EF-2）。★レースの行に書かれた値
  if v_race.weight_kg is null then
    raise exception 'このレースには斤量の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  -- ★★`client_token` を**記録**する（★2026-09-19・**EN-3**）
  -- 🔴 ★**(b) 凍結はサーバーが組み立てたものを入れる**（★裁定 ③）
  insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen, client_token)
  values (p_race_id, p_horse_id, v_gate, v_race.weight_kg, p_strategy, v_jockey_frozen, p_client_token)
  returning id into v_entry_id;

  -- ★★引き落としは ★**同じ取引の中**（★D-111 ①・裁定 ④）
  update users set entry_points = entry_points - v_total where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_total, v_balance - v_total, 'entry_fee', p_race_id);

  return v_entry_id;
end;
$function$;
revoke all on function public.enter_race(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, text, uuid) to authenticated;

commit;
