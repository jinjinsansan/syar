-- 0015: 開放率の分布を毎日記録する（P3・レビュー側裁定 2026-08-12）
--
-- 【なぜ要るか】
--   > ★開放率は「**動き続ける入力**」です。今日 71.3% でも来月は違います。
--   > 世界が成熟すればキャリア中盤の馬の比率が変わり、運用中ずっと動きます。
--   > つまり **P1 のゲートは、動く入力の上に立っています**。
--   > → 開放率の分布を継続的に記録し、**測定時からずれたらゲートを測り直す**運用に。
--
--   ★「一度通れば終わり」ではないゲートの最初の例です。
--
-- 【★平均だけでは足りません】
--   Q-P3-39 の裁定は「平均の近さで判定しない」でした。
--   分布の形が変わったことを見たいので、**四分位も残します**。
--   平均が同じでも、上下に割れていれば別の世界です。
begin;

create table if not exists unlock_daily (
  date date primary key,
  -- 対象頭数（出走しうる馬）
  horses int not null,
  mean numeric(6,5) not null,
  sd numeric(6,5) not null,
  p10 numeric(6,5) not null,
  p50 numeric(6,5) not null,
  p90 numeric(6,5) not null,
  -- ★週齢の分布も残す。開放率が動く理由の大半は「馬が何歳か」なので
  age_mean numeric(7,2) not null,
  created_at timestamptz not null default now()
);

comment on table unlock_daily is
  '★開放率（stats ÷ potential）の日次分布。P1 のゲート（V-4/V-5/V-6）は この分布の上に立っているので、測定時からずれたらゲートを測り直す（レビュー側裁定 2026-08-12）';
comment on column unlock_daily.p10 is
  '★平均だけでは分布の形が変わったことを見られない。平均が同じでも上下に割れていれば別の世界';

commit;
