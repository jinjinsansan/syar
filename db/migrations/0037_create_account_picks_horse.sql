-- 0037: 初期馬を `create_account` が中で選ぶ（★UI1-1〜UI1-6・D-074・D-079 ①③）
--       ★裁定 `REVIEW_UI_SETUP_HORSE_VERDICT_20260918.md`（案 A）
--       ★裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`（絞り方＝無作為に 1 頭）
--
-- ============================================================================
-- 【★何が詰まっていたか】
--   ★`0031` の `create_account` は ★**初期馬の id を引数で受け取ります**（`p_horse_id`）。
--   ★ところが ★**画面（web）はその id を得られません**:
--     ① `horses` は登録簿で `CLOSED`（`potential`/`genotype` を持つため）→ 1 行も読めない
--     ② `my_horses`（`0034`）は `owner_id = auth.uid()` → ★**まだ持っていない馬は入らない**
--     ③ `is_initial_horse_candidate(id)` は ★**「その id が候補か」を検証するだけ**で、列挙できない
--   → ★**`/setup` から `create_account` を呼べませんでした**（照会 `QUESTIONS_UI_SETUP_HORSE_20260918.md`）。
--
-- 【★なぜ「呼ぶ側が選ぶ」が成り立たないか】
--   ★**D-074**「初期馬は **サーバー側**で付与する。★画面で抽選しない」
--   ★**D-114**（2026-09-18）で ★**段を外に出さなくなった** → ★`0031:125` の註記
--     「★呼ぶ側（ワーカー）が★で選んだ馬」は ★**前提ごと失効しています**。
--   🔴 ★**`0031` は適用済みなので書き換えられません**（`migrate.mjs` が拒みます）。
--      → ★**この移行の註記と `comment on` が、`0031:125` の訂正です。**
--
-- ============================================================================
-- 【🔴 ★絞り方 — 無作為に 1 頭。★`Math.random()` 禁止（憲法 4）の対象外です】
--
--   ★**D-079 ③「再付与で得られる素質分布が初回と同じ」**が、絞り方を決めています。
--
--   | 案 | なぜ駄目／良いか |
--   |---|---|
--   | 🔴 `order by id limit 1` | ★**プールの先頭から順に消費**され、★初回と再付与で分布が変わりえる（D-079 ③ 違反） |
--   | 🔴 `auth.uid()` のハッシュ | ★**D-079 ① が「user_id のハッシュを使わない」と明示** |
--   | ✅ `order by random()` | ★**分布が保たれる**（★どの候補も等確率） |
--
--   ⚠️ ★**なぜ憲法 4（`Math.random()` / `Date.now()` を直接呼ばない）に反しないのか**
--     ★憲法 4 は ★**§8.6 Provably Fair の文脈**で書かれています（★D-108 ①「シードとレース結果から
--     ★導く」／D-112 ①「憲法 4・§8.6」）。★**レースの乱数と時刻**を、シード固定で完全再現できる
--     ★ようにするための規則です。
--     → ★**口座の作成はレース結果に関わらず、再現性も要求されません。**
--       ★むしろ ★**D-079 ③ が無作為を要求しています。**
--     ⚠️ ★次に読む人が「乱数を使っている＝憲法 4 違反」と誤読しないよう、★ここに書き残します。
--       ★**レースの側で `random()` を使ったら、それは違反です。**
--
-- ============================================================================
-- 【★述語を 2 か所に書かないために（D-052）】
--   ★候補の条件は ★**`initial_horse_candidates()` の 1 か所**だけに置きます。
--   ★`is_initial_horse_candidate(uuid)` は ★**それに id を渡すだけ**の薄い包みに変えます。
--   ⚠️ ★逆（★条件を両方に書く）にすると、★**片方を直した日に静かに食い違います**
--      — ★この案件は同じ形で繰り返し失敗しています（D-052・L-2）。
--   ⚠️ ★`0033` の条件（① 0 勝 ② 未出走）は ★**1 文字も変えずに**移しています。
--
-- 【★同時に登録されたときに同じ馬を 2 人に渡さない】
--   ★`for update ... skip locked` で ★**選んだ行を掴んだまま**トランザクションを終えます。
--   ★もう 1 人は ★**その行を飛ばして**次の候補を取ります（★待たされません）。
--   ⚠️ ★`limit 1` の後に掴むと「掴めなかった＝候補なし」になるので、
--      ★**無作為に並べてから、掴めた先頭 1 頭**を取る形にしています。
--      ★並びは無作為なので、★**飛ばしても分布は偏りません**（★錠は段と無関係）。
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① 候補の集合（★述語の唯一の出どころ）
-- ---------------------------------------------------------------------------
--   ★`p_horse_id` を渡すとその 1 頭だけに絞ります（★`is_initial_horse_candidate` 用）。
--   ★渡さなければ候補を全部返します（★選ぶ側用）。
--   ⚠️ ★`security definer` です — ★`horses` は利用者から読めないため（V-20 の登録簿どおり）。
create or replace function initial_horse_candidates(p_horse_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select h.id
    from horses h
   where (p_horse_id is null or h.id = p_horse_id)
     and h.owner_id is null
     and h.npc_stable_id is not null
     and h.retired_at_week is null
     -- ★① 新馬・未勝利（＝ 0 勝）。★CL-1 の述語と同じもの（★D-079 ⑥ の再利用）
     and not exists (
       select 1 from race_entries e
        where e.horse_id = h.id and e.finish_pos = 1
     )
     -- ★② さらに「未出走」に狭める（★D-114 で戦績が観測できる差になったため・CL-5')
     and not exists (
       select 1 from race_entries e
        where e.horse_id = h.id and e.finish_pos is not null
     )
$$;

comment on function initial_horse_candidates(uuid) is
  '★初期馬の候補の集合（D-074/D-079・2026-09-19・UI1-1）。★条件はここだけが持つ（D-052）— '
  '★is_initial_horse_candidate() はこれに id を渡すだけの包み。★条件は 0033（CL-5''）から 1 文字も変えていない。'
  '★security definer なのは horses が利用者から読めないため（V-20）。★列挙できるのはサーバー側だけ';

revoke all on function initial_horse_candidates(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ② 「その 1 頭が候補か」（★①の薄い包みに変える。★条件を書き写さない）
-- ---------------------------------------------------------------------------
create or replace function is_initial_horse_candidate(p_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from initial_horse_candidates(p_horse_id));
$$;

comment on function is_initial_horse_candidate(uuid) is
  '★初期馬の候補か（D-074/D-079）。★2026-09-19・UI1-1 で initial_horse_candidates() の包みに変えた — '
  '★条件を 2 か所に書かないため（D-052）。★判定の中身は 0033（CL-5'') と同じ';

-- ---------------------------------------------------------------------------
-- ③ 1 頭を選ぶ（★無作為・★掴んだまま返す）
-- ---------------------------------------------------------------------------
--   ⚠️ ★**利用者には渡しません。** ★`create_account` の中からだけ呼ばれます。
--      ★画面が「選ぶ → 渡す」の 2 本立てにすると、★**間に割り込まれて別の馬になりえます**
--      （★照会 §2 の案 B の穴）。★1 本の RPC の中で選び、同じトランザクションで渡します。
--   ★道具（`tools/verify-initial-horse-distribution.mjs`）はこの関数を直に呼びます —
--   ★**評価者と同じ入力を測るため**です（R-30。★問い合わせの写しを測らない）。
create or replace function pick_initial_horse()
returns uuid
language sql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
  select h.id
    from (
      select c as id, row_number() over (order by random()) as rn
        from initial_horse_candidates() c
    ) shuffled
    join horses h on h.id = shuffled.id
   order by shuffled.rn
     for update of h skip locked
   limit 1;
$$;

comment on function pick_initial_horse() is
  '★初期馬を 1 頭選ぶ（D-074/D-079 ①③・2026-09-19・UI1-6）。★order by random() で無作為 — '
  '★order by id は「プールの先頭から順に消費」になり D-079 ③（再付与で分布が同じ）を破る。'
  '★auth.uid() のハッシュは D-079 ① が明示的に禁じている。'
  '★憲法 4（Math.random 禁止）は §8.6 Provably Fair の文脈で、口座の作成は対象外（レース結果に関わらず、'
  '再現性も要求されない。むしろ D-079 ③ が無作為を要求する）。★for update skip locked は同時登録で'
  '同じ馬を 2 人に渡さないため。★無作為に並べてから掴めた先頭を取るので、飛ばしても分布は偏らない';

revoke all on function pick_initial_horse() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ④ セットアップ RPC（★`p_horse_id` を省略可にし、null なら中で選ぶ）
-- ---------------------------------------------------------------------------
--   ⚠️ ★**署名は変えていません**（`text,text,text,text,uuid,uuid`）。
--      ★既定値を足しただけなので、★公開の登録簿（`tools/lib/exposure-registry.mjs`）の鍵も同じです。
--   ⚠️ ★`p_client_token` にも既定値が要ります（★PostgreSQL は既定値つきの後ろに
--      ★既定値なしを置けません）。★中身は今までどおり ★**null なら落とします**。
create or replace function create_account(
  p_display_name text,
  p_stable_name text,
  p_silk_color text,
  p_silk_sleeve text,
  -- ★★2026-09-19・UI1-2: **省略可**。★null なら下で選びます（★`0031:125` の註記はこれで訂正）
  p_horse_id uuid default null,
  p_client_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_confirmed timestamptz;
  v_is_email boolean;
  v_key text;
  v_existing bigint;
  v_horse uuid;
  v_grant bigint := 2000;   -- ★D-075: 登録時 2,000 EP（較正定数・値をゲートにしない）
begin
  -- ★① 未認証を弾く（★`assert_setup_complete()` は呼べない。口座を作る側なので順序が逆）
  if v_user is null then
    raise exception '未認証';
  end if;
  if p_client_token is null then
    raise exception '冪等キー（client_token）が必要';
  end if;

  -- ★② メール確認を、この RPC 自身の中でも確認する（★D-113 ④・設定 1 枚に頼らない）
  select exists (
    select 1 from auth.identities where user_id = v_user and provider = 'email'
  ) into v_is_email;
  if v_is_email then
    select email_confirmed_at into v_confirmed from auth.users where id = v_user;
    if v_confirmed is null then
      raise exception 'メールの確認が済んでいません（届いたメールのリンクを開いてください）';
    end if;
  end if;

  -- ★③ 冪等（★再送で二重に付与しない・V-19 ⑭）
  v_key := 'setup:' || p_client_token::text;
  select id into v_existing from ep_ledger where dedupe_key = v_key;
  if found then
    return v_user;   -- ★既に済んでいる。何もしない
  end if;

  if p_display_name is null or length(btrim(p_display_name)) = 0 then
    raise exception '表示名が必要';
  end if;
  if p_stable_name is null or length(btrim(p_stable_name)) = 0 then
    raise exception '牧場名が必要';
  end if;

  -- ★④ 口座（★upsert を書かない。2 回目はここで落ち、全部ロールバックする・V-19 ⑭）
  insert into users (id, display_name, stable_name, silk_color, silk_sleeve, entry_points)
  values (v_user, btrim(p_display_name), btrim(p_stable_name), p_silk_color, p_silk_sleeve, v_grant);

  -- ★⑤ 初期 EP を台帳にも記帳する（★サーバー権威・憲法 §0.2-4。残高だけ動かさない）
  insert into ep_ledger (user_id, delta, balance_after, reason, dedupe_key)
  values (v_user, v_grant, v_grant, 'inflow', v_key);

  -- ★⑥ 初期馬
  --   ★**渡されていなければ、ここで選びます**（★2026-09-19・UI1-2・D-074「サーバー側で付与」）。
  --   ⚠️ ★渡された場合も ★**候補かどうかを必ず確かめます**（★呼ぶ側の申告を信用しない・憲法 3）。
  v_horse := p_horse_id;
  if v_horse is null then
    v_horse := pick_initial_horse();
    if v_horse is null then
      -- 🔴 ★**黙って広げません**（★D-079 ⑦「枯渇時は帯を広げてよいが、広げた回数と幅を記録し監視する」）。
      --    ★いまは帯を広げる仕組みがないので、★**落として気づける形**にします（R-16）。
      raise exception '初期馬の候補がいません（NPC の現役・未出走の馬が尽きています）';
    end if;
  end if;
  if not is_initial_horse_candidate(v_horse) then
    raise exception 'この馬は初期馬の候補ではありません（既に持ち主がいる／引退／出走済みの可能性）';
  end if;
  -- ★NPC から 1 頭抜くことは明示的に許可されている（D-079 ⑨）。
  --   失われるのは「NPC として自動で走る枠」だけで、出走頭数・ベット対象・血統プールへの寄与は残る
  update horses set owner_id = v_user, npc_stable_id = null where id = v_horse;

  return v_user;
end $$;

comment on function create_account(text,text,text,text,uuid,uuid) is
  '★初回セットアップ（D-074/D-075/D-079・V-19 ⑭）。口座・初期 EP 2,000・初期馬を 1 トランザクションで。'
  '★2026-09-19・UI1-2: p_horse_id を省略可にし、null なら pick_initial_horse() が無作為に選ぶ — '
  '★画面は horses を読めないので id を渡せず（照会 QUESTIONS_UI_SETUP_HORSE_20260918）、'
  '★D-074 も「画面で抽選しない。付与はサーバー側」と定めている。★0031:125 の註記'
  '「呼ぶ側（ワーカー）が★で選んだ馬」は、D-114 で段を外に出さなくなったため前提ごと失効した。'
  '★assert_setup_complete() は呼ばない（口座を作る側で順序が逆・D-080 の対象外）。'
  '代わりに ①auth.uid() の null 弾き ②email_confirmed_at の確認 ③dedupe_key の冪等 を自前で持ち、'
  'apps/cli/test/rpc-guard.test.ts の第三の登録簿がそれを検査する';

revoke all on function create_account(text,text,text,text,uuid,uuid) from public, anon;
grant execute on function create_account(text,text,text,text,uuid,uuid) to authenticated;

commit;
