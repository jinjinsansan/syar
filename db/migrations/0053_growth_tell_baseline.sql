-- 0053: ★**「前に言ったときの能力」を持つ**（★**GB-1 ④⑤⑥**・2026-09-19・オーナー決定）
--
-- 【★オーナーが決めたこと】★`OWNER_DECISIONS_20260919.md` C-4
--   > ★**閾値から決めず、「一生で何回 言うか」から決めてください。★私の推しは 20〜30 回**
--   > ★**今 決めるのは「累積で比べるか、週次で比べるか」の 1 行だけ**
--
--   ✔ ★測って決めました（`apps/cli/src/growth-tell-frequency.ts`・150 頭 × 8 シード）:
--     ★幅 8 → 37.6 回（帯に収まる馬 2%）／★**13 → 24.4 回（98%）**／16 → 20.2 回（68%）
--   🔴 ★**週次はどの幅でも 20 回に届きません**（★幅 8 でも 8.8 回・★幅 13 で 1.2 回）。
--     → ★★**「累積か週次か」に選択の余地はありませんでした。**
--
-- 【★この移行が足すもの】
--   ★**累積で比べるには「前に言ったときの `stats`」を憶えておく必要があります。**
--   ★純関数（`growthTellsOf`）は状態を持ちません — ★**持つのは行のほう**です。
--
-- 【🔴 ★**GB-1 ⑤** — ★言ったときにだけ書く】
--   ⚠️ ★**毎週 書いてはいけません。** ★毎週 更新すると ★**累積が週次と同じもの**になります。
--   ✔ ★検査で示してあります（`growth-tell-frequency.test.ts`）:
--     ★毎週 +5 ずつ伸びる馬は、★**週次 0 回 ／ 累積 10 回**。★基準を毎週 動かすと 0 回になります。
--
-- 【🔴 ★**GB-1 ⑥** — ★初回の基準】★**「その馬が持ち主のものになった時点の `stats`」**
--   ⚠️ ★**ここは決めごとです**（★正典にありません。★GR-1 の刻みと同じ扱い）。
--   ★理由: ★「前より」の起点が、★**持ち主から見た起点と一致します**
--     （★NPC だった頃の伸びを「あなたの馬が伸びた」とは言いません）。
--   ★`null` のままにすると ★**初回に全部 言うか、一度も言わないか**のどちらかになります。
--
--   ★**誰が入れるか**: ★**ワーカー**です（★週送りの中で、★`null` の馬に現在値を入れる）。
--   🔴 ★`buy_horse`・`setup_account`・`create_account_picks_horse` の **3 か所**には書きません
--     — ★**写しが 3 つ**できます（D-052）。★ワーカーは 1 か所です。
--   ✔ ★**ずれません**: ★成長は週送りでしか起きないので、★週送りの**入口**で入れれば
--     ★その値は ★**取得した瞬間の値そのもの**です。
--
-- ⚠️ ★**週はゲーム内の週**（★実時刻ではない・憲法 4）。
-- ⚠️ ★**この列は着順にも経済にも入りません**（★言葉を出すためだけ・§18 LR-5）。

-- ★前に言ったときの能力（★`null` ＝ まだ一度も言っていない・★基準も未設定）
alter table horses add column if not exists growth_told_stats jsonb;
-- ★前に言った週（★ゲーム内。★`null` ＝ まだ言っていない）
alter table horses add column if not exists growth_told_week bigint;

comment on column horses.growth_told_stats is
  '★「前より○○できるようになった」を、次に何と比べるか（★GB-1 ④⑤・2026-09-19）。'
  '🔴 ★**言った週にだけ**書く。★毎週 書くと累積が週次と同じものになる（★GB-1 ⑤）。'
  '★初回は「その馬が持ち主のものになった時点の stats」をワーカーが入れる（★GB-1 ⑥・決めごと）。'
  '⚠️ ★着順にも経済にも入らない（§18 LR-5）。★言葉を出すためだけの列。';
comment on column horses.growth_told_week is
  '★前に言ったゲーム内の週（★実時刻ではない・憲法 4）。★null ＝ まだ言っていない。'
  '★`growth_told_stats` と一緒にだけ動く（★下の CHECK）。';

-- 🔴 ★**片方だけ埋まっている状態を作れないようにする**（★`horses_retirement_all_or_none` と同じ作法）。
--   ★片方だけだと「基準はあるが、いつのものか分からない」になり、★後から読めません。
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'horses_growth_told_both_or_neither') then
    alter table horses add constraint horses_growth_told_both_or_neither
      check ((growth_told_stats is null and growth_told_week is null)
          or (growth_told_stats is not null and growth_told_week is not null));
  end if;
end $$;

-- ★運営の監視ではなく利用者の馬の列なので、★既存の `horses` の RLS をそのまま使います
--   （★`horses` は `0001` で RLS 有効・★公開ビューは列を選んで出す）。
-- ⚠️ ★**公開ビューには足しません** — ★`growth_told_stats` は `stats` の写しで、
--    ★出すと D-114 が隠した能力値がそのまま漏れます。
