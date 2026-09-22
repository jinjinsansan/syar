-- ---------------------------------------------------------------------------
-- 0061 プレイヤーの配合の要求と、命名前の仔の下書き（★PLAN I-2・D-120・2026-09-22）
--
-- ★本番に当てるのは、本番の血統修復 → 0060 → 配備 の後（D-120 ⑤）。
--
-- 【何をするか】（裁定 REVIEW_FIRST_HORSE_BREED_PLACEMENT_VERDICT_20260922.md §1）
--   ★利用者の RPC は「要求を積むだけ」。★`breed()` を呼んで仔を確定するのはワーカーだけ（§15.3）。
--   ★手本は 0057（置き場の表 ＋ 所有をサーバーで確かめる書く口 ＋ ワーカーが読む）。
--
-- 【表は 2 つ】（裁定 REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md §1・§3）
--   `foal_requests` … 要求の表。★1 つにして `kind` で分ける（'breed_initial' | 'breed' | 'name'）
--   `foal_drafts`   … 命名前の仔。★`horses` に入れない＝構造上 出走・一覧・NPC の配合相手に紛れ込めない
--
-- 【冪等キーは 2 段】（配合の裁定 §2）
--   第 1 段: 要求 ID（クライアントが作る uuid・主キー）。★同じ ID が 2 回来たら新しい行を作らず、前の行を返す
--   第 2 段: 業務上の一意。★`kind` ごとに部分一意を張る（1 つの一意で全部を表さない）
--
-- 【★この移行に無いもの】
--   ・命名の受付（kind = 'name'）の RPC と、`horses.name_key` / `name_checked_with` → 命名の便（PLAN I-3）
--   ・通常の配合（kind = 'breed'）の受付 → 引退時の役割選択（I-1）が無いので、★RPC は初回だけを受け付ける
--   ・父母候補の出どころ（D-120 ⑥ N-1）→ ★受付では父母の資格を判定しない。判定はワーカーがロックの後で行う
-- ---------------------------------------------------------------------------

begin;

create table if not exists foal_requests (
  -- ★第 1 段の鍵。★仔の ID と乱数の種はこの値から作る（配合の裁定 §3・NPC の「父・母・週」を流用しない）
  id uuid primary key,
  user_id uuid not null references users (id),
  kind text not null,
  -- ★配合の要求だけが持つ
  sire_id uuid references horses (id),
  dam_id uuid references horses (id),
  -- ★命名の要求だけが持つ（命名の便で使う）
  draft_id uuid,
  proposed_name text,
  status text not null default 'pending',
  -- ★失敗の理由（canMate の reason・候補切れ等）。★黙って消さない（D-111 ⑤）
  failure_reason text,
  -- ★確定した結果（配合 → 下書きの ID ／ 命名 → horses の ID）。★結果は確定の後にだけ入る（D-120 ①）
  result_id uuid,
  -- ★免除した種付料（D-120 ②）。★確定の時点の NPC 種牡馬の式の値。黙って 0 にしない
  waived_stud_fee_ep bigint,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint foal_requests_kind_allowed check (kind in ('breed_initial', 'breed', 'name')),
  constraint foal_requests_status_allowed check (status in ('pending', 'done', 'failed')),
  -- ★種類ごとに持つ列を閉じる
  constraint foal_requests_shape check (
    (kind in ('breed_initial', 'breed')
       and sire_id is not null and dam_id is not null and sire_id <> dam_id
       and draft_id is null and proposed_name is null)
    or (kind = 'name'
       and draft_id is not null and proposed_name is not null
       and sire_id is null and dam_id is null)
  ),
  -- ★状態と結果の組を閉じる（完了なのに結果が無い・失敗なのに理由が無い、を作らない）
  constraint foal_requests_result_shape check (
    (status = 'pending' and result_id is null and failure_reason is null)
    or (status = 'done' and result_id is not null and failure_reason is null)
    or (status = 'failed' and result_id is null and failure_reason is not null)
  ),
  -- ★種付料の免除は初回の配合が完了したときだけ記録する
  constraint foal_requests_waiver_shape check (
    waived_stud_fee_ep is null
    or (kind = 'breed_initial' and status = 'done' and waived_stud_fee_ep >= 0)
  )
);

-- ★第 2 段の鍵（初回の配合）。★失敗した行は枠を使わない（D-120 ④・途中離脱しても権利は失効しない）
create unique index if not exists foal_requests_one_initial_per_user
  on foal_requests (user_id) where kind = 'breed_initial' and status <> 'failed';

-- ★第 2 段の鍵（命名）。★下書きごとに成功は 1 件
create unique index if not exists foal_requests_one_name_per_draft
  on foal_requests (draft_id) where kind = 'name' and status = 'done';

-- ★ワーカーが毎周 拾う（★古い順）
create index if not exists foal_requests_pending_idx
  on foal_requests (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 命名前の仔（★`horses` の外に置く）
--
-- ⚠️ ★母の `foal_count` は確定の時点で 1 増えるが、★この表に居る間は `horses` に子が居ない。
--   ★`foal_count` と子の数を突き合わせる検査を作るときは、★「`horses` の子 ＋ この表の未命名の行」で数えること
--   （裁定 N-2 §1 条件 2。★書かないと、未来の検査が下書きを見落として「数が合わない」を出す）。
-- ⚠️ ★所有上限（D-120 ③・現役 30）には、★この表の未命名の行も数える（数え方は `ownership.ts` の 1 か所）。
-- ---------------------------------------------------------------------------
create table if not exists foal_drafts (
  -- ★生まれる仔の ID（★要求 ID から作る）。★命名の後もこの ID のまま `horses` に入る
  id uuid primary key,
  user_id uuid not null references users (id),
  request_id uuid not null unique references foal_requests (id),
  sire_id uuid not null references horses (id),
  dam_id uuid not null references horses (id),
  sex text not null,
  birth_week bigint not null,
  -- ★`breed()` の結果を丸ごと（★`horses` の列と同じ名前の鍵）。★命名の便がこれを `horses` に入れる
  record jsonb not null,
  -- ★命名が通ったら `horses` の ID（＝ `id` と同じ値）を書く
  named_horse_id uuid references horses (id),
  created_at timestamptz not null default now(),
  constraint foal_drafts_sex_known check (sex in ('male', 'female')),
  constraint foal_drafts_named_same_id check (named_horse_id is null or named_horse_id = id)
);

-- ★同じ母・同じ週に 1 頭（★`0054` の `horses_one_foal_per_dam_per_week` はこの表には効かない）。
--   ★`horses` と この表をまたいだ判定は、★ロックの後の `canMate()`（母の `bred_this_year`）が担う
create unique index if not exists foal_drafts_one_per_dam_per_week
  on foal_drafts (dam_id, birth_week);

-- ★クライアントは直に読み書きしない（0057 と同じ・V-20 の登録簿に closed で載せる）
revoke all on table foal_requests from public, anon, authenticated;
revoke all on table foal_drafts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 受付: 初回の配合。★積むだけ。★同じ要求 ID の再送には前の行を返す（エラーにしない）
-- ---------------------------------------------------------------------------
create or replace function public.request_initial_breeding(
  p_request_id uuid, p_sire_id uuid, p_dam_id uuid
) returns table (request_id uuid, status text, failure_reason text, result_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_row foal_requests%rowtype;
begin
  v_user := assert_setup_complete();
  if p_request_id is null or p_sire_id is null or p_dam_id is null then
    raise exception '要求 ID・父・母が必要です' using errcode = 'ST020';
  end if;
  if p_sire_id = p_dam_id then
    raise exception '父と母に同じ馬は選べません' using errcode = 'ST022';
  end if;

  -- ★第 1 段: 同じ要求 ID が既に在れば、その行を返す
  select * into v_row from foal_requests where id = p_request_id;
  if found then
    if v_row.user_id <> v_user or v_row.kind <> 'breed_initial' then
      -- ★他人の要求の中身を返さない
      raise exception 'その要求 ID は使えません' using errcode = 'ST021';
    end if;
    return query select v_row.id, v_row.status, v_row.failure_reason, v_row.result_id;
    return;
  end if;

  -- ★第 2 段: 初回は利用者ごとに 1 件。★既に在れば（別タブ・別の要求 ID）その行を返す
  select * into v_row from foal_requests
   where user_id = v_user and kind = 'breed_initial' and status <> 'failed'
   limit 1;
  if found then
    return query select v_row.id, v_row.status, v_row.failure_reason, v_row.result_id;
    return;
  end if;

  -- ★同時に 2 本来た場合は部分一意（foal_requests_one_initial_per_user）が 1 本を落とす。
  --   ★落ちた側は、勝った側の行を返す
  begin
    insert into foal_requests (id, user_id, kind, sire_id, dam_id)
         values (p_request_id, v_user, 'breed_initial', p_sire_id, p_dam_id);
  exception when unique_violation then
    select * into v_row from foal_requests
     where user_id = v_user and kind = 'breed_initial' and status <> 'failed'
     limit 1;
    if not found then
      -- ★主キー（要求 ID）の衝突。★他人の行なら中身を返さない
      select * into v_row from foal_requests where id = p_request_id;
      if not found or v_row.user_id <> v_user or v_row.kind <> 'breed_initial' then
        raise exception 'その要求 ID は使えません' using errcode = 'ST021';
      end if;
    end if;
    return query select v_row.id, v_row.status, v_row.failure_reason, v_row.result_id;
    return;
  end;

  return query select p_request_id, 'pending'::text, null::text, null::uuid;
end;
$function$;

revoke all on function public.request_initial_breeding(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_initial_breeding(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 読む口: 本人の初回の配合（★要求 ID なしでも引ける＝再ログイン後の再開・D-120 ④）
-- ---------------------------------------------------------------------------
create or replace function public.my_initial_breeding()
returns table (request_id uuid, status text, failure_reason text, result_id uuid)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  -- ★失敗した行も返す（理由を画面に出す）。★失敗していない行を優先し、新しい順に 1 件
  return query
    select r.id, r.status, r.failure_reason, r.result_id
      from foal_requests r
     where r.user_id = v_user and r.kind = 'breed_initial'
     order by (r.status <> 'failed') desc, r.created_at desc
     limit 1;
end;
$function$;

revoke all on function public.my_initial_breeding() from public, anon;
grant execute on function public.my_initial_breeding() to authenticated;

-- ---------------------------------------------------------------------------
-- 読む口: 本人の命名前の仔（★性別・父・母・誕生週だけ。★genotype / potential / stats を出さない・D-114）
-- ---------------------------------------------------------------------------
create or replace function public.my_foal_drafts()
returns table (draft_id uuid, sex text, sire_id uuid, sire_name text,
               dam_id uuid, dam_name text, birth_week bigint, named_horse_id uuid)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  return query
    select d.id, d.sex, d.sire_id, s.name, d.dam_id, m.name, d.birth_week, d.named_horse_id
      from foal_drafts d
      join horses s on s.id = d.sire_id
      join horses m on m.id = d.dam_id
     where d.user_id = v_user
     order by d.created_at;
end;
$function$;

revoke all on function public.my_foal_drafts() from public, anon;
grant execute on function public.my_foal_drafts() to authenticated;

commit;
