-- 0033: 出走資格（戦績クラス）を DB 側にも効かせる
--       ★指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md` **CL-4 / CL-5**
--       ★正典 §10.3（番組表）／ D-018（同格帯・★触りません）／ D-079（初期馬）
--
-- 【★この移行が入れるもの】
--   ① `races` に ★**そのレースに出るために要る勝利数の範囲**（`min_wins` / `max_wins`）
--   ② `enter_race` に ★**出走資格の判定**（★自馬の登録にも効かせる・CL-4）
--   ③ `is_initial_horse_candidate` を ★**CL-1 の述語の上に「未出走」を重ねた形**に書き直す（CL-5'）
--
-- 【★なぜ「範囲」を列に持つのか — ★段の定義を SQL に写さないため】
--   ★勝利数 → 段（新馬 / 1勝 / 2勝 / 3勝 / オープン）の対応は
--   ★**`packages/scheduler/src/eligibility.ts` だけが持ちます**（★CL-1 の「1 か所に切り出す」）。
--   ★ここに `class_rank = 2 なら 1 勝` のような表を書くと ★**二重帳簿**になり、
--   ★片方を変えた日に静かに食い違います（★D-052。★この案件は同じ形で繰り返し失敗しています）。
--   → ★**SQL は「その数の内側か」だけを見ます。段の名前を知りません。**
--   ★数（`min_wins` / `max_wins`）は ★**ワーカーが `winsRangeFor()` から書きます**（`pg-store.ts`）。
--
-- 【★勝利数の数え方】
--   ⚠️ ★**`horses` に勝利数の列はありません**（✔ `0001_init.sql:138` の `g1_wins` は G1 のみ）。
--   → ★`race_entries` の **`finish_pos = 1`** を数えます（★CL-1 の指示どおり）。
--   ★`finish_pos` が書かれるのは**確定時の 1 か所だけ**（`pg-store.ts:459`）なので、
--   ★登録しただけの行・取消の行（`0028` の `scratched_at`）は **null のまま自動的に除かれます**。
--
-- 【★既にある行の埋め方（★1 回だけの後始末）】
--   ★`races.class_rank`（D-018・`0001:161`）は**レースの段がそのまま数で入っています**
--   （✔ `pg-store.ts:540` の `classRankOf`: maiden=1 / win1=2 / win2=3 / win3=4 / open=5 / graded=6）。
--   → ★**この移行の中だけ**でその対応を使い、既存行を埋めます。
--   ⚠️ ★**これは 1 回きりの後始末であって、継続的な二重定義ではありません**
--      （★以後の行はワーカーが TypeScript の値を書きます）。
--
-- 【★埋まっていない行はどうするか】
--   ★`min_wins` が null のレースには ★**登録できません**（★下の `enter_race`）。
--   ⚠️ ★**「分からないなら通す」にしません**（R-27: 縮退は狭い側・安全な側へ）。
--   ★古いワーカーが作った行が黙って「資格なし＝誰でも出られる」になるのを防ぎます。

begin;

-- ---------------------------------------------------------------------------
-- ① 列（★数だけを持つ。★段の名前は持たない）
-- ---------------------------------------------------------------------------
alter table races add column if not exists min_wins int;
alter table races add column if not exists max_wins int;

comment on column races.min_wins is
  '★出走に要る勝利数の下限（CL-4）。★ワーカーが winsRangeFor() から書く。★null は「資格の情報が無い」＝登録不可';
comment on column races.max_wins is
  '★出走に要る勝利数の上限（CL-4）。★null は上限なし（オープン・重賞）';

-- ★既存行の後始末（★1 回きり・上の註記）
update races set min_wins = 0, max_wins = 0    where min_wins is null and class_rank = 1; -- 新馬・未勝利
update races set min_wins = 1, max_wins = 1    where min_wins is null and class_rank = 2;
update races set min_wins = 2, max_wins = 2    where min_wins is null and class_rank = 3;
update races set min_wins = 3, max_wins = 3    where min_wins is null and class_rank = 4;
update races set min_wins = 4, max_wins = null where min_wins is null and class_rank in (5, 6); -- オープン・重賞

-- ---------------------------------------------------------------------------
-- ② 出走資格（CL-4）— ★`0024` の本文に「資格」だけを足したもの
--    ⚠️ ★`0024` は書き換えません（`migrate.mjs` が適用済みファイルの改変を正しく拒みます）
-- ---------------------------------------------------------------------------
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
  v_fee := 200;
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

  insert into race_entries (race_id, horse_id, gate, weight, strategy, jockey_frozen)
  values (p_race_id, p_horse_id, v_gate, 55, p_strategy, p_jockey_frozen)
  returning id into v_entry_id;

  update users set entry_points = entry_points - v_total where id = v_user;
  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -v_total, v_balance - v_total, 'entry_fee', p_race_id);

  return v_entry_id;
end;
$function$
;

comment on function public.enter_race(uuid, uuid, text, jsonb, uuid) is
  '★出走登録（D-111 ①: 受付まで）。★2026-09-18・CL-4 で出走資格の判定を足した — '
  'レースに保存された min_wins / max_wins と、race_entries の finish_pos = 1 の数を比べる。'
  '★段の定義（勝利数 → 新馬/1勝/2勝/3勝/オープン）は packages/scheduler/src/eligibility.ts の 1 か所だけが持つ';

revoke all on function public.enter_race(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.enter_race(uuid, uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ③ 初期馬の候補（CL-5'）— ★**CL-1 の述語（0 勝）の上に「未出走」を重ねる**
--
--   ★**述語は再利用します**（D-079 ⑥「付与された馬が新馬戦に出られない」を原理的に起こさない）。
--   ★`未出走 ⊂ 0 勝` なので、★**付与を未出走に狭めても、新馬戦には必ず出られます。**
--
-- 【★なぜ「0 勝」ではなく「未出走」に狭めるのか】（★裁定 `REVIEW_RACE_CLASS_1_VERDICT_20260918.md`）
--   ★**2026-09-18 の D-114 が前提を動かしました** — ★素質を見せなくなったので、
--   ★**戦績がいまや「観測できる差」そのもの**です。
--     ・未出走の馬     … ★**何も分からない**
--     ・10 戦 0 勝の馬 … ★**弱いと分かっている**
--   → ★同じ「0 勝」でも**新規プレイヤーの間に観測できる差が生まれます**（★D-079 ② が禁じたもの）。
--   ⚠️ ★**開発側は当初「0 勝」で書きました**（★§10.3 が「新馬・未勝利」を 1 行で書いているため）。
--      ★レビュー側が D-114 との噛み合わせで差し戻し、★**この形が正**です。
-- ---------------------------------------------------------------------------
create or replace function is_initial_horse_candidate(p_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from horses h
     where h.id = p_horse_id
       and h.owner_id is null
       and h.npc_stable_id is not null
       and h.retired_at_week is null
       -- ★① 新馬・未勝利（＝ 0 勝）。★CL-1 の述語と同じもの（★D-079 ⑥ の再利用）
       and not exists (
         select 1 from race_entries e
          where e.horse_id = h.id and e.finish_pos = 1
       )
       -- ★② ★さらに「未出走」に狭める（★上の註記・D-114 で戦績が観測できる差になったため）
       and not exists (
         select 1 from race_entries e
          where e.horse_id = h.id and e.finish_pos is not null
       )
  );
$$;

comment on function is_initial_horse_candidate(uuid) is
  '★初期馬の候補か（D-074/D-079）。★2026-09-18・CL-5 で暫定を置き換えた — '
  '★① CL-1 の述語（0 勝 ＝ 新馬・未勝利。D-079 ⑥ の「出走資格の述語を再利用」）に加え、'
  '★② 未出走に狭める（D-114 で素質を見せなくなり、戦績が「観測できる差」になったため・D-079 ②）。'
  '★未出走 ⊂ 0 勝 なので、狭めても新馬戦には必ず出られる。'
  '★段の定義は packages/scheduler/src/eligibility.ts が持つ';

revoke all on function is_initial_horse_candidate(uuid) from public, anon;
grant execute on function is_initial_horse_candidate(uuid) to authenticated;

commit;
