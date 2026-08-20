-- 0018: anon / authenticated の権限を「既定で閉じる」形に直す（レビュー側裁定 2026-08-20・V-20）
--
-- ============================================================================
-- 【何が起きていたか】
--   Supabase の既定は `grant all on all tables in schema public to anon, authenticated` です。
--   `0002` は **必要なものだけを個別に revoke** する形だったため、
--   **後から足したテーブルには何の守りも付きませんでした。**
--
--   実測（2026-08-20・staging と本番でほぼ同一）:
--     ・**`users` に anon の INSERT / UPDATE / DELETE が付いていた**
--       → 誰でも任意の利用者の `entry_points` / `prize_points` を書き換えられる状態
--       → ★憲法 §0.2-4（サーバー権威）が破れている。しかも **V-11 には映らない** —
--         直接 UPDATE は台帳を1行も動かさないので、残高だけ増えて流量はゼロのまま通る
--     ・`npc_stables` も書けた → `distance_bias` 等は**レース生成の入力**。
--       ★シードのコミット/リビールは「乱数が後出しでない」ことしか証明せず、
--         **入力の改竄は §8.6 の証明範囲外**
--     ・**★`ep_ledger` / `pp_ledger` に anon の `TRUNCATE` が付いていた**
--       `0002` は `insert, update, delete` だけを revoke しており、**TRUNCATE が残っていた**。
--       **TRUNCATE は RLS の対象外**なので、ポリシーがあっても止まらない。
--       → **公開鍵でポイント台帳を全消しできる状態だった**
--
-- 【なぜ「個別に閉じる」をやめるか】
--   ★個別に閉じる形は、**新しいテーブルを足すたびに開く**。
--     `0017` に RLS が入ったのはレビュー側が要求したからで、構造が要求したからではない。
--   → **既定を「無い」にして、必要なものだけ足す。**
--     併せて `alter default privileges` で**将来のテーブルにも付かない**ようにする。
--   → 走査型のゲート **V-20** が、登録簿に無いテーブルが現れたら落とす。
--
-- 【安全性の確認（当てる前に実施）】
--   ・Web が anon で読むのは `races_public` / `race_entries_public` / `race_odds_public` の3つだけ
--     （`grep "\.from('" apps/web/src` で全数確認）。いずれも下で grant select を戻す
--   ・ワーカーと `migrate.mjs` は `DATABASE_URL`（postgres）直結。**anon/authenticated の権限を使わない**
--   ・`place_bet` 等の RPC は `security definer`。**関数の権限はテーブル権限と別**なので影響を受けない
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- ① 既定を閉じる — public スキーマの全テーブル／ビューから、まとめて剥奪する
--    ★TRUNCATE / REFERENCES / TRIGGER も含めて落とす（`all` はこれらを含む）
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ② ★将来のテーブルにも付かないようにする
--    これが無いと、次のマイグレーションで作ったテーブルが再び全権限付きで生まれる
--    （＝今回の穴が構造的に再発する）
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ③ 必要なものだけ足す — 公開ビューの select のみ（§14.3「読み取りはビュー経由に一本化」）
--    ★実体テーブルには一切 grant しない
-- ---------------------------------------------------------------------------
grant select on races_public        to anon, authenticated;
grant select on race_entries_public to anon, authenticated;
grant select on race_odds_public    to anon, authenticated;
grant select on prize_catalog_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ④ users — ★revoke all にはしない（S-2 と同型の事故を避ける）
--
--    S-2: `ep_ledger` を `revoke all` にしたため、「自分の行だけ見える」ポリシーが
--         打ち消され、**利用者が自分のポイント履歴を永久に見られない**状態だった。
--         revoke が勝つので、ポリシーを足しても意味がない。
--
--    → **select だけ grant し、RLS のポリシーで「自分の行だけ」に絞る。**
--      ★insert / update / delete は anon にも authenticated にも付与しない。
--        残高は `security definer` の RPC 経由でのみ動き、必ず台帳に記帳される（§4.1）
-- ---------------------------------------------------------------------------
alter table users enable row level security;
drop policy if exists users_own on users;
create policy users_own on users for select using (id = auth.uid());
grant select on users to authenticated;

-- ⚠️ 将来「出走表に馬主名を出したい」となったとき、**このテーブルに公開ポリシーを足さないこと。**
--    `users_public`（display_name / stable_name のみ）を**別の公開ビュー**として作る
--    （`races_public` と同じ形）。★残高を持つテーブルに公開ポリシーを足すと、
--    列の見落としがそのまま残高の露出になる。

-- ---------------------------------------------------------------------------
-- ⑤ 本人スコープの台帳類 — ポリシーは 0002 で既にある。select だけ戻す
--    ★anon には戻さない（ログインしていない者が読む理由がない）
-- ---------------------------------------------------------------------------
grant select on bets            to authenticated;
grant select on ep_ledger       to authenticated;
grant select on pp_ledger       to authenticated;
grant select on prize_exchanges to authenticated;

-- ---------------------------------------------------------------------------
-- ⑥ 実体テーブルの RLS をすべて有効にする
--    ★③で grant していないので既に読めないが、**二重に持つ**。
--      grant を1つ間違えたときに、RLS が最後の砦になる
--      （逆に RLS だけだと TRUNCATE が素通りする。**両方要る**のが今回の教訓）
-- ---------------------------------------------------------------------------
alter table app_environment  enable row level security;
alter table users            enable row level security;
alter table horses           enable row level security;
alter table npc_stables      enable row level security;
alter table race_odds        enable row level security;
alter table point_flow_daily enable row level security;
alter table schema_migrations enable row level security;
alter table horse_week_log   enable row level security;
alter table unlock_daily     enable row level security;

commit;
