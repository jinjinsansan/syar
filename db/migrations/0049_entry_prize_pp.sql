-- 0049: ★1 走あたりの賞金を一次資料にする（★**PR-1**）
--       ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §5
--
-- ============================================================================
-- 【🔴 ★何が無かったか — ★「分けられない」ではなく「存在しない」】
--   ★開発側は「同じレースに自分の馬が 2 頭出ると `pp_ledger` から分けられない」と書きました。
--   🔴 ★**見立てが 1 段浅いものでした。**
--     ✔ ★`pp_ledger.user_id` は ★**`not null`**（`0001:48`）です。
--     ✔ ★`awardPrizes` は ★**`owner_id is null`（NPC 馬）を `continue` で飛ばします**。
--   → ★★**NPC 馬の獲得賞金は、どこにも 1 行も存在しません。**
--
-- 【🔴 ★これが T-11 を塞いでいます】
--   ★**D-102 ③**: ★出品価格は ★**§10.5 の NPC 種牡馬の式**から決める
--     〔`3,000 + G1 勝利数 × 8,000 + 総獲得賞金 / 20`〕
--   ★**D-102 ②**: ★売る馬は ★**NPC 世界から取る**
--   → ★価格式が必要とする「総獲得賞金」は ★**まさに NPC 馬のもの**です。
--   ★**D-107（種付料の目安）も同じ式**で、★**同じ穴の上**に乗っています。
--
-- 【★向きを直します】
--   ★旧: `pp_ledger`（支払いの記録）**だけ**がある → ★NPC の分は存在しない
--   ★新: ★**`race_entries.prize_pp` が一次資料**（★誰の馬かに関わらず、着順から決まる額）
--        → ★`pp_ledger` は ★**そこから導かれる側**（★実際に発行した分だけ・§3.4 の監視はこちらを見る）
--   ⚠️ ★**二重帳簿ではありません。** ★意味が違います:
--        ★`prize_pp`  … ★**そのレースで、その着順に対して発生した賞金**（★NPC にも発生する）
--        ★`pp_ledger` … ★**実際に利用者へ発行した PP**（★NPC には発行しない）
--   ★`0001:10` の註記「実際に発行した分だけを記録します」は ★**そのまま守ります**。
--
-- 【★正は TypeScript】
--   ★額は `prizeFor(tier, 着順)`（`packages/scheduler/src/prize.ts`）が決めます。
--   ★**賞金表を SQL に写しません**（D-052）。★EF-2・ED-1・BT-4 と同じ形です。
--
-- 【⚠️ ★既存の行は null のままです】
--   ★埋め戻すには ★**ここで賞金表を引く**必要があり、★それこそが避けたい「2 つめの導き方」です。
--   ★過去のレースの NPC 賞金が要るなら、★**TypeScript の道具で埋め戻します**（★別便）。
-- ============================================================================

begin;

alter table race_entries add column if not exists prize_pp bigint;

comment on column race_entries.prize_pp is
  '★その走りで着順に対して発生した賞金 [PP]（★PR-1・2026-09-19）。★一次資料。'
  '⚠️ ★NPC 馬（owner_id が null）にも書く — ★D-102 ③ / D-107 の価格式が必要とする「総獲得賞金」はそちら。'
  '⚠️ ★pp_ledger は「実際に利用者へ発行した PP」で、★こちらから導かれる側（★NPC には行が立たない）。'
  '★額は prizeFor() が決める（★賞金表を SQL に写さない・D-052）。'
  '⚠️ ★0049 より前に確定したレースは null（★埋め戻しは TypeScript の道具で・別便）';

-- ★出走前・取消には賞金が発生しない。★確定した走りにだけ入る
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'race_entries_prize_only_when_finished') then
    alter table race_entries add constraint race_entries_prize_only_when_finished
      check (prize_pp is null or finish_pos is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'race_entries_prize_non_negative') then
    alter table race_entries add constraint race_entries_prize_non_negative
      check (prize_pp is null or prize_pp >= 0);
  end if;
end $$;

commit;
