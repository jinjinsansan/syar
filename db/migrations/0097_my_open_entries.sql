-- ★**自分の馬の 取り消せるかもしれない登録を読む口**（★2026-09-29・D-123 ①・レビュー側の指示「出走の取消の画面」）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です。
--
-- 【🔴 ★なぜ】
--   ★取消の口 `request_entry_scratch(p_request_id, p_entry_id)`（`0079`）は ★**登録の id** を取ります。
--   ★ところが画面が読める `race_entries_public` には ★登録の id が無く、★`race_entries` は閉じている
--   → ★**口は在るのに 画面から呼べなかった**（★簿 ONE-WAY-DOORS・★/entry は「取り消せません」と言っていた）。
--
-- 【★返すもの】
--   ★本人の馬の、★まだ取消になっていない登録で、★レースが `announced` か `scheduled` のものだけ。
--   ★`race_status` は ★**サーバーの段そのもの**（★画面は時刻で判定しない・D-123）。
--   ★取り消せるのは `announced` の間だけ（★判定は `request_entry_scratch` が持つ・★ここは下見）。
--   ⚠️ ★素質・能力・枠は返さない（★D-114・★締切前の枠は嘘になる DF-3）。
--
-- 【★状態を変えない】 ★`language plpgsql stable`・★書き込む側（`request_entry_scratch`）が `assert_setup_complete()` を持つ。
-- ---------------------------------------------------------------------------
begin;

create or replace function public.my_open_entries()
returns table (entry_id uuid, race_id uuid, horse_id uuid, race_status text)
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
    select e.id, e.race_id, e.horse_id, r.status
      from race_entries e
      join horses h on h.id = e.horse_id
      join races r on r.id = e.race_id
     where h.owner_id = v_user
       and e.scratched_at is null
       and r.status in ('announced', 'scheduled');
end;
$function$;

comment on function public.my_open_entries() is
  '★本人の馬の まだ取消になっていない登録（★2026-09-29・0097・D-123 ①）。★取消の口 request_entry_scratch が取る登録 id を画面へ渡す。'
  '★race_status はサーバーの段（★取り消せるのは announced の間だけ・判定は request_entry_scratch）';

revoke all on function public.my_open_entries() from public, anon;
grant execute on function public.my_open_entries() to authenticated;

commit;
