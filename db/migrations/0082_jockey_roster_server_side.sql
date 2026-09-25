-- ---------------------------------------------------------------------------
-- 🔴 ★**騎手の名簿を DB に転記し、料金と凍結をサーバー側で作る**
--    ★裁定 `REVIEW_JOCKEY_FEE_20260925.md`（2026-09-25・レビュー側の決定）
-- ---------------------------------------------------------------------------
--
-- 【🔴 ★何が起きていたか】（★`apps/cli/src/canon-amounts.ts` の対応表が初日に挙げた 1 件）
--   ★正典 **D-105** は「★騎手の料金は EP」と決めています。
--   ★`enter_race` は `coalesce((p_jockey_frozen ->> 'feeEP')::int, 0)` で料金を取っていました。
--   🔴 ★しかし画面が送るのは ★**`{ id: jockeyId }`** だけでした。
--     ★`freezeJockey`（`@star/scheduler`）が作る形は
--     ★`{ v, jockeyId, name, feeEP, bond, effect, calm }` で、★**キーも違い（`id` ≠ `jockeyId`）、
--     ★`feeEP` が入っていません** → ★**誰からも 1 EP も引かれていませんでした。**
--   ✔ ★`freezeJockey` は ★**製品コードから一度も呼ばれていません**でした（★定義と検査だけ）。
--   ✔ ★返金側も `?? 0` を読むので ★**帳簿は合っていました**（★実害は「騎手が無料」だけ）。
--
-- 【🔴 ★それより重い穴 — ★憲法 3】
--   ★料金の出どころが ★**クライアントの JSON** でした。★サーバー側に名簿がありません。
--   → ★登録が動いて EP が入り始めた日から、★`feeEP: 0` を送れば
--     ★**高い騎手を無料で乗せ放題**になります。★`bond` も `calm` も利用者が決められました。
--
-- 【★決定（★裁定）】
--   ★① ★**名簿を DB の表に転記する**（★正は TS の `JOCKEYS`・★移行で転記・★一致を検査で結ぶ）
--   ★② ★`enter_race` は ★**`jockeyId` だけを受け取り**、★料金を ★**表から引く**
--   ★③ ★`jockey_frozen` も ★**サーバー側で組み立てる**（★クライアントの JSON を凍結の中身にしない）
--   ★④ ★引き落としは ★**同じ取引の中で**（★D-111 ①）
--   ★★「凍結をワーカーに移す」案は ★**採らない**（★料金と行の作成が同じ取引でなくなる）
--   ★前例: ★配合の相性表の転記（`d85d591`）。★**発明ではなく転記**です。
--
-- 【⚠️ ★古い署名を必ず落とすこと】
--   ★`create or replace` で引数の型を変えると ★**多重定義**になり、
--   ★**危ない方（`jsonb` を受ける版）が呼べるまま残ります**。★明示的に `drop` します。
-- ---------------------------------------------------------------------------
begin;

-- ---------------------------------------------------------------------------
-- ① ★**名簿の転記**（★正は `packages/scheduler/src/jockeys.ts` の `JOCKEYS`）
-- ---------------------------------------------------------------------------
-- ⚠️ ★ここで騎手を ★**発明しません**。★TS の 6 人をそのまま写します。
--    ★一致は `apps/cli/test/jockey-roster-sql.test.ts` が突き合わせます（★ずれたら落ちる）。
-- ⚠️ ★実在の人名を入れないこと（★憲法 §0.1）。★TS 側の名前は架空です。
create table if not exists jockeys (
  id text primary key,
  name text not null,
  fee_ep int not null check (fee_ep >= 0),
  calm numeric not null check (calm >= 0 and calm <= 1)
);

comment on table jockeys is
  '★騎手の名簿（★正は packages/scheduler/src/jockeys.ts の JOCKEYS・★ここは転記）。'
  '★enter_race が料金をここから引く（★クライアントの申告を使わない・憲法 3）。'
  '★一致は apps/cli/test/jockey-roster-sql.test.ts';

-- ★利用者は読むだけ（★名簿は秘密ではない。★画面が料金を出すのに使う）
revoke all on table jockeys from public, anon, authenticated;
grant select on table jockeys to anon, authenticated;

insert into jockeys (id, name, fee_ep, calm) values
  ('j-aoi',       '青井 はやと', 200, 0.2),
  ('j-kurata',    '倉田 みなと', 200, 0.2),
  ('j-shinozaki', '篠崎 れん',   300, 0.4),
  ('j-tsuji',     '辻 さやか',   300, 0.4),
  ('j-himura',    '桧村 たくみ', 400, 0.6),
  ('j-narita',    '成田 ゆう',   400, 0.6)
on conflict (id) do update
  set name = excluded.name, fee_ep = excluded.fee_ep, calm = excluded.calm;

-- ---------------------------------------------------------------------------
-- ② ★**騎手まわりの定数**（★TS と 1 対 1・較正定数ではない）
-- ---------------------------------------------------------------------------
-- ⚠️ ★知らない種類が来たら止めます（★`null` を返すと静かに 0 になる）。
create or replace function public.jockey_const(p_kind text)
returns numeric
language plpgsql
immutable
as $$
begin
  case p_kind
    -- ★親密度の頭打ち（★`JOCKEY_BOND_MAX` ＝ 5・D-105 ⑤「早く頭打ちにする」）
    when 'bond_max' then return 5;
    -- ★着順への効果（★`JOCKEY_EFFECT` ＝ 0。★この便では着順に効かない）
    when 'effect' then return 0;
    else raise exception '騎手の定数の種類が分かりません: %', p_kind;
  end case;
end $$;

comment on function public.jockey_const(text) is
  '★JOCKEY_BOND_MAX / JOCKEY_EFFECT の転記。★apps/cli/test/jockey-roster-sql.test.ts が TS と突き合わせる';

-- ---------------------------------------------------------------------------
-- ③ ★**凍結をサーバー側で組み立てる**（★裁定 ③）
-- ---------------------------------------------------------------------------
-- ★`freezeJockey`（`@star/scheduler`）と ★**同じ形**を返します:
--   `{ v: 1, jockeyId, name, feeEP, bond, effect, calm }`
-- ★`bond` は ★**その馬にその騎手を何回乗せたか**から出します（★利用者が申告しない）。
-- ⚠️ ★確定・再計算は ★この凍結を読み、★名簿を引き直しません（★後から名簿を変えても過去のレースが動かない）。
create or replace function public.jockey_frozen_build(p_jockey_id text, p_horse_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_j jockeys%rowtype;
  v_rides int;
  v_bond int;
begin
  if p_jockey_id is null then return null; end if;   -- ★指名しない（★料金 0）

  select * into v_j from jockeys where id = p_jockey_id;
  if not found then
    -- ⚠️ ★**黙って 0 にしない**（★知らない ID を「無料の騎手」にしない）
    raise exception '騎手が名簿にいません: %', p_jockey_id using errcode = 'ST028';
  end if;

  -- ★その馬にその騎手を乗せた回数（★過去の凍結から数える）
  select count(*) into v_rides
    from race_entries e
   where e.horse_id = p_horse_id
     and e.jockey_frozen ->> 'jockeyId' = p_jockey_id;
  v_bond := least(v_rides, jockey_const('bond_max')::int);

  return jsonb_build_object(
    'v', 1,
    'jockeyId', v_j.id,
    'name', v_j.name,
    'feeEP', v_j.fee_ep,
    'bond', v_bond,
    'effect', jockey_const('effect'),
    'calm', v_j.calm
  );
end $$;

comment on function public.jockey_frozen_build(text, uuid) is
  '★出走登録で凍結する騎手の記録を ★サーバー側で作る（★freezeJockey と同じ形）。'
  '★クライアントの JSON を凍結の中身にしない（憲法 3・裁定 REVIEW_JOCKEY_FEE_20260925.md ③）';

-- ---------------------------------------------------------------------------
-- ④ 🔴 ★**危ない署名を落とす**（★多重定義で残さない）
-- ---------------------------------------------------------------------------
-- ⚠️ ★これを忘れると ★`jsonb` を受ける版が呼べるまま残り、★穴が開いたままになります。
drop function if exists public.enter_race(uuid, uuid, text, jsonb, uuid);

-- ---------------------------------------------------------------------------
-- ⑤ ★`enter_race` — ★`jockeyId` だけを受け取る
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`0051` の本文をそのまま取ってきて、★騎手に関わる 2 か所だけ**を変えています。
--      ★判定そのもの（★所有・引退・段・締切・資格・2 頭まで・料金・残高・枠・斤量）は 1 文字も変えていません。
--      ★変えたのは: ★(a) 料金を ★名簿から引く ★(b) 凍結を ★サーバーで組み立てて入れる。
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
