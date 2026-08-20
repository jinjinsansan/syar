-- 0019: 未セットアップ状態の判定を1か所に集約する（D-080・Q-SETUP-04）
--
-- ============================================================================
-- 【なぜ要るか】
--   LINE ログイン（D-076）を入れると、**「auth ユーザーはあるが `users` 行が無い」**
--   という状態が正常な中間状態として存在します（D-078）:
--
--     ① LINE でログイン → auth ユーザーとセッションができる
--     ② /setup で表示名・牧場名・勝負服を入力
--     ③ セットアップ RPC が users 行＋初期 EP＋初期馬を1トランザクションで作る
--
--   **②の途中で離脱した利用者は、セッションを持ったまま口座を持ちません。**
--
-- 【★「自然に落ちる」に任せない】
--   レビュー側の裁定（2026-08-20）:
--     > **「`users` を参照する RPC が自然に落ちる」ことに任せないでください** —
--     > 落ち方が RPC ごとに違うと、**どこかで「0 で通る」ものが出ます**
--
--   実際、既存の RPC は落ち方がばらばらです:
--     `place_bet`         … `auth.uid()` が null なら弾くが、**users 行の有無は見ていない**
--     `spend_training_ep` … `horses.owner_id` で判定（口座ではなく馬から辿る）
--     `exchange_prize`    … 残高で判定（**0 は「足りない」であって「口座が無い」ではない**）
--
--   ★特に3つ目が R-27 の違反です — **「残高0」と「口座が無い」が同じ扱い**になっており、
--     縮退が**広い側**（通る側）ではないものの、**意味の違う2つを同じ経路に落としています**。
--
-- 【★書き忘れを構造で塞ぐ】
--   個別実装は必ず書き忘れが出て、**書き忘れは「通ってしまう」側に倒れます**。
--   → 共通関数に集約し、**呼んでいない RPC を走査型メタテストで検出**する
--     （`apps/cli/test/rpc-guard.test.ts`。除外は明示登録簿のみ）。
--     `tool-guard.test.ts` が `tools/*.mjs` に、V-20 ③ が public のテーブルに対して
--     やっているのと同じ形です。**この案件では手書きの列挙が4回漏れています**（R-29）。
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 未セットアップなら例外を投げる。
--
-- ★戻り値は「呼び出し元の user_id」にしている。
--   単に検査するだけの関数だと、呼び出し元が **`auth.uid()` を自分で引き直す**ことになり、
--   「検査した uid」と「使う uid」が別々に取得される形が残る（2か所で引けば必ず離れる・D-071）。
--   → **検査と取得を同じ1回にする。**
-- ---------------------------------------------------------------------------
create or replace function assert_setup_complete()
returns uuid
language plpgsql
security definer
-- definer 関数で search_path を固定するのは必須（0002 の注記）
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '未認証';
  end if;
  -- ★口座があるかどうかだけを見る。残高は見ない（残高0は「口座が無い」ではない）
  if not exists (select 1 from users where id = v_user) then
    raise exception '未セットアップ（/setup で牧場を作ってください）';
  end if;
  return v_user;
end $$;

comment on function assert_setup_complete() is
  'D-080: 未セットアップ状態の判定。すべての書き込み RPC の先頭で呼ぶ。'
  '★呼んでいない RPC は apps/cli/test/rpc-guard.test.ts が検出する（除外は明示登録簿のみ）';

-- ★anon には実行させない。未認証は上で弾くが、権限としても閉じる（0018 と同じ既定）
revoke all on function assert_setup_complete() from public, anon;
grant execute on function assert_setup_complete() to authenticated;

commit;
