-- ★**1 人 1 日の EP 発行の上限を 10,000 → 6,000 に・★上限が数えるのを新規発行だけに**（★2026-09-28・正典 **D-075 追補**（レビュー側 `520b7a6`・暫定）
--   ★用意だけ。★本番への適用は ★オーナーの承認事項です）
--
-- 【🔴 ★なぜ】
--   ★上限の役目は ★「正直な遊びを縛らず、★バグ・エクスプロイトの被害を上限で止める」こと（★D-075）。
--   ★デイリー 200 のときは ★上限まで 50 回ぶん。★2,000 にした（`0091`）ことで ★5 回ぶんになり、★1 件あたりの被害の天井が 10 倍になった。
--   ★6,000（★デイリーの 3 倍）なら ★天井は 5 回 → 3 回。
--   ★条件（正典）: ★**EP の入り口を増やす日（広告・アンケート等）に、上限も一緒に見直す。**
--
-- 【⚠️ ★正直な遊びが触れうる形（★開発側の調べ・レビュー側に報告済み）】
--   ★上限が数えるのは ★`ep_reason_class()` の `issuance`（★いまは `inflow` と `horse_sale`）。
--   ★馬の売却は ★買値の 20%（`SELL_BACK_RATE`）＝ ★1 頭 600〜1,520 EP（★買値 3,000〜7,600）。
--   ★デイリー 2,000 ＋ ★最高値の馬を 1 日に 3 頭 手放すと ★6,560 で ★上限に触れる（★10,000 では 5 頭）。
--
-- 【★動かすもの】 ★`ep_grant_amount('daily_cap')` の ★1 行だけ（★額を持つ SQL の 1 か所）。
--   ★TS の写し（`@star/betting` の `EP_GRANTS.daily_cap`）は ★同じ便で直し、★網 `ep-grant-sql.test.ts` が ★一致を見ます。
-- ⚠️ ★`create or replace` は ★既存の実行権を変えません（★`0091` の定義を写し、★`'daily_cap'` の 1 行だけ変えています）。
-- ---------------------------------------------------------------------------
begin;

create or replace function public.ep_grant_amount(p_kind text)
returns bigint
language plpgsql
immutable
as $$
begin
  case p_kind
    -- ★登録時 2,000 EP（★D-075。★`0031:140`・`0037:178`・`0067:63` の直書きをここへ寄せた）
    when 'signup' then return 2000;
    -- ★デイリーログイン 2,000 EP（★D-075 改訂 2026-09-27・★旧 200 は出走 1 回ぶんにも足りなかった）
    when 'daily' then return 2000;
    -- ★日次上限 6,000 EP（★D-075 追補 2026-09-28・★旧 10,000。★**1 人 1 日あたりの「発行」量の上限**。
    --   ★目的は honest play を縛ることではなく ★**バグ・エクスプロイトの被害を上限で止める**こと・★デイリーの 3 倍）
    when 'daily_cap' then return 6000;
    else raise exception 'EP の額の種類が分かりません: %（★ep_grant_amount に足してから使う）', p_kind;
  end case;
end $$;

-- ---------------------------------------------------------------------------
-- ★**上限が数えるのは ★新規発行だけ**（★2026-09-28・レビュー側の決定・★同じ移行に含めてよい）
-- ---------------------------------------------------------------------------
-- 【🔴 ★なぜ】
--   ★上限が止めたいのは ★**新しく発行される EP**（★デイリー・登録時 ＝ `inflow`）。
--   ★`horse_sale` は ★買値の 20% が戻るだけの ★**購入の一部返却**で、★売れば必ず損になる。
--   ★それを「発行」と数えていたので ★正直な遊び（★最高値の馬を 1 日に 3 頭 手放す）が ★上限に触れる形になっていた。
--   ★数える対象が広すぎたのが原因で、★上限の値の問題ではない（★6,000 は維持）。
-- 【★買い戻しの輪で得ができない根拠】
--   ★売値 ＝ 買値 × `SELL_BACK_RATE`（0.2・`packages/scheduler/src/horse-market.ts:45`・`sellBackEP` :98）。
--   ★`sell_horse`（`0026_horse_sale.sql:111`）が ★「戻る額 ≥ 払った額」を ★例外で止める。
-- 【★ほかの理由の確かめ（★全部）】
--   ★`inflow` … 発行（★デイリー・登録時）→ ★上限が数える
--   ★`refund` … 返金（★取ったものを返す・出走取消・払戻の返し）→ ★もともと数えない
--   ★`bet` … 馬券（`bets` から数える）／★`training`・`entry_fee`・`stud_fee`・`horse_purchase`・`stable_grade` … 焼却 → ★数えない
--   → ★返却・払い戻しの性質で ★発行に混ざっていたのは ★`horse_sale` だけ。
-- 【★監視（V-11・`apps/worker/src/daily-flow.ts`）では】
--   ★`rebate` は ★**焼却の戻し**（★購入を全額 焼却で数えているので、★戻った 20% を焼却から引く）。
-- ⚠️ ★**`point_flow_daily` の意味が この移行を当てた日から変わる**（★`ep_inflow` に horse_sale が入らない）。★過去の行は ★書いた当時の分類のまま（★作り直さない）。
--   ★2026-09-28 の時点で ★horse_sale は staging・本番とも 0 件（★段差は 0）。
-- 🔴 ★**順番**: ★`rebate` を知らないワーカーは ★`aggregateDay` が「未知の分類」で落ちる。
--   ★**新しいワーカーを配備してから ★この移行を当てる**（★逆にしない）。
create or replace function public.ep_reason_class(p_reason text)
returns text
language plpgsql
immutable
as $$
begin
  case p_reason
    -- ★**発行**（★新しい EP が世に出る。★日次上限が数え、★V-11 の純発行量にも載る）
    when 'inflow' then return 'issuance';
    -- ★**購入の一部返却**（★2026-09-28・`0094`・旧 issuance）。★発行ではない（★上限は数えない）・★監視では焼却の戻し
    when 'horse_sale' then return 'rebate';
    -- ★**返金**（★取ったものを返しているだけ。★発行でも焼却でもない）
    when 'refund' then return 'refund';
    -- ★**馬券**（★売上と払戻は `bets` から数える。★台帳で二重に数えない）
    when 'bet' then return 'ticket';
    -- ★**焼却**（★EP が世から消える）
    when 'training' then return 'burn';
    when 'entry_fee' then return 'burn';
    when 'stud_fee' then return 'burn';
    when 'horse_purchase' then return 'burn';
    when 'stable_grade' then return 'burn';
    else raise exception 'EP の理由が分類表にありません: %（★ep_reason_class に足してから使う）', p_reason;
  end case;
end $$;

comment on function public.ep_reason_class(text) is
  '★裁定 REVIEW_EP_INFLOW_AND_ENTRY_20260925.md §5 (b): ★reason ごとの発行/焼却/馬券/返金/返却を 1 か所に。'
  '★日次上限（claim_daily_ep）と V-11 の監視（daily-flow.ts）が同じ表を読む。'
  '★2026-09-28（0094）: ★horse_sale を issuance → rebate（★上限は新規発行だけを数える）';

commit;
