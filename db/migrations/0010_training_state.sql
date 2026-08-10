-- 0010: 育成状態の永続化（正典 §7.1〜§7.6 / P3 の B-1・G-6・G-7）
--
-- 【★列を「発明」していません】
--   `packages/training/src/week.ts` の `TrainingState` と**1対1**に対応させます。
--   合成器が持ち越さないものは列にしません（列があると、いつか誰かが埋めます）。
--
-- 【★週齢を列に持たない理由】
--   `age_weeks` を直接持つと、週送りが1回抜けた馬が**そのぶん永久に若いまま**になります。
--   `birth_week`（誕生した絶対週）と `last_processed_week`（どこまで進めたか）を持ち、
--   **週齢は引き算で出します**。P2 の `cycle_index` と同じ形で、
--   「何回動いたか」ではなく「どこまで進んだか」を権威にします。
--
-- 【★retirement は3列に分ける】
--   jsonb 1列にすると「引退したか」の索引が張れず、
--   毎週の走査が全馬の jsonb を読むことになります。

begin;

alter table horses add column if not exists birth_week bigint;
alter table horses add column if not exists last_processed_week bigint;
alter table horses add column if not exists fatigue numeric(5,2) not null default 0;
-- ★§7.4 の中央値。0 を既定にすると生まれた瞬間が絶不調になります
alter table horses add column if not exists condition smallint not null default 3;
-- ★休養明けの絶対週。休養していないなら null（-1 という番兵を DB に持ち込まない）
alter table horses add column if not exists rest_until_week bigint;
alter table horses add column if not exists career_ended boolean not null default false;
alter table horses add column if not exists retired_at_week bigint;
alter table horses add column if not exists retirement_role text;
alter table horses add column if not exists retirement_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'horses_condition_range') then
    alter table horses add constraint horses_condition_range
      check (condition between 0 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'horses_fatigue_range') then
    alter table horses add constraint horses_fatigue_range
      check (fatigue between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'horses_retirement_role_known') then
    alter table horses add constraint horses_retirement_role_known
      check (retirement_role is null or retirement_role in ('stallion', 'broodmare', 'honored'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'horses_retirement_reason_known') then
    alter table horses add constraint horses_retirement_reason_known
      check (retirement_reason is null or retirement_reason in ('age', 'career_ending_injury'));
  end if;
  -- ★引退の3列は「全部 null」か「全部埋まっている」のどちらか。
  --   片方だけ埋まった行は、あとから見て理由が分からなくなります
  if not exists (select 1 from pg_constraint where conname = 'horses_retirement_all_or_none') then
    alter table horses add constraint horses_retirement_all_or_none check (
      (retired_at_week is null and retirement_role is null and retirement_reason is null)
      or (retired_at_week is not null and retirement_role is not null and retirement_reason is not null)
    );
  end if;
  -- ★致命的故障で引退した馬は、理由が career_ending_injury でなければならない
  if not exists (select 1 from pg_constraint where conname = 'horses_career_ended_reason') then
    alter table horses add constraint horses_career_ended_reason check (
      career_ended = false or retirement_reason is null
      or retirement_reason = 'career_ending_injury'
    );
  end if;
  -- ★進めていない週を進めたことにしない
  if not exists (select 1 from pg_constraint where conname = 'horses_processed_after_birth') then
    alter table horses add constraint horses_processed_after_birth check (
      birth_week is null or last_processed_week is null or last_processed_week >= birth_week
    );
  end if;
end $$;

-- ★毎週の走査は「まだ引退していない馬」だけを見る。全馬走査にしない
create index if not exists horses_active_idx
  on horses (last_processed_week)
  where retired_at_week is null;

comment on column horses.birth_week is
  '誕生した絶対週（§7.1）。★週齢は last_processed_week - birth_week で出す（age_weeks 列を持たない）';
comment on column horses.last_processed_week is
  'どこまで週送りを適用したか。★「何回動いたか」ではなく「どこまで進んだか」が権威';
comment on column horses.rest_until_week is
  '休養明けの絶対週（§7.5）。休養していないなら null';
comment on column horses.career_ended is
  '致命的故障を負ったか（§7.5）。★馬は死なない。繁殖入りは可能';

-- ────────────────────────────────────────────────────────────
-- 週ごとの記録（★B-1 が要求する「各週の状態遷移」）
--
-- 【★なぜ表に残すか】
--   指示書:「B-1 は『通せた』だけでなく、**各週で何が起きたかを記録**してください」
--   1頭の一生は182週あり、**途中の1ステップが静かに効かなくなっても最後まで通ります**。
--   通ったことを PASS にしないために、週ごとの記録そのものを証拠にします。
--
-- 【★これは検証用の記録です】
--   本番で全馬×182週を残すと、1万頭で182万行になります。運用方針は照会中（Q-P3-21）。
-- ────────────────────────────────────────────────────────────
create table if not exists horse_week_log (
  horse_id uuid not null references horses (id) on delete cascade,
  -- 絶対週（birth_week からの相対ではない。レースや台帳と突き合わせるため）
  week bigint not null,
  age_weeks int not null,
  stage text not null,
  menu text not null,
  ep_spent int not null,
  resting boolean not null,
  injury_prob numeric(10,8) not null,
  -- 故障しなかった週は null（空オブジェクトにしない。「無い」と「空」は違う）
  injury jsonb,
  event jsonb,
  gain jsonb not null,
  fatigue numeric(5,2) not null,
  condition smallint not null,
  retired jsonb,
  primary key (horse_id, week),
  constraint horse_week_log_stage_known
    check (stage in ('growing', 'trainable', 'racing', 'retired'))
);

comment on table horse_week_log is
  '★B-1 の証拠。1頭の1週ぶんに何が起きたか。「通った」ではなく「各週で何が効いたか」を残す';

commit;
