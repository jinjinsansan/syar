-- STAR スキーマ 0001 — 正典 §4
--
-- ⚠️ **このファイルはまだ適用していません。**インフラの認証情報を受け取っていないため、
--    外部接続は一切行っていません（QUESTIONS_P2 Q-2）。レビュー用のコードとして置きます。
--
-- 【この SQL が「書いてあるとおり」以上にやっていること】
--   正典 §4.1 は「EP→PP の一方通行を **DB レベルで担保する**」と書いていますが、
--   コメントで「reason に変換を表す値を作らない」と書くだけでは担保になりません
--   （次に書く人が値を足せてしまう）。**CHECK 制約で列挙**して、
--   構造として足せないようにします。これが憲法 §0.2-3 / 構造 S-5 の実装です。

begin;

-- ============================================================================
-- §14.6 環境ガード（A-7: staging ワーカーが production DB に繋がると起動失敗する）
-- ============================================================================
-- ★ワーカー側で「自分がどの環境のつもりか」と突き合わせる。
--   接続文字列の取り違えは**必ず起きる**前提で、DB 側に真実を置く。
create table if not exists app_environment (
  -- 1行しか存在してはいけない。複数行あると「どちらが本当か」が決まらない
  singleton boolean primary key default true,
  environment text not null,
  constraint app_environment_singleton check (singleton),
  constraint app_environment_known check (environment in ('production', 'staging', 'development'))
);

-- ============================================================================
-- §4.1 ユーザーと二種ポイント
-- ============================================================================
create table if not exists users (
  id uuid primary key references auth.users (id),
  display_name text not null,
  stable_name text not null,
  -- ★EP: 遊ぶ燃料（購入不可・換金不可・譲渡不可）
  entry_points bigint not null default 0,
  -- ★PP: 賞金（景品交換可・現金化不可・譲渡不可）
  prize_points bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint ep_non_negative check (entry_points >= 0),
  constraint pp_non_negative check (prize_points >= 0)
);

-- ★二種ポイントは別カラム・別台帳（憲法 §0.2-3）。
--   1つのテーブルに種別フラグを持たせる形にしない — **混同できない構造にすることが分離の担保**。

create table if not exists ep_ledger (
  id bigserial primary key,
  user_id uuid not null references users (id),
  delta bigint not null,
  balance_after bigint not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  -- ★憲法 §0.2-3: 許される理由をここで**閉じる**。
  --   `prize_exchange` や `from_pp` を後から足そうとすると、この制約に当たって落ちる。
  --   ⚠️ ここに PP からの変換を表す値を**足さないこと**（弁護士ゲート D3 まで不可）。
  constraint ep_ledger_reason_allowed check (
    reason in ('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee')
  ),
  -- 残高は非負（§4.1 の users 側 CHECK と二重に持つ。台帳だけ見ても破れが分かるように）
  constraint ep_ledger_balance_non_negative check (balance_after >= 0)
);
create index if not exists ep_ledger_user_time_idx on ep_ledger (user_id, created_at desc);

create table if not exists pp_ledger (
  id bigserial primary key,
  user_id uuid not null references users (id),
  delta bigint not null,
  balance_after bigint not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  -- ★憲法 §0.2-3 / 構造 S-5: **EP からの変換を表す値を作らない。**
  --   `from_ep` / `convert` / `topup` の類はここに存在してはならない。
  constraint pp_ledger_reason_allowed check (
    reason in ('prize', 'payout', 'prize_exchange')
  ),
  constraint pp_ledger_balance_non_negative check (balance_after >= 0)
);
create index if not exists pp_ledger_user_time_idx on pp_ledger (user_id, created_at desc);

-- ============================================================================
-- §4.8 NPC 世界（P1.5 で実装済みの 40厩舎・冠名）
-- ============================================================================
create table if not exists npc_stables (
  id int primary key,
  -- ★冠名。憲法 §0.1: 実在の牧場名・冠名を使わない（P1.5 ですべて造語）
  prefix text not null unique,
  distance_bias text not null,
  surface_bias text not null,
  growth_bias text not null,
  heavy boolean not null default false,
  emphasis text,
  constraint npc_distance_known check (distance_bias in ('sprint', 'mile', 'middle', 'stayer')),
  constraint npc_surface_known check (surface_bias in ('turf', 'dirt', 'both')),
  constraint npc_growth_known check (growth_bias in ('early', 'normal', 'late')),
  constraint npc_emphasis_known check (emphasis is null or emphasis in ('sp', 'st', 'pw', 'gt', 'iq'))
);

-- ============================================================================
-- §4.2 馬
-- ============================================================================
create table if not exists horses (
  id uuid primary key default gen_random_uuid(),
  -- null = NPC（§4.2）。所有者と NPC 厩舎はどちらか一方
  owner_id uuid references users (id),
  npc_stable_id int references npc_stables (id),
  name text not null,
  sex text not null,
  birth_year int not null,
  generation int not null default 0,
  sire_id uuid references horses (id),
  dam_id uuid references horses (id),
  sire_line text not null,
  dam_sire_line text,
  -- 遺伝子型（§5.4）。アプリ側の Genotype をそのまま入れる
  genotype jsonb not null,
  potential jsonb not null,
  stats jsonb not null,
  unlock_rate numeric(4,3) not null,
  surface_aptitude jsonb not null,
  distance_center int not null,
  distance_range int not null,
  strategy_aptitude jsonb not null,
  -- ★D-015 で genotype に入った道悪適性（§5.2/§5.4）
  heavy_aptitude numeric(5,2) not null,
  growth text not null,
  temper numeric(5,2) not null,
  durability numeric(6,2) not null,
  frail boolean not null default false,
  skill_genes jsonb not null default '[]'::jsonb,
  inbreed_coeff numeric(6,5) not null default 0,
  nicks_multiplier numeric(5,4) not null default 1,
  pedigree_cache jsonb not null default '{}'::jsonb,
  foal_count int not null default 0,
  coverings_this_year int not null default 0,
  bred_this_year boolean not null default false,
  g1_wins int not null default 0,
  created_at timestamptz not null default now(),
  constraint horses_sex_known check (sex in ('male', 'female')),
  -- ★プレイヤー馬と NPC 馬は排他。両方 null（浮いた馬）も許さない
  constraint horses_owner_xor_npc check (
    (owner_id is not null and npc_stable_id is null)
    or (owner_id is null and npc_stable_id is not null)
  ),
  -- 自分自身を親にできない（血統の循環でループする）
  constraint horses_not_own_parent check (id <> sire_id and id <> dam_id)
);
create index if not exists horses_owner_idx on horses (owner_id);
create index if not exists horses_sire_line_idx on horses (sire_line);

-- ============================================================================
-- §4.4 レースと Provably Fair
-- ============================================================================
create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  -- ★架空名のみ（憲法 §0.1）
  name text not null,
  grade text,
  -- ★同格帯（D-018）。無作為抽選にすると1番人気の勝率が51%になり V-4 が壊れる
  class_rank smallint not null,
  surface text not null,
  distance int not null,
  -- ★4段（D-015）
  track_condition text not null,
  course_id text not null,
  scheduled_at timestamptz not null,
  -- ★発走前に公開（§8.6）
  seed_commit text not null,
  -- ★確定後にのみ公開。RLS で status='scheduled' の行から露出させない
  seed_reveal text,
  status text not null default 'scheduled',
  purse bigint not null,
  created_at timestamptz not null default now(),
  constraint races_surface_known check (surface in ('turf', 'dirt')),
  constraint races_condition_known check (track_condition in ('good', 'yielding', 'soft', 'bad')),
  constraint races_status_known check (status in ('scheduled', 'closed', 'settled', 'cancelled')),
  -- ★確定前に seed_reveal が入っていてはいけない（漏れたら Provably Fair が無意味になる）
  constraint races_reveal_only_after_close check (
    seed_reveal is null or status in ('settled', 'cancelled')
  )
);
create index if not exists races_schedule_idx on races (scheduled_at, status);

create table if not exists race_entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id),
  horse_id uuid not null references horses (id),
  gate int not null,
  weight numeric(4,1) not null,
  strategy text not null,
  odds numeric(9,1),
  -- モンテカルロ勝率順位（§9.2）
  popularity int,
  finish_pos int,
  finish_time numeric(7,3),
  margin text,
  -- ★§8.8 の一次資料。seed_reveal + これで着順を再計算できること。
  --   判定は**サーバー受信時刻のみ**を使う（クライアント申告は詐称で有利になる）
  intervention_log jsonb,
  -- 適用後の値（0.90〜1.10・§8b）
  intervention_mult numeric(5,4),
  -- ★範囲外入力の記録。黙って直さない（O-3）
  cap_violations jsonb,
  unique (race_id, horse_id),
  constraint entries_strategy_known check (strategy in ('nige', 'senko', 'sashi', 'oikomi')),
  -- ★憲法の ±10% キャップ（§8b.3）を DB 側でも閉じる。
  --   アプリのバグで範囲外が入っても台帳に残らない
  constraint entries_mult_capped check (
    intervention_mult is null or (intervention_mult >= 0.90 and intervention_mult <= 1.10)
  )
);

-- ============================================================================
-- §4.5 馬券
-- ============================================================================
create table if not exists bets (
  id bigserial primary key,
  user_id uuid not null references users (id),
  race_id uuid not null references races (id),
  bet_type text not null,
  selection jsonb not null,
  -- ★EP で支払う
  amount int not null,
  -- ★購入時に固定（後からオッズ式を直しても配当は変わらない・§9.2）
  odds_at_purchase numeric(9,1) not null,
  status text not null default 'pending',
  -- ★PP で払い戻す
  payout bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint bets_type_known check (
    bet_type in ('win', 'place', 'wide', 'quinella', 'exacta', 'trio', 'trifecta')
  ),
  constraint bets_status_known check (status in ('pending', 'won', 'lost', 'refunded')),
  -- §9.1 最小単位 100 EP / §9.4 1点あたり上限 10,000 EP
  constraint bets_amount_range check (amount >= 100 and amount <= 10000 and amount % 100 = 0),
  constraint bets_payout_non_negative check (payout >= 0),
  -- ★未確定の馬券に払戻額が入っていてはいけない（二重払戻の足跡はここに出る）
  constraint bets_payout_only_when_won check (payout = 0 or status = 'won')
);
create index if not exists bets_race_status_idx on bets (race_id, status);
create index if not exists bets_user_time_idx on bets (user_id, created_at desc);

create table if not exists race_odds (
  race_id uuid not null references races (id),
  bet_type text not null,
  selection jsonb not null,
  -- モンテカルロ実測（§9.2）
  probability numeric(9,8) not null,
  odds numeric(9,1) not null,
  capped boolean not null default false,
  primary key (race_id, bet_type, selection),
  constraint race_odds_probability_range check (probability > 0 and probability <= 1),
  constraint race_odds_positive check (odds > 0)
);

-- ============================================================================
-- §4.6 監視（運営の生命線）
-- ============================================================================
create table if not exists point_flow_daily (
  date date primary key,
  ep_inflow bigint,
  ep_burned bigint,
  pp_issued bigint,
  pp_exchanged bigint,
  margin_actual numeric(6,4),
  -- ★V-9b（§8b.8）
  intervention_mult_mean numeric(6,4),
  created_at timestamptz not null default now()
);

commit;
