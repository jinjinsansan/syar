-- ---------------------------------------------------------------------------
-- 0064 馬名の正規化キーと、禁止名の検査の版（★PLAN I-3・D-120・2026-09-22）
--
-- 裁定 REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md（ff7028c）§2・§4 ／
--      REVIEW_I3_NAMING_VERDICT_20260922.md（f117984）§3。
--
-- 【★段 1: 列を足すだけ（★一意も not null もまだ張らない）】
--   `name_key`          … ★`normalizeName(name)` の結果（★TS が計算した値を DB は比べるだけ・D-052）
--   `name_checked_with` … ★どの版の禁止名リスト（実在馬名）で検査したか。★検査していなければ null
--
-- 【★順番】（★裁定 f117984 §3）
--   段 0: ★`horses` に行を書く箇所すべてが ★この 2 列を書く（★この移行と同じ便・コード側）
--   段 1: ★この移行
--   段 2: ★道具が既存の全頭の `name_key` を埋め、★衝突と null の行が 0 か数える
--   段 3: ★別の移行で `unique (name_key)` と `not null` を張る（★直前に null の行を数えて 0 でなければ投げる）
--
-- ⚠️ ★コードは ★この列が無い DB（★いまの本番）でも落ちないよう、★列が在るときだけ書きます
--   （★0060 の前に配備して週送りを落とした形を繰り返さない）。
-- ---------------------------------------------------------------------------

begin;

alter table horses add column if not exists name_key text;
alter table horses add column if not exists name_checked_with text;

comment on column horses.name_key is
  '★normalizeName(name) の結果（★TS が計算した値）。★段 3 の移行で unique・not null にする（REVIEW_I3_NAMING_VERDICT_20260922.md §3）';
comment on column horses.name_checked_with is
  '★禁止名（実在馬名）の検査に使ったリストの版。★null ＝ 検査していない（★リスト到着後に null の行を全部検査し直す）';

commit;
