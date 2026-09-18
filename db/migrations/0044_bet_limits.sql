-- 0044: 投票の上限を 1 か所にし、画面には「あと何 EP 買えるか」を返す
--       （★BT-1・BT-2・BT-3・BT-4）★裁定 `REVIEW_BET_LIMITS_VERDICT_20260919.md`
--
-- ============================================================================
-- 【★BT-0 — この便の原理（★裁定が一般化したもの）】
--   > ★**画面に渡すのは「判断の材料」ではなく「判断の結果」にする。**
--   > ★材料を渡すと、画面が判断を組み立て、★そこに第 2 の規則ができる。
--
-- 【🔴 ★何が起きていたか】
--   ★`place_bet`（`0024`）が ★**4 つの上限を SQL に直書き**していました。
--   ★UI-2 は必ず「あと◯◯ EP 買えます」を出したくなります → ★**写しが 4 つ**（D-052）。
--
-- 【★BT-1 — 上限ではなく「残り」を返す】
--   ★**正 ＝ TypeScript**（`@star/betting` の `BET_CAP_*`）
--     → ★ワーカーが `bet_limits`（1 行）に書く
--       → ★`bet_allowance()` が「あと何 EP 買えるか」を計算
--         → ★`place_bet` も `my_bet_allowance` も **その 1 本**を呼ぶ
--           → ★画面は **残りの数と、効いている上限の名前**を読むだけ
--
--   ★**なぜ「上限」ではなく「残り」か**:
--     ① ★画面が上限を知る必要がありません。★要るのは「あと何 EP 買えるか」で、
--        ★それは**既に買った額**と組み合わせないと出せません ＝ ★どのみちサーバー側の計算
--     ② ★4 つのうち「いちばんきついもの」が答え。★画面で min を取ると
--        ★**優先順位という第 5 の知識**を画面が持ちます
--     ③ ★自馬レースの上限は「そのレースに自馬がいるか」に依存 → ★§9.5 を二重に持つことになります
--
-- 【🔴 ★BT-2 — 数が 1 か所になっても、規則が 2 か所になる】
--   ★`place_bet`（判定）と `my_bet_allowance`（残りの計算）が、★**同じ規則を別々に実装**すると:
--     ★ビューが**緩い** → ★**押してから弾かれる**
--     ★ビューが**厳しい** → ★買えるのに「買えません」と出る（★**誰も気づきません**）
--   → ★**比較と「いちばんきついものを選ぶ」を SQL 関数 1 本に出し、★両方がそれを呼びます。**
--
-- 【🔴 ★BT-3 — 馬名での突き合わせをやめる】
--   ✔ ★**確かめました。★`horses.name` に一意制約はありません**（`0001:108` は text not null だけ・
--     ★後の移行にも一意索引なし）。★staging は 7,370 / 7,370 で**たまたま**一致しているだけです。
--   🔴 ★開発側は「馬名は一意（`0001` の一意制約）」と書きました — ★**存在しない制約**です。
--     ★**測っていない前提**でした（★R-21 の家族）。
--   → ★`race_entries_public` に ★**「これは自分の馬か」を返す列**を足します。
--     ★`owner_id` は出しません（`0006` の註記のまま）。★anon には常に偽になるだけで、
--     ★**露出は 1 ビットも増えません**。
--
-- 【★BT-4 — `bet_limits` の書き方】
--   ① ★**毎周書く**（値が変わらなくても）— ★UI1-10 と同じ理由。
--      ★「変わったときだけ」だと ★**止まったのと区別できません**（R-16）
--   ② ★**無い行は通さない**（R-27）
--   ③ 🔴 ★**古い行は通してよい。★これは「決め」です** — ★上限は時間で変わる値ではありません。
--      ⚠️ ★書かないと、次の人が「古い行も弾くべきでは」と迷い、
--         ★**ワーカーが落ちた瞬間に誰も投票できなくなる**形を入れかねません
--   ④ 🔴 ★**値は 1 ビットも変えていません**（★EF-4 と同じ扱い。★§9.4 は賭博性の分水嶺に関わる数）
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 上限の置き場（★1 行だけ。★`world_state` と同じ形）
-- ---------------------------------------------------------------------------
create table if not exists bet_limits (
  id boolean primary key default true,
  per_kind_ep int not null,
  per_race_ep int not null,
  per_day_ep int not null,
  own_race_ep int not null,
  updated_at timestamptz not null default now(),
  constraint bet_limits_single_row check (id),
  constraint bet_limits_positive check (
    per_kind_ep > 0 and per_race_ep > 0 and per_day_ep > 0 and own_race_ep > 0
  )
);

comment on table bet_limits is
  '★投票の上限（§9.4・§9.5）。★1 行だけ。★ワーカーが @star/betting の BET_CAP_* から書く。'
  '★place_bet も my_bet_allowance も、ここを直接は読まず bet_allowance() 経由で使う（BT-2）。'
  '★古い行は通してよい — 上限は時間で変わる値ではない（★書かないと、ワーカーが落ちた瞬間に誰も投票できなくなる）';

alter table bet_limits enable row level security;
-- ⚠️ ★表そのものは閉じます（★R-29。★画面は「残り」だけを読む）
revoke all on bet_limits from anon, authenticated;

-- ★この移行の中だけの後始末（★以後はワーカーが TypeScript の値を書きます）
--   ⚠️ ★ここに書く 4 つは ★**いま place_bet が直書きしている値そのもの**です（★値を変えていない）。
insert into bet_limits (id, per_kind_ep, per_race_ep, per_day_ep, own_race_ep)
values (true, 30000, 50000, 500000, 5000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ② 規則はこの 1 本だけが持つ（★BT-2）
-- ---------------------------------------------------------------------------
--   ★返すもの: ★**残り [EP]** と ★**効いている上限の名前**。
--   ⚠️ 🔴 ★**4 つの内訳は返しません** — ★返すと呼ぶ側が min を取れてしまい、
--      ★**「どれが優先か」という知識が外に出ます**（R-29・BT-1 ② の逆戻り）。
--   ⚠️ ★**残高は見ません**（★place_bet が別に見ます）。★ここは §9.4・§9.5 の上限だけです。
create or replace function bet_allowance(
  p_user uuid,
  p_race_id uuid,
  p_bet_type text default null
)
returns table (remaining_ep bigint, binding text, binding_label text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_lim bet_limits%rowtype;
  v_race_total bigint;
  v_kind_total bigint;
  v_day_total bigint;
  v_own boolean;
  v_rest_kind bigint;
  v_rest_race bigint;
  v_rest_day bigint;
begin
  select * into v_lim from bet_limits where id;
  if not found then
    -- ★**無い行は通さない**（R-27・BT-4 ②）
    raise exception '投票の上限が設定されていません（★ワーカーがまだ書いていません）'
      using errcode = 'ST002';
  end if;

  select coalesce(sum(amount), 0) into v_race_total
    from bets where user_id = p_user and race_id = p_race_id and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_kind_total
    from bets where user_id = p_user and race_id = p_race_id
      and (p_bet_type is null or bet_type = p_bet_type) and status <> 'refunded';
  select coalesce(sum(amount), 0) into v_day_total
    from bets where user_id = p_user and created_at >= date_trunc('day', now())
      and status <> 'refunded';

  -- ★自馬が出走するレースか（§9.5）。★出走していれば「1 レース合計」が上書きされます
  select exists (
    select 1 from race_entries e join horses h on h.id = e.horse_id
     where e.race_id = p_race_id and h.owner_id = p_user
  ) into v_own;

  v_rest_kind := v_lim.per_kind_ep - v_kind_total;
  v_rest_race := (case when v_own then v_lim.own_race_ep else v_lim.per_race_ep end) - v_race_total;
  v_rest_day  := v_lim.per_day_ep - v_day_total;

  -- ★**いちばんきついものが答え**（★ここが唯一の優先順位）
  remaining_ep := greatest(0, least(v_rest_kind, v_rest_race, v_rest_day));
  if v_rest_day <= v_rest_kind and v_rest_day <= v_rest_race then
    binding := 'day';
    binding_label := '今日の上限に達しています';
  elsif v_rest_race <= v_rest_kind then
    binding := case when v_own then 'own_race' else 'race' end;
    binding_label := case when v_own
      then '自分の馬が出るレースの上限に達しています'
      else 'このレースの上限に達しています' end;
  else
    binding := 'kind';
    binding_label := 'この券種の上限に達しています';
  end if;
  return next;
end $fn$;

comment on function bet_allowance(uuid, uuid, text) is
  '★あと何 EP 投票できるか（★2026-09-19・BT-1/BT-2）。★place_bet も my_bet_allowance もこれを呼ぶ — '
  '★規則（どれがいちばんきついか）を 2 か所に書かないため（★ずれると「押してから弾かれる」か'
  '「買えるのに買えないと出る」になり、後者は誰も気づかない）。'
  '★4 つの内訳は返さない（★返すと呼ぶ側が min を取れ、優先順位が外に出る）。'
  '★残高は見ない（★place_bet が別に見る）';

revoke all on function bet_allowance(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ③ 画面が読むビュー（★「判断の結果」だけ）
-- ---------------------------------------------------------------------------
--   ⚠️ ★**券種ごとの残りは返しません** — ★券種は画面が選ぶもので、
--      ★選ぶたびに問い合わせ直す形にします（★bet_allowance を RPC で呼ぶのは次便）。
--      ★ここが返すのは ★**そのレースで、券種を問わず、あと何 EP か**です。
create or replace view my_bet_allowance as
select
  r.id as race_id,
  a.remaining_ep,
  a.binding,
  a.binding_label
from races r
cross join lateral bet_allowance(auth.uid(), r.id, null) a
where auth.uid() is not null
  and r.status = 'scheduled';

comment on view my_bet_allowance is
  '★そのレースであと何 EP 投票できるか（★2026-09-19・BT-1）。★画面は「残り」と「効いている上限の名前」だけを読む。'
  '★上限そのものは渡さない — ★渡すと画面が min を取り、優先順位という第 5 の知識を持つ（BT-0）';

grant select on my_bet_allowance to authenticated;

-- ---------------------------------------------------------------------------
-- ④ BT-3: 「これは自分の馬か」を出走表に足す
-- ---------------------------------------------------------------------------
--   🔴 ★開発側は「馬名で突き合わせる。馬名は一意なので成立する」と書きましたが、
--      ✔ ★**一意制約は存在しません**（`0001:108` は text not null だけ）。
--      ★**測っていない前提**でした。
--   ⚠️ ★`owner_id` は出しません（`0006` の「所有者名は出すが owner_id は出さない」を守る）。
--      ★anon には ★**常に偽**になるだけで、★露出は増えません。
create or replace view race_entries_public as
select
  e.race_id,
  e.gate,
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
  '★出馬表の公開ビュー（§12.2）。★2026-09-19・BT-3 で is_mine を足した — '
  '★画面が馬名で突き合わせるのをやめるため（★horses.name に一意制約は無い）。'
  '★owner_id は出さない（★誰の馬かは stable_name / 厩舎の冠名で表す）。★anon では is_mine は常に偽';

grant select on race_entries_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ⑤ place_bet — ★上限の比較を bet_allowance() に渡す
-- ---------------------------------------------------------------------------
--   ⚠️ ★**`0024` の本文をそのまま取ってきて、★上限の区画だけを差し替えています**。
--      ★差分で確かめました: ★**消えた実行行 18（合計の集計 6・上限の比較 12）・増えた 5**。
--      ★他の判定（発売中・オッズの存在・§9.5 の買い目の形・残高・冇等）は 1 文字も変えていません。
CREATE OR REPLACE FUNCTION public.place_bet(p_race_id uuid, p_bet_type text, p_selection jsonb, p_amount integer, p_client_token uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_race races%rowtype;
  v_odds numeric(9,1);
  v_balance bigint;
  v_race_total bigint;
  v_kind_total bigint;
  v_day_total bigint;
  v_own_horse boolean;
  v_allow record;
  v_bet_id bigint;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then
    raise exception '未認証';
  end if;
  if p_client_token is null then
    raise exception '冪等キー（client_token）が必要';
  end if;

  -- ★再送なら既存の馬券を返して終わる（EP を二度引かない）
  select id into v_bet_id from bets where user_id = v_user and client_token = p_client_token;
  if found then
    return v_bet_id;
  end if;

  -- ★行ロック。同じユーザーの同時購入で残高チェックをすり抜けさせない
  select entry_points into v_balance from users where id = v_user for update;
  if not found then
    raise exception 'ユーザーが存在しない';
  end if;

  select * into v_race from races where id = p_race_id;
  if not found then
    raise exception 'レースが存在しない';
  end if;
  -- ★発売時間内か。ゲーム内時刻の真実は Postgres の now() のみ（§14）
  if v_race.status <> 'scheduled' or v_race.scheduled_at <= now() then
    raise exception '発売時間外';
  end if;

  -- ★オッズはサーバー側の race_odds から取る。クライアントの申告値を使わない
  select ro.odds into v_odds
  from race_odds ro
  where ro.race_id = p_race_id and ro.bet_type = p_bet_type and ro.selection = p_selection;
  if not found then
    raise exception '発売していない買い目';
  end if;

  -- ★★上限（★2026-09-19・**BT-1 / BT-2**）
  --   🔴 ★旧: ★**4 つの上限を SQL に直書き**し、★比較もここで書いていました
  --      （30,000 / 50,000 / 500,000 / 5,000）。
  --   ★新: ★**`bet_allowance()` を呼ぶ**だけです。
  --     ★**規則（どれがいちばんきついか）は、その 1 本だけが持ちます**（BT-2）。
  --     ★`my_bet_allowance`（画面が読むビュー）も ★**同じ 1 本**を呼びます。
  --   ⚠️ ★**これが無いと、RPC とビューが同じ規則を別々に実装します** —
  --      ★ビューが緩ければ「押してから弾かれる」、★厳しければ「買えるのに買えないと出る」。
  --      ★後者は**誰も気づきません**（★`my_horses.wins` で自分から挙げた形と同じ）。
  --   ⚠️ ★§9.5 の「自馬を全頭含む」は ★**金額の話ではない**ので、★ここに残します。
  select * into v_allow from bet_allowance(v_user, p_race_id, p_bet_type);
  if v_allow.remaining_ep < p_amount then
    raise exception '%（あと % EP まで）', v_allow.binding_label, v_allow.remaining_ep
      using errcode = 'ST003';
  end if;

  -- ★§9.5 自馬出走レースの制限（八百長利得の遮断装置）
  --   ⚠️ ★**金額の上限は `bet_allowance()` が見ています**。★ここは**買い目の形**だけを見ます。
  select exists (
    select 1 from race_entries e
    join horses h on h.id = e.horse_id
    where e.race_id = p_race_id and h.owner_id = v_user
  ) into v_own_horse;

  if v_own_horse then
    -- ★★自馬が複数なら「全頭を含む組合せ」だけ（§9.5-3・2026-09-16 の是正）
    --   ⚠️ 以前は「自馬のどれか 1 頭を含めばよい」だった。1 頭までしか出せない間は同じ意味だが、
    --      D-104 で 2 頭まで出せるようになったので、片方だけを含む買い目を許すと
    --      もう 1 頭を負けさせる利得が残る。
    if exists (
      select 1 from race_entries e
      join horses h on h.id = e.horse_id
      where e.race_id = p_race_id
        and h.owner_id = v_user
        and not (p_selection @> to_jsonb(e.gate))
    ) then
      raise exception '自馬出走レースでは自馬を全頭含む買い目のみ購入できる（§9.5）';
    end if;
  end if;

  if v_balance < p_amount then
    raise exception 'EP が不足している';
  end if;

  -- --- ここから先は同一トランザクション。途中で例外が出れば全部戻る ---
  update users set entry_points = entry_points - p_amount where id = v_user;

  insert into bets (user_id, race_id, bet_type, selection, amount, odds_at_purchase, client_token)
  values (v_user, p_race_id, p_bet_type, p_selection, p_amount, v_odds, p_client_token)
  returning id into v_bet_id;

  insert into ep_ledger (user_id, delta, balance_after, reason, ref_id)
  values (v_user, -p_amount, v_balance - p_amount, 'bet', p_race_id);

  return v_bet_id;
end;
$function$;

comment on function public.place_bet(uuid, text, jsonb, integer, uuid) is
  '★投票（§9.1〜§9.5）。★2026-09-19・BT-1/BT-2 で上限の比較を bet_allowance() に出した — '
  '★my_bet_allowance（画面が読むビュー）も同じ 1 本を呼ぶので、★規則が 2 か所にならない。'
  '★§9.5 の「自馬を全頭含む」は金額の話ではないのでここに残してある。'
  '★上限の値は @star/betting が正で、ワーカーが bet_limits に書く（D-103 ④ の形）';

revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;

commit;
