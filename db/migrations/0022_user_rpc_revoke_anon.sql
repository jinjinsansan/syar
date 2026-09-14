-- 0022: 利用者が呼ぶ RPC（place_bet・exchange_prize）から anon の EXECUTE を剥がす（照会 Q2・D-095 と対）
--
-- ============================================================================
-- 【なぜ】
--   `0002`・`0008` は public からだけ剥がし、anon は Supabase の既定（`pg_default_acl`）で付いたままだった
--   （本番・staging とも実測・`REPORT_AUDIT_FIX_20260914.md` §1-a）。
--   先頭の `assert_setup_complete()` が「未認証」で弾くので、動作としては閉じていた。
--   しかし**その検査を外す変更が入った日に穴が開く**。`spend_training_ep` で実際に起きた経路（監査 H-4）。
--
-- 【authenticated について】
--   authenticated への付与を、この移行ファイルでも書き直す。付与は既にあり（`0002`・`0008`）、ACL は変わらない。
--   `0020` の `create or replace` より前の付与だけでは、「最後の定義より後に authenticated への付与がある」ことを
--   移行ファイルの走査で確かめられないため（`apps/cli/test/rpc-guard.test.ts` の利用者 RPC の条件）。
--
-- 【入れていないもの】
--   関数の既定の権限（`alter default privileges`）は入れていない。
--   `pg_default_acl` に `postgres` 以外のロール（`supabase_admin`）の public の関数の行があり、
--   指示書 `DEV_INSTRUCTIONS_AUDIT_FIX2_20260914.md` §3-1 の条件により照会に回した。
-- ============================================================================
begin;

revoke all on function public.place_bet(uuid, text, jsonb, integer, uuid) from public, anon;
grant execute on function public.place_bet(uuid, text, jsonb, integer, uuid) to authenticated;

revoke all on function public.exchange_prize(bigint, uuid) from public, anon;
grant execute on function public.exchange_prize(bigint, uuid) to authenticated;

commit;
