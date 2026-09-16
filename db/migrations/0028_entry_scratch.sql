-- 0028: 出走登録の「取消（除外）」を持てるようにする（正典 **D-111** ③）
--
-- ============================================================================
-- 【なぜ要るか】（★裁定 `REVIEW_GAME_BODY_5_VERDICT_20260916.md` §1）
--   ★`enter_race`（`0024`）は `entrant_snapshot` を書きません。★確定側は
--   ★**1 頭でも凍結が無ければレースごと開催中止・全ベット返還**（D-056・`pg-store.ts:379-386`）。
--   → ★**利用者が自分の馬を登録すると、そのレースに投票した他の客の馬券まで全額返還される**
--     （staging cycle 5682 で実測）。
--
-- 【この移行がすること】★**列を 2 つ足すだけ**です（RPC は再定義しません）。
--   ① `race_entries.scratched_at`   … 取消の時刻（null ＝ 出走する）
--   ② `race_entries.scratch_reason` … 取消の理由（★利用者に出す。黙って消さない・D-111 ⑤）
--
-- 【★D-111 の形（この移行の後に入る経路）】
--   ①`enter_race` は ★**受付まで**（枠・料金・★凍結待ちの行）。★この移行の後も変わりません
--   ②★**凍結はワーカーが、レース生成と同じ関数で書く**（出どころを 1 か所に保つ・D-052・R-30）
--   ③★**発走前に凍結の無い馬が残っていたら、その馬だけを取消**にし、★レースは止めない
--     → §9.1 の「取消・除外馬を含む馬券は全額返還（EP）」に載せる（実装済み `payout.ts`・`settle.ts`）
--   ④**D-056 は最後の安全網として残す**（この移行は何も外しません）
--   ⑤取消の理由を出し、★**登録料と騎手の料金を返す**（`ep_ledger` の `refund`。★新しい語は要りません）
--
-- ⚠️ ★**この移行だけでは直りません。** ★②③の経路（ワーカー）と合わせて初めて閉じます。
-- ============================================================================
begin;

alter table race_entries
  add column if not exists scratched_at timestamptz,
  add column if not exists scratch_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'race_entries_scratch_all_or_none') then
    -- ★理由の無い取消を作らない（★黙って消さないための担保・D-111 ⑤）
    alter table race_entries add constraint race_entries_scratch_all_or_none
      check ((scratched_at is null) = (scratch_reason is null));
  end if;
end $$;

comment on column race_entries.scratched_at is
  '★取消（除外）の時刻。null なら出走する（D-111 ③）。★発走前に凍結（entrant_snapshot）が無い馬をここで落とし、レースは止めない。§9.1 の返還の経路に載る。';
comment on column race_entries.scratch_reason is
  '★取消の理由（利用者に出す・D-111 ⑤）。★理由の無い取消は CHECK で作れない。';

-- ★確定・発走前の走査が「取消でない行」を引くための索引
create index if not exists race_entries_active_idx
  on race_entries (race_id) where scratched_at is null;

commit;
