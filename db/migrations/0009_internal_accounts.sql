-- STAR 0009 — 内部口座の区分と、§11.2 の別掲（正典 §4.6・§11.2）
--
-- 【★なぜ「除外」ではなく「別掲」なのか】
--   検証用の合成ベッター（認証が入るまで実ユーザーがいないため必要）の流量が
--   `point_flow_daily` に混ざると、**§11.2 が測っているものが実在しなくなります**。
--   「0 で PASS」と同じ問題で、数字は出るのに中身が別物になります。
--
--   ★かといって黙って落とすと、**口座に印を付けるだけで流量を隠せてしまいます。**
--     運営が自分の取引を監視から消せる構造は作りません。
--   → **実経済の指標からは分けるが、消しはしない。両方を出します。**
--
--   これは検証都合ではなく**本番の概念**です。どの運営にも内部口座はあり、
--   実経済の指標とは分けて扱いますが、帳簿からは消しません。
--
-- 【既存行の意味について】
--   これまで内部口座は存在しなかったので、既存の2行は**そのまま「内部を除いた値」**です。
--   遡って意味が変わることはありません。

begin;

-- ★口座の区分。既定は 'player'（＝これまでどおり）
alter table users add column if not exists account_type text not null default 'player';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_type_allowed'
  ) then
    -- ★増やすときは必ずここに書く。未知の値が入ると、集計から静かに漏れる
    alter table users add constraint users_account_type_allowed
      check (account_type in ('player', 'internal'));
  end if;
end $$;

create index if not exists users_account_type_idx on users (account_type);

-- ★内部口座ぶんを別掲する。既存の列は「内部を除いた値」になる
alter table point_flow_daily add column if not exists ep_inflow_internal bigint;
alter table point_flow_daily add column if not exists ep_burned_internal bigint;
alter table point_flow_daily add column if not exists pp_issued_internal bigint;
alter table point_flow_daily add column if not exists pp_exchanged_internal bigint;
alter table point_flow_daily add column if not exists margin_actual_internal numeric(6,4);

comment on column users.account_type is
  '口座の区分。player=実利用者 / internal=運営の内部口座（検証用の合成ベッター等）。★point_flow_daily では内部を別掲する（消さない）';
comment on column point_flow_daily.ep_inflow is
  '★内部口座を除いた値。内部口座ぶんは ep_inflow_internal に別掲する';

commit;
