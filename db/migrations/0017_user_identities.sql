-- 0017: 外部 ID（LINE ほか）と口座の対応 — D-078 / V-19 #5・#6・#10
--
-- 【なぜ users に列を足さないか（D-078）】
--   `users.line_sub` にすると、Apple 併設が来たときに**同じ形の改修をもう一度やる**。
--   iOS ではサードパーティのソーシャルログインの専一利用が禁じられており、
--   **第2の手段が要ることは既に分かっている**（裁定 §1）。分かっている変更に対して閉じた形にしない。
--
--   ★`users` は口座であって認証の器ではない。ポイント台帳を持つテーブルに
--   認証の関心を混ぜない（憲法 §0.2-3 が二種ポイントで採ったのと同じ「混同できない構造」の考え方）。
--
-- 【★一意制約を DB 側に置く理由（V-19 #10）】
--   アプリ側の「あるか確認して、無ければ作る」は**同時アクセスで二重に通る**。
--   2つの口座が同じ LINE アカウントに紐づくと、初回付与（D-074）と初期 EP（D-075）が
--   二重に走りうる。**「同一 sub なら1ユーザー」は制約で担保する。**
--
-- 【★subject は sub であって、メールではない（V-19 #6）】
--   LINE のメールは任意項目かつ未検証。メールで突合すると乗っ取り経路になる。
--   `subject` に入れてよいのはプロバイダの `sub` だけ。
--
-- 【LINE の sub の性質（公式ドキュメントで確認済み・2026-08-20）】
--   ユーザー ID は**プロバイダー単位で一意**で、同一プロバイダー配下ならチャネルが違っても同じ値。
--   別プロバイダーでは別の値になる。→ **Web とアプリのチャネルは同一プロバイダー配下に置くこと**（D-076）。
--   形式は U[0-9a-f]{32}。ただし**形式の検査はここでは課さない**
--   （プロバイダが増えると形式が変わる。形式で弾く必要があるなら検証側の責務）。
begin;

create table if not exists user_identities (
  -- 'line' | 'apple' | ... ★プロバイダを増やせる形にしておく（D-078）
  provider text not null,
  -- ★プロバイダ側の sub。**メールを入れてはいけない**
  subject text not null,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- ★V-19 #10: 「同一 sub なら1ユーザー」の担保。アプリ側の確認だけにしない
  primary key (provider, subject),

  constraint provider_not_empty check (length(provider) > 0),
  constraint subject_not_empty check (length(subject) > 0)
);

-- 1人の利用者が同一プロバイダで2つの ID を持たない
-- （持てると、片方を消して「別人」として初回付与を受け直せる）
create unique index if not exists user_identities_user_provider_uniq
  on user_identities (user_id, provider);

-- ============================================================================
-- RLS: ★クライアントからは一切触らせない
--   ここは「どの LINE アカウントがどの口座か」の対応表であり、
--   利用者本人にも他人にも見せる理由がない。読み取りビューも作らない。
--   セットアップ RPC（security definer）とセッション発行の Edge Function だけが触る。
-- ============================================================================
alter table user_identities enable row level security;
revoke all on user_identities from anon, authenticated;
-- ポリシーを1つも作らない = RLS 有効下では anon/authenticated からは常に0行。
-- （service_role と security definer 関数は RLS を迂回する）

commit;
