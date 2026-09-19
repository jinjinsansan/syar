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
  'cleanup-ds7-leak.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-sandbox-detects-commit.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-sy1-clone.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'diag-dl1-daily.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'verify-dl2-daily-log.mjs': { mode: 'restores', why: 'sandboxTx（SB-3 が途中の確定を見る）' },
  'audit-tools.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'fix-purse.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'diag-insert.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'seed-races.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'settle-races.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-training-week.mjs': { mode: 'restores', why: '片付けたことを数えている' },
  'verify-entrant-freeze.mjs': { mode: 'restores', why: '片付けたことを数えている' },
  'verify-unfrozen-cancel.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-unlock-daily.mjs': { mode: 'restores', why: '片付けたことを数えている' },
  'verify-v19-db.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'probe-auth-identities.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'probe-signup-domain.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-v19-email.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'cleanup-probe-user.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'age-horses.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-v11-synthetic.mjs': { mode: 'restores', why: '片付けたことを数えている' },
  'verify-v10-bets.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'seed-stables.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'seed-world.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'synthetic-bettor.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-a2.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-b1.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-g6.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-a4.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-a5.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-a6.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-a7.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-cancel.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-db.mjs': { mode: 'consumes', why: '書いたまま残す（使い切る）' },
  'verify-economy.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-exchange.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-flow.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-overdue.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
  'verify-prize.mjs': { mode: 'pending', why: '片付けるが、片付いたことを数えていない' },
};
