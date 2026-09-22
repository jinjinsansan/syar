-- ============================================================================
-- 0072 運営が馬名を戻した記録（裁定 REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md P-2・P-3）
--
--   ① horse_name_resets … 誰の馬の名前を、どんな理由で戻したか。書くのは道具（tools/reset-horse-name.mjs）だけ
--   ② horses.name_checked_with の註記を直す（当たりの印 'hit:<版>' を足した・f1a5ebe・裁定 63cfecc §5）
-- ============================================================================
begin;

create table if not exists horse_name_resets (
  id bigserial primary key,
  horse_id uuid not null references horses (id),
  -- 持ち主の居る馬（仮の名前）か、NPC の馬（普通の名前を引き直し）か
  owned boolean not null,
  reason text not null,
  -- 運営の短い書き込み（個人の情報を書かない）
  note text,
  -- 元の名前を正規化した名前のハッシュ（hashNormalizedName）。平文は置かない
  old_name_hash text not null,
  new_name text not null,
  -- 新しい名前を検査した一覧の組の版（一覧が 1 つも無ければ null）
  checked_with text,
  created_at timestamptz not null default now(),
  constraint horse_name_resets_reason_known check (
    reason in ('real_horse', 'offensive', 'person', 'trademark', 'other')
  ),
  constraint horse_name_resets_hash_shape check (old_name_hash ~ '^[0-9a-f]{16}$')
);
create index if not exists horse_name_resets_horse_idx on horse_name_resets (horse_id, created_at);

comment on table horse_name_resets is
  '運営が馬名を戻した記録（0072）。元の名前は平文で置かず、正規化した名前のハッシュだけを残す。'
  '短いカタカナのハッシュは総当たりで元に戻せるので、これは秘密にする仕組みではなく、平文を DB と端末に置かないための仕組み。'
  '読めるのは運営だけ（revoke all）。理由は公開しない（生涯の記録には書かない）。';

alter table horse_name_resets enable row level security;
revoke all on table horse_name_resets from public, anon, authenticated;
revoke all on sequence horse_name_resets_id_seq from public, anon, authenticated;

comment on column horses.name_checked_with is
  'どの一覧の組で馬名を検査したか。null = 検査していない／<版> = 当たらなかった（版は読めた一覧の組・例 real-horse:<16 桁>+offensive-contains:<16 桁>）'
  '／hit:<版> = その組で当たった（名前はまだ変えていない）。0064・f1a5ebe。';

commit;
