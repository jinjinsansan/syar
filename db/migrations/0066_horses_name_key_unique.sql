-- ---------------------------------------------------------------------------
-- 0066 馬名の正規化キーに一意と not null を張る（★PLAN I-3 段 3・2026-09-22）
--
-- 裁定 REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md（ff7028c）§2 条件 1・2 ／
--      REVIEW_I3_NAMING_VERDICT_20260922.md（f117984）§3。
--
-- 【★前提】（★この移行の前に済んでいること）
--   段 0: ★`horses` に書く 4 か所（★NPC の仔・seed-world・verify-a6・命名の確定）が `name_key` を書く
--   段 1: ★`0064` で列を足した
--   段 2: ★`tools/backfill-name-key.mjs --apply` で既存の全頭を埋め、★重なり 0・空 0 を確かめた
--   ✔ ★本番の下見（2026-09-22・読むだけ）: ★7,370 頭・★正規化で重なる組 0・★正規化で空 0
--
-- 【🔴 ★空の行が 1 行でもあれば投げます】（★裁定 f117984 §3 の「実行の直前に数える」）
--   ★段 2 を流し忘れた DB に当てると、★ここで止まります（★not null の失敗より先に、★理由を名指しして）。
--
-- 【★一意違反が起きたら】
--   ★NPC の配合・命名の確定とも、★違反は ★取引ごと戻り、★次の周にやり直します。
--   ★やり直しでは ★使用済みの名前を DB から読み直すので、★衝突した名前を避けて引きます
--   （★NPC の仔の名前は `loadFoalNaming` の `taken`・★命名は `nameTaken` が `name_key` で引く）。
-- ---------------------------------------------------------------------------

begin;

do $$
declare
  v_null int;
begin
  select count(*) into v_null from horses where name_key is null;
  if v_null > 0 then
    raise exception '★horses.name_key が空の行が % 行あります。★先に tools/backfill-name-key.mjs --apply を流してください（★PLAN I-3 段 2）', v_null;
  end if;
end $$;

alter table horses alter column name_key set not null;

create unique index if not exists horses_name_key_unique on horses (name_key);

commit;
