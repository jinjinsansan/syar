-- ============================================================================
-- 0076 結果の画面（B-5）に要る 2 つを読む口に足す（デザイナー第 2 便 §5 B-5）
--
--   B-5 が出すもののうち、読む口に無かったのは次の 2 つ：
--     ① 「種付料 ○ EP を使いました（確定したときの額）」
--        → foal_requests.stud_fee_ep に書いてあるが、my_foal_request が返していなかった
--     ② 「この母（○○）の n 頭目の仔です。」
--        → 母の foal_count。my_foal_drafts が返していなかった
--
--   ⚠️ ② の n は「母のいまの産駒数」です。生まれた直後はその仔の番号と一致します
--      （確定のときに foal_count を 1 増やしてから下書きを置くため）。
--      ⚠️ 年をまたいで母がまた産むと、古い下書きの n はずれます。
--         → 画面は「いま依頼して生まれた仔」にだけ出すこと（★古い下書きの一覧には出さない）。
--         ★仔ごとの番号を持たせるなら列が要ります（★この便ではしません）。
--
--   🔴 EP の額を返すのは「使った額の報告」だけです。購入・チャージの経路ではありません（憲法 2）。
--   ⚠️ 戻り値の列が増えるので、先に落としてから作り直す（0073・0075 と同じ）。
-- ============================================================================
begin;

drop function if exists public.my_foal_request(uuid);
drop function if exists public.my_foal_drafts();

create or replace function public.my_foal_request(p_request_id uuid)
returns table (request_id uuid, kind text, status text, failure_reason text,
               result_id uuid, created_at timestamptz, stud_fee_ep bigint)
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
    select r.id, r.kind, r.status, r.failure_reason, r.result_id, r.created_at, r.stud_fee_ep
      from foal_requests r
     where r.id = p_request_id and r.user_id = v_user;
end;
$function$;

revoke all on function public.my_foal_request(uuid) from public, anon;
grant execute on function public.my_foal_request(uuid) to authenticated;

create or replace function public.my_foal_drafts()
returns table (draft_id uuid, sex text, sire_id uuid, sire_name text,
               dam_id uuid, dam_name text, birth_week bigint, named_horse_id uuid,
               dam_foal_count int)
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
    select d.id, d.sex, d.sire_id, s.name, d.dam_id, m.name, d.birth_week, d.named_horse_id,
           m.foal_count
      from foal_drafts d
      join horses s on s.id = d.sire_id
      join horses m on m.id = d.dam_id
     where d.user_id = v_user
     order by d.created_at;
end;
$function$;

revoke all on function public.my_foal_drafts() from public, anon;
grant execute on function public.my_foal_drafts() to authenticated;

comment on function public.my_foal_drafts() is
  '★本人の命名前の仔（★性別・父・母・誕生週だけ。★genotype / potential / stats を出さない・D-114）。'
  '★0076 で母の産駒数を追加（★B-5「この母の n 頭目の仔です」）。'
  '⚠️ ★n は母のいまの数。★生まれた直後だけその仔の番号と一致する（★古い下書きには出さないこと）';

commit;
