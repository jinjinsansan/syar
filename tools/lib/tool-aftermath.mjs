/**
 * ★**状態を変える道具の「後始末の作法」**（★**TL-1**・2026-09-19・レビュー側の指示）
 *
 * 【🔴 ★なぜ要るか — ★共有の staging を 2 回 汚しました】
 *   ★① `verify-ds7-cancel` … ★`rollback` したつもりで ★**内側の `commit` が外側を確定**させ、
 *      ★レース 2 件・所有馬 2 頭・`users` 1 人・1,000 EP を残しました（★2026-09-19）。
 *   ★② `verify-v11-synthetic` … ★**生きたレースを消費**しました（★設計どおり・悪意はない）。
 *
 * 【🔴 ★線は「片付けるか」ではありません】
 *   ✔ ★`verify-a2` も `verify-cancel` も ★**`clean()` を呼んでいます**。★呼んだだけです。
 *   ✔ ★`verify-unlock-daily` は ★**⑤b で巻き戻しを数えており**、★だから無事でした。
 *   → ★★**「片付けたことを確かめているか」**が、★実際に汚したものと汚さなかったものを分けました。
 *
 * 【🔴 ★それでも 1 つ漏れます】
 *   ★`verify-v11-synthetic` は ★**そもそも戻すつもりがありません**（★消費が目的）。
 *   → ★巻き戻しを要求しても ★**永遠に発火しません**。
 *   → ★**3 つに分けます**（★`FK-6` と同じ形 — ★**どれでもないものを作れなくする**）。
 *
 * 【★3 つ】
 *   ★`restores`  … ★戻す。★**戻したことを数える**こと（★`sandboxTx` の SB-3、または自前の照合）
 *   ★`consumes`  … ★使い切る。★**何を消費するかを宣言**すること。⚠️ ★**悪いことではありません**
 *                   （★消費する道具は要ります。★悪いのは**黙って**消費すること・R-27）
 *   ★`pending`   … 🔴 ★**片付けるが、片付いたことを数えていない**。★いまここに **20 本**。
 *                   ⚠️ ★**これは「分類」ではなく「まだ直っていない」印**です。
 *                   ★`open-findings` の **TL-1**（期限つき）が本体で、★ここはその一覧。
 *
 * ⚠️ 🔴 ★**`pending` を「3 つ目の正しい状態」と読まないこと。** ★空にするのが目標です。
 */
export const TOOL_AFTERMATH = {
  'verify-initial-horse-distribution.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'backfill-entry-prize.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-d117-fill.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds7-cancel.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-registered-excludes-scratched.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds5-retire-scratch.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds5-before-start-scratch.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-gb1-growth-tell.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'cleanup-ds7-leak.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: races / race_entries / race_odds / ep_ledger / public.users / auth.users を消す（DS-7 の漏れの掃除）。数えていない' },
  'verify-sandbox-detects-commit.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-sy1-clone.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'diag-dl1-daily.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-dl2-daily-log.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'audit-tools.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'fix-purse.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'diag-insert.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: races / race_entries / race_odds を消す。数えていない' },
  'seed-races.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'settle-races.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-training-week.mjs': {
    mode: 'consumes',
    why: '🔴 ★**staging の現役馬全頭の `last_processed_week` を WEEKS 週ぶん巻き戻し、戻しません**。'
      + '★その後週送りを流すので ★**同じ週を二度 育てる**ことになり、'
      + '★道具自身が ★**「能力は戻しません（戻す手段がありません）」**と書いています（:83）。'
      + '⚠️ ★**消費するのは「行」ではなく ★能力の分布そのもの**です — '
      + '★較正（V-4 など）は staging の馬を書き出して測るので、'
      + '🔴 ★**この道具を流すと、後の較正の母集団が変わります**。'
      + '🔴 ⚠️ ★2026-09-19 まで `restores` と名乗っていました — ★検査の語の一覧に '
      + '★**「巻き戻」が入っていた**からです。★しかしこの「巻き戻し」は '
      + '★**自分の書き込みを戻す**意味ではなく、★**馬の時計を巻き戻す**意味でした'
      + '（★**緑が別の理由で出ていた** — R-29）',
  },
  'verify-entrant-freeze.mjs': { mode: 'restores', why: '片付けたことを数えている', countedBy: 'notRestored.length === 0' },
  'verify-unfrozen-cancel.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-unlock-daily.mjs': { mode: 'restores', why: '片付けたことを数えている', countedBy: 'restored.n === direct.horses' },
  'verify-v19-db.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: user_identities を消す。数えていない' },
  'probe-auth-identities.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'probe-signup-domain.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-v19-email.mjs': { mode: 'restores', why: '🔴 ★**2026-09-19: `STABLE-1-SKEW` と同じ誤りが 3 か所 在った** — ★`npc_stable_id = (select id from npc_stables order by id limit 1)`（★「いちばん若い厩舎」＝ 実質 **厩舎 1**）で馬を返していた。⚠️ ★副問い合わせに化けていたため、★`npc_stable_id\\s*=\\s*1` の走査から**漏れていた**（★網が狭すぎた）。⚠️ ★ただし規模は小さい: ★候補は `order by h.id limit 1` で**毎回 同じ馬**なので、★`verify-prize` のように増え続けない（★`verify-g6` と同型で 1〜2 頭で飽和）。✅ ★直した: ★候補を引くときに `npc_stable_id` も一緒に読み、★**元の厩舎へ**返す（2 か所）。★片付けの総ざらいの 1 か所は ★**返すのをやめ、残っていたら数えて不合格**にした（★元の厩舎を知らない場所で値を決めない）。⚠️ ★口座も消さない（★`horses.owner_id` の FK に当たるうえ、★**消すと誰のものだったかも消える**）。✅ ★TL-1: ★`rec(\'片付け\', …)` で合否に入れた。⚠️ 🔴 ★**実 DB では確かめていない**', countedBy: "rec('片付け', '★検証用の馬を 1 頭も残さない（★元の厩舎へ戻す）'," },
  'cleanup-probe-user.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'age-horses.mjs': {
    mode: 'consumes',
    why: '🔴🔴 ★**現役馬 全頭の `birth_week` と `last_processed_week` を ★単一の値に書き換え、'
      + '★追いつくまで `advanceTrainingWeeks` を繰り返します**（`:70-72`・`:82-`）。★**戻せません。**'
      + '★消費するもの: ★**年齢のばらつきそのもの**（★全頭が同じ生年になる）と ★**能力の分布**。'
      + '🔴 ★**staging の現役 7,333 頭が全頭 `birth_week = -160`** なのは、★**この道具の跡と思われます**'
      + '（★`birthWeek = closedWeek - TARGET_AGE`、TARGET_AGE の既定 182 なら closedWeek = 22。'
      + '★いまの週は 253 なので ★約 231 週 ＝ 38.5 日 前 — ★世界の種まき（2026-08-10）とほぼ一致）。'
      + '⚠️ ★**推定です**（★実行記録は残っていません）。'
      + '→ ★**`POOL-DRAIN` の「全頭同じ生年」と `SEED-LOCKSTEP` の「位相が揃っている」は、'
      + '★**製品の欠陥ではなく道具の跡の可能性**があります（★供給が無いことは別に真）',
  },
  'verify-v11-synthetic.mjs': {
    mode: 'consumes',
    why: '🔴 ★**集団全体の週送りを走らせます**（`:243` で `advanceTrainingWeeks(c, ...)`）。'
      + '✔ ★実測（2026-09-19）: ★**延べ 64,000 頭・EP 消費 28,800**。'
      + '★消費するのは ★**能力の分布そのもの**で、★`clean()` は行を消すだけで ★**育った能力は戻せません**。'
      + '🔴 ★**較正の母集団（`pool-D-active-3000.json`）は staging から書き出したもの**なので、'
      + '★この道具を流すと ★**次に書き出した集団が別物になります**。'
      + '✅ ★自分が作った行（レース・馬券・台帳・口座・所属厩舎）は `clean()` が戻し、'
      + '★戻ったことを ⑧ で数えます。⚠️ ★**それは行だけ**です。'
      + '🔴 ⚠️ ★2026-09-19、★私はこれを ★**`restores` に分類しかけました** — ★行の残存だけを数えて。'
      + '★**行が 0 でも、集団は 8 週 進んでいます**（★緑が別の理由で出る形を、★私が新しく作りかけた）',
    notRestored: '★集団全体の育成週（★最大 8 週 × 4 バッチ ＝ 32 週）。★行は戻りますが、★育った能力は戻りません',
    countedBy: 'leftovers.length === 0',
  },
  'verify-v10-bets.mjs': { mode: 'restores', why: '✅ ★**2026-09-19（TL-1）**: ★`clean()` が消した後に ★**残り行数を表ごとに数えて返す**ようにし、★⑦ で合否に入れた（`pp_ledger` / `ep_ledger` / `bets` / `users` / `auth.users`）。★旧は `await clean();` の 1 行で、★**残っていても緑のまま**だった。⚠️ ★控えは要らない（★固定の `UID` で引く。★`randomUUID()` は賭けの冪等鍵で、★片付けには使わない）。⚠️ 🔴 ★**実 DB では確かめていない**', countedBy: "check(leftTotal === 0, '⑦ 検証用の行が 1 つも残っていない'," },
  'seed-stables.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'seed-world.mjs': {
    mode: 'consumes',
    why: '★★**`delete from horses`（★条件なし）で全馬を消してから、★世界を入れ直します**（`:61`）。'
      + '★消費するもの: ★**世界そのもの**。★戻す手段はありません（★片付けではなく、★作り直しです）。'
      + '⚠️ ★`birth_week` を書きません（★別の列 `birth_year` は書く）→ ★**作った直後の馬は一度も週送りされません**'
      + '（`training-runner.ts:218` が `birth_week is not null` で絞るため）。'
      + '→ ★**`age-horses.mjs` を続けて流すのが前提**になっています（★`SEED-LOCKSTEP`）。',
    notRestored: '★世界そのもの（★`delete from horses` に条件が無い）。★前の世界は戻りません',
  },
  'synthetic-bettor.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: users / auth.users / bets / ep_ledger / pp_ledger を消す。数えていない（:173 の照合は賭けの検査であって片付けの照合ではない）' },
  'verify-a2.mjs': { mode: 'restores', why: '自前の照合：作った番号だけを消し、★**残存 0 件とレース総数が開始時と同じ**でなければ exit 1（:135）。⚠️ 2026-09-19 まで pending としていましたが ★**分類の誤り**でした', countedBy: 'left !== 0 || after !== before' },
  'verify-b1.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: horse_week_log を消す。数えていない' },
  'verify-g6.mjs': { mode: 'restores', why: '自前の照合：台帳・口座・所有馬の残行と ★**所属厩舎が元の値に戻ったか**を数え、違えば fails に積む。🔴 2026-09-19 に直した：以前は `npc_stable_id = 1` と ★**決め打ち**しており、★元が 1 でない馬を取ったら ★**黙って 1 番厩舎へ移していた**（★staging の厩舎は 1..12+ で各 170〜280 頭）。✅ ★**2026-09-19（SB-6）**: ★控えを ★`tmp/snapshots/verify-g6.json` に置くようにした（★付け替えの**前**に置き、★戻ったことを数えた**後**に捨てる）。★**殺されても次の実行が戻す**。★戻し方は `lib/tool-restores.mjs` の `RESTORE_G6`、★検査は `tool-restores-g6.test.ts`（8 件）。⚠️ 🔴 ★**実 DB では確かめていない**（★偽の client）', countedBy: 'if (!cleanOk) fails.push' },
  'verify-a4.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: races を消す。数えていない' },
  'verify-a5.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: races / race_odds / bets / ep_ledger / users を消す。数えていない' },
  'verify-a6.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: races / race_entries / race_odds / bets / ep_ledger / users と、自分で作った馬 1 頭（owner_id で限定）を消す。数えていない。自分で insert した馬だけなので実在の馬は消さない' },
  'verify-a7.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: app_environment を全消しして、控えた値を書き戻す。数えていない。控えはメモリなので殺されると戻らない（TOOL-SNAPSHOT-IN-MEMORY）。★空（null）なら `assertEnvironmentMatches` が投げる（`apps/worker/src/env.ts:78`）。★既定値で救わない。★戻らなければ他の道具は起動できない（fail-closed・R-27）。⚠️ 🔴 ★ここに「既定は production」を足さないこと — ★既定は後で変えられる。★投げるほうが強い（✔ `pg-store.ts:831` は null を返すだけで、production とは言わない）' },
  'verify-cancel.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: bets / ep_ledger / users を消す。数えていない' },
  'verify-db.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-economy.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: bets / ep_ledger / pp_ledger / users を消す。数えていない' },
  'verify-exchange.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: prize_exchanges / prize_catalog / pp_ledger / users を消す。数えていない' },
  'verify-flow.mjs': { mode: 'pending', why: '★片付けるが、★片付いたことを数えていない。★消すもの: bets / ep_ledger / pp_ledger / point_flow_daily / users / auth.users を消す。数えていない' },
  'verify-overdue.mjs': { mode: 'restores', why: '自前の照合：`残存 ${left} 件` を数え、★`left !== 0` なら exit 1（:101）。⚠️ 2026-09-19 まで pending としていましたが ★**分類の誤り**でした', countedBy: 'left !== 0' },
  'verify-prize.mjs': { mode: 'restores', why: '🔴 ★**2026-09-19 まで `pending`。★しかも片付け自体が `STABLE-1-SKEW` を作っていた** — ★`update horses set owner_id=null, npc_stable_id=1 where owner_id=$1` と ★**厩舎 1 を決め打ち**し、★この道具は出走表の**最終枠を除く全頭**（1 回 17 頭 前後）を取るので、★**流すたびに 17 頭が 厩舎 1 へ 一方向に移っていた**（`535db6e` 以来）。✔ ★staging の跡: ★**6 本のレースで「厩舎 1 の頭数 ＝ 出走頭数 − 1」ちょうど**（17/18・12/13・10/11・9/10・9/10・7/8）、★**他の 39 厩舎では 0 本**。★厩舎 1 の余り 92 頭 のうち **66 頭（72%）**を説明する（★`diag-stable1-skew.mjs`・読むだけ）。✅ ★**SB-6** で、★付け替えの**前**に馬ごとの元の厩舎を `tmp/snapshots/verify-prize.json` へ控え、★そこから戻す。★控えが無いのに所有馬が残っていたら ★**決め打ちで 1 に入れず、数えて落ちる**。★戻し方は `lib/tool-restores.mjs` の `RESTORE_PRIZE`。⚠️ 🔴 ★**実 DB では確かめていない**（★偽の client）', countedBy: "check(Number(backHome) === 0 && orphanLeft === 0," },
};
