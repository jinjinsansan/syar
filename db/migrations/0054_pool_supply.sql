-- 0054: 定常運転の供給（POOL-SUPPLY）— ニックス表と、二重出産の最後の砦
--
-- ============================================================================
-- 【★なぜ要るか】
--   🔴 ★製品コードに `insert into horses` が 1 件もありません。
--     ★引退だけが動き、★**生まれません**。
--   ✔ ★実測（2026-09-20・本番・世界を作り直した直後）:
--       ★作り直し直後 現役 2,400 頭 → ★週送り 1 回で ★**2,379 頭**（★1 週で 15 頭 引退）
--       ★1 日 = 6 週 = 約 90 頭／日 → ★このままなら ★**約 26 日で現役が尽きます**
--     ⚠️ ★これは外挿です（★1 週ぶん・★引退は年齢分布に依る）。★向きだけが確かです。
--
-- 【★この移行が足すもの】
--   ① ★`nicks` … ★配合の相性表（★正典 §6.6）。★**プリシードが使った表を転記**します
--   ② ★`horses` の一意制約 … ★**同じ母・同じ週に 2 頭 生まれない**（★冪等の最後の砦）
--
-- 【⚠️ ★当てる前に測ったこと】
--   ✔ ★本番の `(dam_id, birth_week)` の重複 … ★**0 件**（★2026-09-20・読むだけ）
--     → ★既存の行が制約に引っかかりません。★当てても落ちません。
-- ============================================================================
begin;

-- ── ① 配合の相性表（★§6.6） ───────────────────────────────
--
-- 【★なぜ DB に置くか】
--   ★§6.6 は「★運営が編集可能」と書いています。★コードに焼くと編集できません。
-- 【🔴 ★なぜ空で始めないか】
--   ★`getNicksMultiplier` は表に無ければ 1 を返すので、★空でも動きます
--   （★`packages/sim-engine/src/nicks.ts:23`・★実測で確認）。
--   ⚠️ ★しかし ★**プリシードは 50 世代を「表が在る前提」で配合しています。**
--     ★空で始めると、★**世界の「過去」には相性が在り、「未来」には無い**ことになります。
--   → ★**プリシードが使った表を、そのまま初期値として入れます**（★発明ではなく転記）。
-- 【🔴 ★種を一緒に記録する理由】
--   ★表は `preseedNicks(SEED, NPC_STABLES)` が種から作ります。
--   ★★**どの種から出た表かが分からなくなると、★二度と同じ表を作れません。**
create table if not exists nicks (
  -- ★父系ライン（★`horses.sire_line`）
  sire_line text not null,
  -- ★母の父系ライン（★`horses.dam_sire_line`）
  dam_sire_line text not null,
  -- ★倍率（★§6.6 の帯 1.00〜1.15）
  multiplier numeric(5,4) not null,
  -- 🔴 ★この行を作った種（★再現できること・憲法 §1-4）
  source_seed bigint not null,
  updated_at timestamptz not null default now(),
  primary key (sire_line, dam_sire_line),
  constraint nicks_multiplier_band check (multiplier >= 1.0 and multiplier <= 1.15)
);

comment on table nicks is
  '★配合の相性（★正典 §6.6・★2026-09-20 POOL-SUPPLY）。'
  '★初期値は★プリシードが使った表の転記で、★`source_seed` にその種を残す。'
  '⚠️ ★空でも `getNicksMultiplier` は 1 を返すので動くが、'
  '★★空にすると「過去には相性が在り、未来には無い」世界になる。'
  '★§6.6 のとおり運営が編集してよい（★編集したら `source_seed` は元のまま残す）。';

-- ★クライアントは読まない（★配合の内部・V-20 の登録簿では closed）
revoke all on nicks from anon, authenticated;

-- ── ② 同じ母・同じ週に 2 頭 生まれない ───────────────────────
--
-- 🔴 ★**冪等の最後の砦**です（★アプリ側の判定だけに頼らない）。
--   ★ワーカーは落ちて再起動します（★A-1）。★同じ週を二度 処理しても、
--   ★★**2 頭 生まれてはいけません。**
--   ★`advanceTrainingWeeks` が `last_processed_week` で冪等なのと同じ考えです。
-- ⚠️ ★`dam_id` が null の行（★創始世代）は、★unique の対象外です（★null は重複と見なされない）。
--   ★それで正しい — ★創始馬には母が居ません。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'horses_one_foal_per_dam_per_week'
  ) then
    alter table horses add constraint horses_one_foal_per_dam_per_week
      unique (dam_id, birth_week);
  end if;
end $$;

commit;
