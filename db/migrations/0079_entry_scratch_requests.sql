-- ---------------------------------------------------------------------------
-- 0079 出走の取消を、利用者が頼めるようにする（★2026-09-25・正典 D-123・簿 ONE-WAY-DOORS）
--
-- 【★なぜ要るか】
--   ★利用者が「始められる」口は 9 件、★「取り消せる」口は ★**0 件**でした（★簿 `ONE-WAY-DOORS`）。
--   ★オーナー決定: ★**出走の取消は作る（★発売開始の前まで）／★投票の取消は作らない**。
--
-- 【🔴 ★段で判定します。★時刻で判定しません】（★D-123）
--   ★受けるのは ★**`races.status = 'announced'`** の間だけです。
--     ★`announced` … 枠だけ（★出走馬もオッズも無い・★登録を受け付ける段）
--     ★`scheduled` … 出走表とオッズが入った（★**発売できる**段）
--   → ★`scheduled` になったら ★**拒みます**。★そこから先は ★**自分の取消で他人の賭けを崩せる**からです。
--   ⚠️ ★`entry_deadline_at`（時刻）では判定しません。★時計の差で「段は進んだのに時刻はまだ」が起きます。
--
-- 【🔴 ★返す処理をここに書きません】（★D-052・D-111 ⑤）
--   ★返す経路は ★**既に在ります**: `apps/worker/src/scratch.ts` の `scratchEntry`
--   （★登録料は `races.entry_fee_ep` の行から読み、★騎手の料金は `race_entries.jockey_frozen`、
--    ★二度払いは `ep_ledger.dedupe_key = 'scratch:<entry_id>'` で防ぐ）。
--   🔴 ★ここで SQL に書き写すと ★**返し方が 2 通り**になります。
--      ★`scratch.ts` の註記が、まさにその穴（★取る側は行から・返す側は定数 200）を記録しています。
--   → ★この移行は ★**依頼を積むだけ**です。★確定はワーカーが `scratchEntry` で行います
--     （★`foal_requests` と同じ作りです）。
--
-- ⚠️ ★利用者に返すのは「受け付けた」までです。★実際に取り消せたかは、★読む口で見ます。
-- ---------------------------------------------------------------------------

begin;

create table if not exists entry_scratch_requests (
  id uuid primary key,
  user_id uuid not null references users (id),
  entry_id uuid not null references race_entries (id),
  status text not null default 'pending',
  -- ★断られた理由（★黙って消さない・D-111 ⑤）
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  constraint entry_scratch_status_allowed check (status in ('pending', 'done', 'failed')),
  constraint entry_scratch_result_shape check (
    (status = 'pending' and failure_reason is null)
    or (status = 'done' and failure_reason is null)
    or (status = 'failed' and failure_reason is not null)
  )
);

-- ★同じ登録に対する取消の依頼は 1 本だけ（★失敗した行は枠を使わない＝やり直せる）
create unique index if not exists entry_scratch_one_per_entry
  on entry_scratch_requests (entry_id) where status <> 'failed';

comment on table entry_scratch_requests is
  '★出走の取消の依頼（★2026-09-25・D-123）。★受けるのは races.status = ''announced'' の間だけ。'
  '★返す処理はここに無い — ★ワーカーの scratchEntry（D-111 ⑤）が行う（★返し方を 2 通りにしない・D-052）';

alter table entry_scratch_requests enable row level security;
revoke all on table entry_scratch_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 受付: ★積むだけ。★同じ依頼 ID の再送には前の行を返す（★エラーにしない）
-- ---------------------------------------------------------------------------
create or replace function public.request_entry_scratch(
  p_request_id uuid, p_entry_id uuid
) returns table (request_id uuid, status text, failure_reason text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_race_status text;
  v_scratched timestamptz;
  v_existing entry_scratch_requests%rowtype;
begin
  perform assert_setup_complete();   -- ★D-080
  if v_user is null then
    raise exception '未認証です' using errcode = 'ST010';
  end if;
  if p_request_id is null or p_entry_id is null then
    raise exception '依頼 ID と登録 ID が要ります' using errcode = 'ST040';
  end if;

  -- ★再送なら前の行をそのまま返す（★二重に積まない）
  select * into v_existing from entry_scratch_requests where id = p_request_id;
  if found then
    if v_existing.user_id <> v_user then
      raise exception '他の人の依頼です' using errcode = 'ST010';
    end if;
    return query select v_existing.id, v_existing.status, v_existing.failure_reason;
    return;
  end if;

  -- ★自分の登録か・★まだ取消になっていないか・★レースの段
  select h.owner_id, e.scratched_at, r.status
    into v_owner, v_scratched, v_race_status
    from race_entries e
    join horses h on h.id = e.horse_id
    join races r on r.id = e.race_id
   where e.id = p_entry_id
     for update of e;
  if not found then
    raise exception 'その登録はありません' using errcode = 'ST024';
  end if;
  if v_owner is null or v_owner <> v_user then
    raise exception '自分の馬の登録ではありません' using errcode = 'ST010';
  end if;
  if v_scratched is not null then
    raise exception 'その登録はすでに取消になっています' using errcode = 'ST024';
  end if;
  /**
   * 🔴 ★**段で判定します**（★D-123・★時刻で判定しない）。
   *   ★`announced` の間だけ受けます。★`scheduled` は ★**発売できる段**なので、
   *   ★そこから取り消せると ★**自分の取消で他人の賭けを崩せます**。
   */
  if v_race_status <> 'announced' then
    raise exception 'このレースはもう取り消せません（発売の準備に入っています）' using errcode = 'ST025';
  end if;

  insert into entry_scratch_requests (id, user_id, entry_id)
  values (p_request_id, v_user, p_entry_id);

  return query select p_request_id, 'pending'::text, null::text;
end;
$function$;

revoke all on function public.request_entry_scratch(uuid, uuid) from public, anon;
grant execute on function public.request_entry_scratch(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 読む口: ★本人の取消の依頼 1 件
-- ---------------------------------------------------------------------------
create or replace function public.my_entry_scratch(p_request_id uuid)
returns table (status text, failure_reason text, created_at timestamptz)
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
    select r.status, r.failure_reason, r.created_at
      from entry_scratch_requests r
     where r.id = p_request_id and r.user_id = v_user;
end;
$function$;

revoke all on function public.my_entry_scratch(uuid) from public, anon;
grant execute on function public.my_entry_scratch(uuid) to authenticated;

commit;
