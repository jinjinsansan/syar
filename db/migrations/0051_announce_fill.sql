-- 0051: ★レースの行を 2 段に割る（★**D-117**・announce / fill）
--       ★裁定 `REVIEW_D117_SHAPE_VERDICT_20260919.md`
--
-- ============================================================================
-- 【🔴 ★何が逆向きだったか】
--   ★正典 §10.4 の形: ★**登録（締切）→ 抽選 → 生成（プレイヤー馬を優先し、残りを NPC で充填）→ publish → 発走**
--   🔴 ★実装の形: ★**生成（NPC だけ）→ publish → `enter_race` が生成済みのレースに `gate = max+1` で足す**
--   → ★**この 1 つの逆向きで、次の 4 つがすべて説明できます**（D-117）:
--     ①★**オッズが自馬を含まない** ②★`enter_race` が `popularity` を書かない
--     ③★D-111 と噛み合わない ④★登録の窓が無い
--
-- 【🔴 ★順序を入れ替えるだけでは成立しませんでした — ★測りました】
--   ✔ ★締切（`cycleStart + publish` ＝ 0:30）から発売開始（1:00）までは ★**30 秒**。
--   ✔ ★オッズは ★**1 レース 70〜98 秒**（★本番機換算・AL-6）／★**160 秒**（★開発機・`bench-mc`）。
--   → ★★**「重い」ではなく「入らない」。** ★2.3〜5.4 倍 足りません。
--
-- 【★どう解くか — ★行を 2 段に割る】
--   ★① **announce**（★`ANNOUNCE_AHEAD_RACES = 4` 先）… ★**枠・条件・締切だけ**。★出走馬もオッズも無い
--   ★② **fill**（★`LOOKAHEAD_RACES = 2` 先・★締切の後）… ★プレイヤー馬 ＋ NPC の充填 ＋ オッズ ＋ 公開
--   ★窓 ＝ **12 分** ／ ★fill の持ち時間 ＝ **13 分**（★98 秒に対し 8 倍）
--
-- 【★この移行がすること】
--   ① ★`races.status` に ★**`announced`** を足す
--   ② ★`enter_race` が ★**`announced` のレースを受ける**ようにする（★`scheduled` は「もう埋まった」）
--   ③ ★**DF-3**: ★締切の前は ★**枠を見せない**（★`fill` で振り直されるので、見せると嘘になる）
--
-- ⚠️ ★**締切の値は TypeScript が書きます**（★`entryDeadlineMs()`・D-052・D-103 ④）。
--    ★SQL に時間の式を書きません。
-- ⚠️ 🔴 ★**D-111 ③④⑥ は残します**（★**DF-2**）— ★fill の後・発走の前に引退する馬がいます。
--    ✔ ★数えました: ★fill から発走まで 12 分 ／ 1 ゲーム内週 240 分 → ★**5.0% ＝ 1 日 12 本**。
--    ★D-117 で消えるのは ★**「生成の後に馬が増える」**経路だけで、
--    ★**「生成の後に馬が走れなくなる」**経路は消えません。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① status に `announced` を足す
-- ---------------------------------------------------------------------------
do $$
begin
  alter table races drop constraint if exists races_status_known;
  alter table races add constraint races_status_known
    check (status in ('announced', 'scheduled', 'closed', 'settled', 'cancelled'));
end $$;

comment on column races.status is
  '★announced = 枠だけ（出走馬もオッズも無い・登録を受け付ける）／ scheduled = 出走表とオッズが入った（発売できる）／'
  'closed / settled / cancelled（★2026-09-19・D-117 で announced を足した）。'
  '⚠️ ★announced のまま発売開始を過ぎたら発売しない（DS-6）— ★出走馬もオッズも無いまま馬券を売らない';

-- ---------------------------------------------------------------------------
-- ② `enter_race` — ★`announced` のレースを受ける
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`0042` の本文をそのまま取ってきて、★status の 1 行だけ**を変えています。
--      ★判定そのもの（★所有・引退・資格・2 頭まで・料金・残高・締切）は 1 文字も変えていません。
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
   * 🔴 ★旧は `scheduled`（★出走表とオッズが入った後）でした — ★**それが逆向きの本体**です。
   *    ★`scheduled` は「★もう埋まった」の意味になったので、★**そこへの登録は受けません**。
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

  /**
   * ★枠は登録の順。
   * ⚠️ 🔴 ★**fill が全部振り直します**（★プレイヤー馬が先・NPC が後・§10.4）。
   *    ★ここの値は ★**締切までの仮の番号**で、★**画面には見せません**（★**DF-3**）。
   *    ★見せると「枠 1」と思った人が、★fill の後に「枠 7」になります
   *    （★ED-1 の「公開した出走表が嘘にならないため」と同じ理由）。
   */
  select coalesce(max(gate), 0) + 1 into v_gate from race_entries where race_id = p_race_id;

  -- ★★斤量（★2026-09-19・EF-2）。★レースの行に書かれた値
  if v_race.weight_kg is null then
    raise exception 'このレースには斤量の情報がありません（★古い経路で作られたレースです）'
      using errcode = 'ST002';
  end if;
  -- ★★`client_token` を**記録**する（★2026-09-19・**EN-3**）
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
  '★出走登録（D-111 ①: 受付まで）。★2026-09-19・**D-117** で受付の対象を announced にした — '
  '★旧は scheduled（出走表とオッズが入った後）で、★それが「生成 → 登録」という逆向きの本体だった。'
  '★枠はここでは仮の番号で、★fill が全部振り直す（§10.4・プレイヤー馬が先）。★画面には見せない（DF-3）。'
  '★EN-2 で所有と引退の検査を冪等の早期 return より前へ。★EN-3 で client_token を記録。'
  '★CL-4 で出走資格、★EF-2 で出走料と斤量、★締切はレースの行の値から読む（★正は TypeScript の entryDeadlineMs）';

revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ③ DF-3: ★締切の前は枠を見せない
-- ---------------------------------------------------------------------------
--   ⚠️ ★`0044` の本文を取ってきて、★`gate` の 1 列だけを条件付きにしています。
--      ★`is_mine`（BT-3）も `owner_label`（`0006`）もそのままです。
create or replace view race_entries_public as
select
  e.race_id,
  -- 🔴 ★**締切の前は null**（★**DF-3**・2026-09-19）。
  --   ★`fill` が全枠を振り直すので、★**締切の前に見せた枠は嘘になります**。
  --   ★画面は null を「未定」と出します（★0 や 1 と混ぜない）。
  case when r.status = 'announced' then null else e.gate end as gate,
  h.name as horse_name,
  e.strategy,
  e.weight,
  e.popularity,
  case when r.status = 'settled' then e.finish_pos else null end as finish_pos,
  case when r.status = 'settled' then e.finish_time else null end as finish_time,
  coalesce(u.stable_name, s.prefix) as owner_label,
  -- ★これは自分の馬か（★2026-09-19・BT-3）。★anon では常に偽
  (h.owner_id is not null and h.owner_id = auth.uid()) as is_mine
from race_entries e
join races r on r.id = e.race_id
join horses h on h.id = e.horse_id
left join users u on u.id = h.owner_id
left join npc_stables s on s.id = h.npc_stable_id;

comment on view race_entries_public is
  '★出走表の公開ビュー。★owner_id は出さない（`0006`）。★is_mine はサーバーが auth.uid() で判定（BT-3）。'
  '★2026-09-19・D-117（DF-3）: ★status = announced のあいだは gate を null にする — '
  '★fill が全枠を振り直すので、★締切の前に見せた枠は嘘になる（★ED-1 と同じ理由）';

grant select on race_entries_public to anon, authenticated;

commit;
