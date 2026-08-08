-- STAR 0005 — server_seed を DB に保存する（正典 §8.6）
--
-- ★なぜ必要か:
--   server_seed をプロセスの秘密から導出していると、**再起動で秘密が変わり**、
--   コミット済みのレースの seed_reveal を後から出せません。
--   commit は公開済みなのに reveal が出せない ＝ **Provably Fair が成立しない**。
--   実際 A-2 の検証で SIGKILL を3回かけており、起こりうる状況です。
--
-- ★保存するが**露出させない**:
--   races_public ビューは seed_reveal しか出さず、server_seed は含めません。
--   実体テーブルへの select は既に revoke 済みなので、外からは読めません。

begin;

alter table races add column if not exists server_seed text;

-- ★確定前に server_seed が漏れると、賭ける側が結果を計算できてしまう。
--   seed_reveal と同じ扱いにはできない（reveal は確定後に公開するが、
--   server_seed は**生成時から保存が必要**）。
--   → 列は持つが、公開経路（races_public）に含めないことで守る。
comment on column races.server_seed is
  '§8.6 の server_seed。★races_public に含めないこと。確定後に seed_reveal として公開する';

commit;
