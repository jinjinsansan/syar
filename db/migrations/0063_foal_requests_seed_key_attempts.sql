-- ---------------------------------------------------------------------------
-- 0063 配合の要求に「種の鍵」と「試行回数」を足す（★PLAN I-2・2026-09-22）
--
-- 裁定 REVIEW_I2_PLAYER_BREEDING_VERDICT_20260922.md（322d603）§1・§3。
--
-- 【§1 🔴 ★乱数の種を、クライアントが選べない値から作る】
--   ★0061 は仔の ID と種を ★要求 ID（`foal_requests.id`）から作っていました。★要求 ID はクライアントが送る値です。
--   → ★**クライアントが自分の仔の種を選べました**（★親の genotype が漏れた日に、初回の配合で振り直しが成立する）。
--   ★`seed_key` は ★**行を作る瞬間に DB が決め**、★記録されます。★確定の計算は記録から何度でも再現できるので、
--   ★決定論（憲法 §1-4）は保たれます。★受付の RPC は `seed_key` を受け取る引数を持ちません（★検査で釘付け）。
--   ⚠️ ★冪等キー（第 1 段）は ★要求 ID のまま（★再送を束ねる値で、★種ではない）。
--
-- 【§3 🔴 ★必ず落ちる要求を、先頭に居座らせない】
--   ★`breed()` の後で落ちた要求は、★取引を戻して「待ち」のまま次の周にやり直します（★結果を見てから失敗にしない）。
--   ★しかし ★毎回同じ理由で落ちる要求は ★永久にやり直され、★古い順に拾うので ★後ろの要求を止めます。
--   → ★`attempts` を数え、★続けて K 回 落ちたら ★`failed`・理由 `internal_error` にします（★ワーカー側）。
--   ★拾う順は ★試行回数の少ない順を先にします。
-- ---------------------------------------------------------------------------

begin;

alter table foal_requests
  add column if not exists seed_key uuid not null default gen_random_uuid();

alter table foal_requests
  add column if not exists attempts int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'foal_requests_attempts_non_negative') then
    alter table foal_requests add constraint foal_requests_attempts_non_negative check (attempts >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foal_requests_seed_key_unique') then
    alter table foal_requests add constraint foal_requests_seed_key_unique unique (seed_key);
  end if;
end $$;

-- ★ワーカーが拾う順（★試行回数の少ない順 → 古い順）
drop index if exists foal_requests_pending_idx;
create index if not exists foal_requests_pending_idx
  on foal_requests (attempts, created_at, id) where status = 'pending';

commit;
