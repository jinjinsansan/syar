-- ★**戦績の関数を `security definer` にする**（★2026-09-27・★本番の障害の直し）
--   ★裁定 `REVIEW_INC_PROD_PERMISSION_20260927.md`（Q-INC-1）・★報告 `REPORT_PROD_HORSE_WINS_PERMISSION_20260927.md`
--   ★簿 `VIEW-CALLS-FUNCTION-INVOKER-RIGHTS`
--
-- 【🔴 ★何が起きていたか】
--   ★本番でログインすると、★ダッシュボード・厩舎・出走登録が
--   ★「my_horses を読めませんでした: permission denied for table race_entries」で ★読めませんでした（★2026-09-27 オーナーが実物で確認）。
--   ★`my_horses`（`0087`）・`retired_horses_public` / `horse_market_listing_public`（`0086`）が
--   ★`horse_wins()` / `horse_starts()`（`0086`）を呼び、★その関数の中で ★`race_entries` を読むためです。
--   ★利用者（`anon` / `authenticated`）は ★`race_entries` を読めません（★`0006:37` で `revoke`）。
--
-- 【🔴 ★`0086` の註記の誤り（★消さずに、ここで訂正します）】
--   ★`0086:18-19` は ★「`security definer` にしません — ★呼ぶ側（view・関数）の権限で走ればよく、
--   ★定義者の権限で走らせる理由がありません（★狭いほうを選ぶ）」と書いています。
--   ★**「狭いほうを選ぶ」の姿勢は正しいのですが、★前提が誤っていました**:
--     ★ビューの持ち主の権限が効くのは ★**ビューが直に参照する表だけ**です。
--     ★**ビューの中から呼ばれた関数の本体**は、★definer でない限り ★**問い合わせた利用者の権限**で走ります。
--   → ★利用者が読めない表に ★関数の中で触ると ★落ちます。★★**権限は、通る道のいちばん狭い所で決まります。**
--   ✔ ★`my_retired_horses()`（`0086`）と ★`enter_race`（`0088`）は ★関数そのものが definer なので ★通っていました。
--
-- 【★なぜ definer にしてよいか — ★露出は増えない（★行で示す・裁定の条件 1）】
--   ★definer にすると ★**誰でも任意の馬 ID で 勝数・出走数を聞ける**ようになります。★それが ★**既に公開されている値から導ける**ことを示します:
--   ① ★この 2 関数が数えるのは ★`race_entries` の ★`finish_pos is not null`（出走数）と ★`finish_pos = 1`（勝数）だけです（`0086:31` `:45`）。
--   ② ★`finish_pos` を書くのは ★確定処理の 1 か所だけで（★`apps/worker/src/pg-store.ts:772`）、
--     ★**同じ取引の中で** ★`update races set status = 'settled'`（`:601`）と一緒に ★コミットされます（`:589` begin ～ `:845` commit）。
--     → ★他から見える行では ★**`finish_pos` が在る ⇔ そのレースは `settled`** です（★発表前の結果は この関数から漏れません）。
--   ③ ★`race_entries_public`（`0089`）は ★`status = 'settled'` のとき ★`finish_pos` を返し、★`horse_id` も返します（★`anon` にも）。
--     → ★`horse_wins(h)` ＝ ★`select count(*) from race_entries_public where horse_id = h and finish_pos = 1`
--       ★`horse_starts(h)` ＝ ★同じく `finish_pos is not null`。★**誰でも既に数えられる値**です。
--   ④ ★`retired_horses_public`（`0086`）は ★引退馬の勝数・出走数を ★`anon` に既に見せています（★D-114「強さの手がかりはオッズと戦績だけ」）。
--
-- 【★権限（★裁定の条件 2・`0073` と同じ作法）】
--   ★`alter function … security definer` は ★権限を変えませんが、★**`public` への既定の実行権**を ★ここで明示的に外し、
--   ★読む口（★公開ビューは `anon` も読む）に要るロールだけに ★付け直します。
--
-- ⚠️ ★本体（数え方）は ★1 文字も変えません（★D-052・★`0086` が唯一の出どころのまま）。★`search_path` は `0086` で固定済みです。
-- ---------------------------------------------------------------------------
begin;

alter function public.horse_starts(uuid) security definer;
alter function public.horse_wins(uuid) security definer;

revoke all on function public.horse_starts(uuid) from public;
revoke all on function public.horse_wins(uuid) from public;
grant execute on function public.horse_starts(uuid) to anon, authenticated;
grant execute on function public.horse_wins(uuid) to anon, authenticated;

comment on function public.horse_starts(uuid) is
  '★出走数（★確定した出走だけ）。★D-052: ★数え方はここ 1 か所。'
  '★2026-09-27（0090）: ★security definer — ★ビューから呼ばれた関数は 利用者の権限で走るため'
  '（★0086:18 の註記は誤り）。★返す値は race_entries_public（settled のときだけ finish_pos）から誰でも数えられる';

comment on function public.horse_wins(uuid) is
  '★勝数。★D-052: ★数え方はここ 1 か所（★horse_starts と対）。'
  '★2026-09-27（0090）: ★security definer（★理由は horse_starts と同じ）';

commit;
