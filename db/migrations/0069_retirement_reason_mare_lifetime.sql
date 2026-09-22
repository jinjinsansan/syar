-- ============================================================================
-- 0069 引退の理由に 'mare_lifetime_foals' を許す
--   裁定 REVIEW_PROD_DEPLOY_ORDER_20260922.md §1（開発側の発見・2026-09-22）
--
--   NPC の配合（breeding-runner.ts）は年の変わり目に、生涯 8 産の繁殖牝馬を
--   retirement_reason = 'mare_lifetime_foals' で功労馬へ降ろす。
--   ところが 0010 の制約は 'age' と 'career_ending_injury' しか許しておらず、広げた移行も無かった。
--   → 該当する繁殖牝馬が 1 頭でも出た年の頭に、配合の週が制約違反で落ち、配合が止まる。
--   偽の DB（verify-pool-supply）は制約を再現しないので、12 年回しても捕まえられなかった。
--
--   役割の依頼（0070）とは別のファイルにする（1 ファイル ＝ 1 取引。0070 が落ちても、この直しを巻き添えで戻さない）。
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'horses_retirement_reason_known') then
    alter table horses drop constraint horses_retirement_reason_known;
  end if;
  alter table horses add constraint horses_retirement_reason_known
    check (retirement_reason is null
      or retirement_reason in ('age', 'career_ending_injury', 'mare_lifetime_foals'));
end $$;

commit;
