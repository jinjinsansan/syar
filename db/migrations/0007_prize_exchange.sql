-- STAR 0007 — 景品交換（正典 §11.3・§4.7）
--
-- 【★構造は固定・カタログは運用（§11.3）】
--   P-1 現金・暗号資産への交換経路を作らない（S-3）
--   P-2 ユーザー間の譲渡・売買を作らない（S-4）
--   P-3 PP→EP の還流を作らない（S-5・D3）
--   P-4 交換は不可逆。交換後の取り消し・払い戻しをしない
--   P-5 交換履歴を全件記録する（景表法上の説明責任と RMT 検知）
--
-- ⚠️ **カタログの中身（品目・原資）は D2 のオーナー未決事項**なので、
--    ここでは構造だけを作り、品目は入れません（発明しない）。

begin;

create table if not exists prize_catalog (
  id bigserial primary key,
  name text not null,
  -- 交換に必要な PP
  cost_pp bigint not null,
  -- ★在庫。在庫切れは交換画面に出さない（選ばせてから断らない・§11.3）
  stock int not null default 0,
  -- 掲載中か（在庫があっても停止できる）
  active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prize_cost_positive check (cost_pp > 0),
  constraint prize_stock_non_negative check (stock >= 0),
  -- ★P-1: 現金・暗号資産を想起させる品目を構造で弾く。
  --   「発明しない」ためカタログは空だが、**入れられない**ようにしておく。
  constraint prize_no_cash check (
    name !~* '(現金|キャッシュ|cash|振込|送金|bitcoin|btc|eth|暗号資産|仮想通貨)'
  )
);

create table if not exists prize_exchanges (
  id bigserial primary key,
  user_id uuid not null references users (id),
  prize_id bigint not null references prize_catalog (id),
  cost_pp bigint not null,
  -- ★P-5: 全件記録。景表法上の説明責任と RMT 検知の両方に要る
  created_at timestamptz not null default now(),
  -- 発送・引き渡しの状態（運用が更新する）
  status text not null default 'requested',
  constraint exchange_status_known check (status in ('requested', 'fulfilled', 'cancelled')),
  constraint exchange_cost_positive check (cost_pp > 0)
);
create index if not exists prize_exchanges_user_idx on prize_exchanges (user_id, created_at desc);

alter table prize_catalog enable row level security;
alter table prize_exchanges enable row level security;

-- ★在庫切れ・停止中の景品は**そもそも見えない**（選ばせてから断らない）
create or replace view prize_catalog_public as
select id, name, cost_pp from prize_catalog where active and stock > 0;
grant select on prize_catalog_public to anon, authenticated;
revoke all on prize_catalog from anon, authenticated;

-- 交換履歴は本人のものだけ
create policy prize_exchanges_own on prize_exchanges for select using (user_id = auth.uid());
revoke insert, update, delete on prize_exchanges from anon, authenticated;

commit;
