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
  /**
   * ★血統の写しの直し（★2026-09-21・簿 `PEDIGREE-CACHE-IDS-NOT-DB-IDS`）。
   * ⚠️ ★**戻しません。★戻す必要がありません** — ★上書きする前の値は ★**DB の何も指していない鍵**で、
   *    ★しかも ★`sire_id`/`dam_id` から ★**いつでも作り直せます**（★この道具がやることそのもの）。
   */
  'repair-pedigree-cache.mjs': {
    mode: 'consumes',
    why: '★消費するもの: ★**`horses.pedigree_cache` の旧い値**（★全頭・★上書き）。'
      + '★既定は ★**下見だけ**で、★`--apply` を付けたときだけ書きます。'
      + '✅ ★**書く前に判定 ①〜④ を通します**（★通らなければ `--apply` が付いていても書きません）。'
      + '✅ ★**書いた後に DB を読み直します**（★判定 ⑥・★道具の言い分ではなく DB に訊く）。'
      + '✅ ★素性を ★**始める前と後の 2 回** `evidence/pedigree-repair/` に残します。',
    notRestored: '★**旧い `pedigree_cache`**（★戻しません）。★旧い値は ★**DB に存在しない id を指していた**もので、'
      + '★保つ価値がありません。★どうしても要るなら、★`evidence/pedigree-repair/` の素性に'
      + '★件数が残っており、★値そのものは ★**親子の連鎖から再現できます**',
  },
  /**
   * ★配合を本物の DB で 1 週 走らせる（★2026-09-21）。
   * ✅ ★`runBreedingWeek` が ★**自分で commit しない**ことを確かめたうえで `rollback` します
   *   （★2026-09-21 は grep で 0 行。★2026-09-22 から追いつきが週ごとに取引を張るので、
   *    ★`breeding-runner.test.ts` の「runBreedingWeek は取引に触らない」が釘付け）。
   */
  'recheck-name-blocklist.mjs': {
    mode: 'consumes',
    why: '★消費するもの: ★**`horses.name_checked_with` の空（null）**（★未検査の行に ★いまのリストの版を書く）。'
      + '★既定は ★**下見だけ**。★`--rehearse` は ★書いて数え直してから ★必ず戻す。★`--apply` で書く。'
      + '✅ ★**当たった行は書かない**（★未検査のまま残す）。★書いた後に取引の中で ★残り ＝ 当たった数・★版の一致を数え、★合わなければ戻す。'
      + '🔴 ★当たった名前は出力しない（★ID だけ・★実在馬名の可能性・憲法 §0.1）',
    notRestored: '★**未検査の印（null）**（★戻しません）。★検査した事実を ★版として残すための道具で、'
      + '★未検査に戻す理由がありません。★戻すなら ★`update horses set name_checked_with = null where name_checked_with = <版>`',
  },
  'backfill-name-key.mjs': {
    mode: 'consumes',
    why: '★消費するもの: ★**`horses.name_key` の空（null）と食い違い**（★全頭・★`normalizeName(name)` で上書き）。'
      + '★既定は ★**下見だけ**で、★`--apply` を付けたときだけ書きます。'
      + '✅ ★**書く前に ①重なり ②空の名前 を数え、★当たれば書きません**。'
      + '✅ ★**書いた後に取引の中で数え直し、★合わなければ戻します**。★確定の後にもう一度 DB から読みます（④⑤）。',
    notRestored: '★**埋める前の `name_key`**（★戻しません）。★埋める前は ★空（null）か ★`normalizeName(name)` と食い違う値で、'
      + '★保つ価値がありません。★値は ★`name` から ★いつでも作り直せます',
  },
  'reset-horse-name.mjs': {
    mode: 'consumes',
    why: '★消費するもの: ★**1 頭の馬名**（★仮の名前か、★普通の名前に置き換える）。★既定は ★**下見だけ**で、★`--apply` を付けたときだけ書きます。'
      + '✅ ★読んだ後に名前が変わっていれば書きません。★書いた後に読み直し、★記録が 1 行 増えたことを数えます。★合わなければ戻します。'
      + '★`--rehearse` は ★同じことをして ★必ず戻します。',
    notRestored: '★**元の名前**（★戻しません）。★記録（`horse_name_resets`）には ★正規化した名前のハッシュだけを残します（★平文を置かない・裁定 P-3）',
  },
  'verify-name-reset-live.mjs': {
    mode: 'restores',
    why: '★`begin` → 利用者・持ち主の付け替え・`planNameReset`・`applyNameReset`（★2 頭）→ ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ⑤ が ★記録の数と 2 頭の名前の 前後一致を見ます。',
    countedBy: 'after.resets === before.resets && after.owned === before.owned && after.npc === before.npc',
  },
  'verify-player-breeding-live.mjs': {
    mode: 'restores',
    why: '★`begin` → 利用者・要求・`confirmInitialBreeding`・`runBreedingWeek` → ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ⑧ が ★5 つの表の行数の 前後一致を見ます。'
      + '⚠️ ★内側が commit する関数を包むと ★**外側ごと確定します** — ★`confirmInitialBreeding` は取引に触らない'
      + '（★`player-breeding.test.ts` が釘付け）。★取引を張るのは `runPlayerBreeding` だけです',
    // ★AU-7: ★主張には引用を付ける。★この行が変われば、★検査が壊れて落ちます
    countedBy: 'JSON.stringify(after) === JSON.stringify(before)',
  },
  'verify-breed-own-mare-live.mjs': {
    mode: 'restores',
    why: '★`begin` → 利用者・母の持ち主と役割・`request_breeding`・`confirmBreeding`（★種付料の引き落とし）→ ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ⑦ が ★要求・下書き・台帳・馬の行数の 前後一致を見ます。'
      + '⚠️ ★`confirmBreeding` は取引に触らない（★種付料だけセーブポイント・`player-breeding.test.ts` が釘付け）',
    countedBy: 'JSON.stringify(before) === JSON.stringify(after)',
  },
  'verify-role-request-live.mjs': {
    mode: 'restores',
    why: '★`begin` → 利用者・持ち主の付け替え・`request_breeding_role`・`runBreedingWeek`・0025 の購入の一時的な定義 → ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ⑨ が ★馬・依頼・生涯の記録の行数の 前後一致を見ます。'
      + '⚠️ ★制約と関数の一時的な差し替えは ★セーブポイントの中で行い、★その場で戻します（★DDL も取引の中で戻る）',
    countedBy: 'JSON.stringify(before) === JSON.stringify(after)',
  },
  'verify-my-retired-horses-live.mjs': {
    mode: 'restores',
    why: '★`begin` → 利用者・持ち主の付け替え・`request_breeding_role` → ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ⑥ が ★馬・依頼・生涯の記録の行数の 前後一致を見ます。'
      + '⚠️ ★判定 ⑤ は ★RPC を呼んで比べるので ★1 件ごとにセーブポイントへ戻します（★測っている状態を自分で動かさない）。'
      + '⚠️ ★未認証の判定（④）は ★落ちた文が取引を壊すため、★1 回ごとにセーブポイントへ戻します',
    countedBy: 'JSON.stringify(before) === JSON.stringify(after)',
  },
  'verify-breeding-live.mjs': {
    mode: 'restores',
    why: '★`begin` → `runBreedingWeek` → ★**必ず `rollback`**（`finally`）。'
      + '✅ ★**戻したことを数えます**: ★判定 ③ が ★**頭数の 前後一致**を見ます'
      + '（★`rollback` を呼んだだけで済ませません・★TL-1 の線はここ）。'
      + '⚠️ ★内側が commit する関数を包むと ★**外側ごと確定します**（★2026-09-19 の `verify-ds7-cancel`）。'
      + '★だから ★**包む前に確かめました**。★`runBreedingWeek` は取引に触りません'
      + '（★2026-09-22 から追いつきが週ごとに取引を張るので、★grep ではなく'
      + ' `breeding-runner.test.ts` の「runBreedingWeek は取引に触らない」が釘付け）',
    // ★AU-7: ★主張には引用を付ける。★この行が変われば、★検査が壊れて落ちます
    countedBy: 'check(after === before,',
  },
  'verify-initial-horse-distribution.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'backfill-entry-prize.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-d117-fill.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds7-cancel.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-registered-excludes-scratched.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds5-retire-scratch.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-ds5-before-start-scratch.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-gb1-growth-tell.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'cleanup-ds7-leak.mjs': { mode: 'consumes', why: '★DS-7 の漏れの掃除。★消すもの: races / race_entries / race_odds / ep_ledger / public.users / auth.users。✅ ★**2026-09-19（TL-1 ＋ CLEANUP-NO-RECORD）**: ★① 消す前に ★**何を消すのかを識別子で控える**（`evidence/cleanup-ds7-leak/<時刻>.json` ＋ 端末にも出す）。★② 消した後の残り件数を数え、★**0 でなければ終了コード 1**（★旧は数を印刷するだけで、★残っていても 0 で終わっていた）。⚠️ ★控えは**戻すためではありません** — ★漏れの掃除なので戻す必要が無く、★「本当にそれだけを消したか」を後から人が確かめるためです', notRestored: '🔴 ★**2 頭の元の `npc_stable_id`**。★`horses_owner_xor_npc` があるので `owner_id` を付けた時点で消えており、★`birth_snapshot` にも控えが無い。★`md5(id)` で 40 厩舎に散らすので「厩舎に属している」ことだけが戻る（★`race_entries_public.owner_label` が 2 頭だけ別名になる）。⚠️ ★これは**決め打ちの 1 ではない**（★`STABLE-1-SKEW` を作らない形）' },
  'verify-sandbox-detects-commit.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-sy1-clone.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'diag-dl1-daily.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-dl2-daily-log.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'audit-tools.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'fix-purse.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'diag-insert.mjs': { mode: 'consumes', why: '★消すもの: races / race_entries / race_odds（★自分で作った `cycle_index` 2 つ分）。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**終了コード 1**。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
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
  'verify-v19-db.mjs': { mode: 'consumes', why: '★消すもの: user_identities（`SUB_A` / `SUB_B`）。🔴 ★**2026-09-19（TL-1）: これは「数えていたのに合否に入っていなかった」形**でした — ★残り行数を**印刷**しており、★数えているように見えますが、★**残っていても終了コード 0** でした。★★**数えると、★その数で落ちるは別**です。✅ ★`record` の「片付け」項で合否に入れました。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
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
      + '★**製品の欠陥ではなく道具の跡の可能性**があります（★供給が無いことは別に真）。'
      + '--- ✅ ★**2026-09-20: ★黙って揃えないようにしました** ---'
      + '🔴 ★**`--flatten` を明示しないと投げます**（★**R-27**: ★既定は狭い側へ）。'
      + '★この道具の目的（★同じ週齢まで育てて開放率を比べる）では揃えるのが正しいので、'
      + '★**取り上げたのではなく、★明示させる**形にしました。'
      + '→ ★世界を作るのは `seed-world.mjs` の仕事です（★あちらは案 B-3 で 52 週へ散らします）',
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
      + '--- ✅ ★**2026-09-20 に直しました（★コードのみ。★流していません）** ---'
      + '⚠️ ★**旧**: ★`birth_week` を書かず（★別の列 `birth_year` は書く）、'
      + '★`retired_at_week` も書きませんでした。→ ★**作った直後の馬は一度も週送りされず**'
      + '（`training-runner.ts:218` が `birth_week is not null` で絞るため・★`PROD-NEVER-AGED`）、'
      + '★**走り終えた 4,970 頭が「現役」のまま**でした（★`SEED-NOT-RETIRED`）。'
      + '★`age-horses.mjs` を続けて流すのが前提になっており、★それが `SEED-LOCKSTEP` を作っていました。'
      + '✅ ★**新**: ★`lifeColumns()` が ★**`birth_week` / `last_processed_week` / 引退の 3 列**を'
      + '★プリシード世界から**転記**します（★発明ではありません）。'
      + '★生まれた週は ★**案 B-3**（★`@star/scheduler` の `birth-week.ts` が持つ規則・★52 週へ層化）。'
      + '★そのあと ★**`advanceTrainingWeeks` を追いつくまで回します**（★決め C・`--no-catch-up` で止まる）。'
      + '✅ ★自分で 3 つ確かめます: ★① `birth_week` が無い馬 0 頭 ★② 現役の頭数が一致'
      + '★③ 現役の `birth_week` が 100 種類以上。⚠️ 🔴 ★**実 DB では確かめていません。**',
    notRestored: '★世界そのもの（★`delete from horses` に条件が無い）。★前の世界は戻りません',
  },
  'synthetic-bettor.mjs': { mode: 'consumes', why: '★消すもの: users / auth.users / bets / ep_ledger / pp_ledger（★`--clean` が唯一の片付け口）。⚠️ ★これは **常時走る道具**（`while (true)`）で、★平時は馬券を買い続けます。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**落ちます**。⚠️ 🔴 ★**実 DB では確かめていない**。⚠️ ★旧は `clean()` が「後片付け完了」と**印刷**していただけで、★見ていませんでした', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-a2.mjs': { mode: 'restores', why: '自前の照合：作った番号だけを消し、★**残存 0 件とレース総数が開始時と同じ**でなければ exit 1（:135）。⚠️ 2026-09-19 まで pending としていましたが ★**分類の誤り**でした', countedBy: 'left !== 0 || after !== before' },
  'verify-b1.mjs': { mode: 'consumes', why: '🔴 ★**実在の NPC 馬を 1 頭、★恒久に試験体にします**（`order by id limit 1` — ★**毎回 同じ馬**）。★一生分の育成を回し、★終わったときに **引退した状態のまま残します**。✔ ★**staging で実測**（2026-09-19）: ★最小 id の馬 `00059b7a` だけが `birth_week=0` / `last_processed_week=260` / `retired_at_week=260` / `birth_snapshot` ありで、★**他の全頭は `birth_week=-160`**。★つまりこの道具の跡は **1 頭だけ**です。⚠️ ★**「現役 7,333 頭が全頭 -160」には、★この引退した 1 頭という例外が見えていません**（★引退しているので現役の数に入らない）— ★`SEED-LOCKSTEP` を調べる人はここで躟みます。✅ ★**控えは DB の列にあります**（`birth_snapshot`）— ★メモリではないので `TOOL-SNAPSHOT-IN-MEMORY` ではありません。★次の実行がそこから初期化します（★道具自身が「2 回目が 1 回目の終了状態から始まった」失敗を記録しています）', notRestored: '🔴 ★**最小 id の NPC 馬 1 頭の現役生活**。★実行後は `retired_at_week=260` のままで、★出走プールから外れます。★戻すには `birth_snapshot` から手で戻すか、★もう一度流す必要があります' },
  'verify-g6.mjs': { mode: 'restores', why: '自前の照合：台帳・口座・所有馬の残行と ★**所属厩舎が元の値に戻ったか**を数え、違えば fails に積む。🔴 2026-09-19 に直した：以前は `npc_stable_id = 1` と ★**決め打ち**しており、★元が 1 でない馬を取ったら ★**黙って 1 番厩舎へ移していた**（★staging の厩舎は 1..12+ で各 170〜280 頭）。✅ ★**2026-09-19（SB-6）**: ★控えを ★`tmp/snapshots/verify-g6.json` に置くようにした（★付け替えの**前**に置き、★戻ったことを数えた**後**に捨てる）。★**殺されても次の実行が戻す**。★戻し方は `lib/tool-restores.mjs` の `RESTORE_G6`、★検査は `tool-restores-g6.test.ts`（8 件）。⚠️ 🔴 ★**実 DB では確かめていない**（★偽の client）', countedBy: 'if (!cleanOk) fails.push' },
  'verify-a4.mjs': { mode: 'consumes', why: '★消すもの: 自分で作った races 2 行（`A4-SCHEDULED` / `A4-SETTLED`）。✅ ★**2026-09-19（TL-1）**: ★消した後に残りを数え、★0 でなければ**終了コード 1**。★旧は `delete` を呼ぶだけだった。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-a5.mjs': { mode: 'consumes', why: '★消すもの: 自分で作った races（`A5-TEST`）/ race_odds / bets / ep_ledger / users。✅ ★**2026-09-19（TL-1）**: ★`cleanup()` が残りの合計行数を返し、★0 でなければ PASS にならず終了コード 1。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-a6.mjs': { mode: 'consumes', why: '★消すもの: races（`A6-%`）/ race_entries / race_odds / bets / ep_ledger / users と、★**自分で insert した馬 1 頭**（`owner_id` で限定）。✔ ★NPC の馬は取っていないので `STABLE-1-SKEW` の形にはならない（★2026-09-19 に `insert into horses` を見て確かめた）。✅ ★**2026-09-19（TL-1）**: ★`clean()` が残りの合計行数を返し、★0 でなければ PASS にならず終了コード 1。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行と馬だけを消す）' },
  'verify-a7.mjs': { mode: 'restores', why: '🔴 ★**`app_environment` を丸ごと消してから戻す**（★A-7 の門が働くことを確かめるため）。🔴 ★**戻らなければ、★ワーカーも状態を変える道具 全部も起動できなくなります**（`assertEnvironmentMatches` が投げる・`apps/worker/src/env.ts:78`・既定値で救わない・fail-closed・R-27）。⚠️ 🔴 ★**ここに「既定は production」を足さないこと** — ★既定は後で変えられる。★投げるほうが強い。✅ ★**2026-09-19（SB-6）**: ★控えを `tmp/snapshots/verify-a7.json` へ出した。🔴 ★**残り物の復元を「元の宣言を読む」より前**に置いてある（★逆だと、★前回が殺されて空のとき `original = null` と誤認して★**空のまま確定**させる）。★戻しは **1 文**（upsert・`delete`→`insert` の 2 文にしない）。★検査は `tool-restores-a7.test.ts`（7 件）。⚠️ 🔴 ★**実 DB では確かめていない**', countedBy: 'if (!ok || back !== original) process.exit(1);' },
  'verify-cancel.mjs': { mode: 'consumes', why: '★消すもの: bets / ep_ledger / users。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**終了コード 1**。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-db.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-economy.mjs': { mode: 'consumes', why: '★消すもの: bets / ep_ledger / pp_ledger / users。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**落ちます**。⚠️ 🔴 ★**実 DB では確かめていない**。★残っていたら `fails` にも積みます', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-exchange.mjs': { mode: 'consumes', why: '★消すもの: prize_exchanges / pp_ledger / users / prize_catalog（`TEST-%`）。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**落ちます**。⚠️ 🔴 ★**実 DB では確かめていない**', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-flow.mjs': { mode: 'consumes', why: '★消すもの: bets / ep_ledger / pp_ledger / users / auth.users / point_flow_daily（当日分）。✅ ★**2026-09-19（TL-1）**: ★`lib/leftovers.mjs` の `reportLeftovers` で ★**消した後の残りを数え**、★0 でなければ ★**落ちます**。⚠️ 🔴 ★**実 DB では確かめていない**。★`point_flow_daily` も数えます（★そこだけ `user_id` ではなく `date` で引くので、★見落としやすい）', notRestored: '★無し（★自分で作った行だけを消す）' },
  'verify-overdue.mjs': { mode: 'restores', why: '自前の照合：`残存 ${left} 件` を数え、★`left !== 0` なら exit 1（:101）。⚠️ 2026-09-19 まで pending としていましたが ★**分類の誤り**でした', countedBy: 'left !== 0' },
  'verify-prize.mjs': { mode: 'restores', why: '🔴 ★**2026-09-19 まで `pending`。★しかも片付け自体が `STABLE-1-SKEW` を作っていた** — ★`update horses set owner_id=null, npc_stable_id=1 where owner_id=$1` と ★**厩舎 1 を決め打ち**し、★この道具は出走表の**最終枠を除く全頭**（1 回 17 頭 前後）を取るので、★**流すたびに 17 頭が 厩舎 1 へ 一方向に移っていた**（`535db6e` 以来）。✔ ★staging の跡: ★**6 本のレースで「厩舎 1 の頭数 ＝ 出走頭数 − 1」ちょうど**（17/18・12/13・10/11・9/10・9/10・7/8）、★**他の 39 厩舎では 0 本**。★厩舎 1 の余り 92 頭 のうち **66 頭（72%）**を説明する（★`diag-stable1-skew.mjs`・読むだけ）。✅ ★**SB-6** で、★付け替えの**前**に馬ごとの元の厩舎を `tmp/snapshots/verify-prize.json` へ控え、★そこから戻す。★控えが無いのに所有馬が残っていたら ★**決め打ちで 1 に入れず、数えて落ちる**。★戻し方は `lib/tool-restores.mjs` の `RESTORE_PRIZE`。⚠️ 🔴 ★**実 DB では確かめていない**（★偽の client）', countedBy: "check(Number(backHome) === 0 && orphanLeft === 0," },
};
