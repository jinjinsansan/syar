/**
 * ★コマンドライン引数の解析（2026-08-20 に事故を起こしたので切り出した）
 *
 * 【何が起きたか】
 *   `migrate.mjs` は位置引数（適用するファイルの前方一致）をこう拾っていました。
 *
 *     argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))[0]
 *
 *   **「`--` で始まる語の次は、その語の値である」と決め打っています。**
 *   ここに真偽値フラグ `--yes-production` を足した瞬間、
 *
 *     migrate.mjs --env production --yes-production 0017
 *
 *   の `0017` が「`--yes-production` の値」と見なされて**消え**、
 *   位置引数なし＝**「未適用のものを全部当てる」**に化けました。
 *   ★**本番に、指定していないマイグレーションが当たりました。**
 *
 * 【教訓】
 *   ★**値を取るフラグと取らないフラグを、解析器が知らなければならない。**
 *     「`--` で始まるかどうか」だけで判断する形は、真偽値フラグを1つ足すたびに壊れる。
 *   ★そして壊れ方が「引数が消えて、既定の広い動作に落ちる」方向だったのが最悪です
 *     （狭くなるなら気づく。広くなると黙って余計に効く）。
 */

/**
 * 引数を解析する。
 *
 * @param {readonly string[]} argv `process.argv.slice(2)` 相当
 * @param {readonly string[]} valueFlags 値を取るフラグ名（`--` を含む）。★ここに無いものは真偽値として扱う
 * @returns {{ flags: Record<string, string>, switches: Set<string>, positionals: string[] }}
 */
export function parseArgs(argv, valueFlags) {
  const takesValue = new Set(valueFlags);
  const flags = {};
  const switches = new Set();
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    if (takesValue.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        throw new Error(`${a} には値が要ります`);
      }
      flags[a] = v;
      i += 1;                 // 値を読み飛ばす
      continue;
    }
    switches.add(a);          // ★真偽値フラグ。次の語を食べない
  }
  return { flags, switches, positionals };
}

/**
 * 🔴 ★**本番に向けるとき `--yes-production` を要るか**（★2026-09-20）。
 *
 * 【★なぜ純関数にしたか】
 *   ⚠️ ★`migrate.mjs` に ★**下見（`--plan`）**を足したとき、★「`--yes-production` は要りません」と
 *     ★書いたのに、★**門がその手前で投げて動きませんでした。**
 *   🔴 ★原因は ★**試した場所**です: ★staging で試したので、★**門が効かない側でしか確かめていません**。
 *     → ★★**差が出ない環境で確かめて、★差が出る環境の話を書いた。**
 *   → ★**判定を関数に出して、★組み合わせを検査で回します**（★`migrate-guard.test.ts`）。
 *
 * ⚠️ ★免除するのは ★**何も書かない `--plan` だけ**です。
 *    ★`--baseline`（★記録を書く）や `--repair-checksum`（★記録を直す）と併せたら ★**免除しません**。
 */
export function needsYesProduction(envName, { plan = false, baseline = false, repair = false } = {}) {
  if (envName !== 'production') return false;
  if (plan && !baseline && !repair) return false;  // ★何も書かない
  return true;
}

/**
 * 🔴 ★**本番の世界を作り直してよいか**（★2026-09-20・運用簿 ④・レビュー側の裁定）。
 *
 * 【★なぜ旗 1 つでは足りないか】
 *   ⚠️ ★今日 `migrate.mjs --env production --yes-production` を打ちました。
 *     → ★★**次に打つ人は、★同じ指で `seed-world --env production --yes-production` を打ちます。**
 *     ★`migrate` は前へ進めるだけ。★`seed-world` は ★**世界を消します。★指は区別しません。**
 *
 * 【★だから「写せない物」を 1 つ 要求します】
 *   ★言葉の旗は ★**手順書から貼れます**。★★数は貼れません — ★**その場で数えないと合いません。**
 *   → ★★**`--expect-horses` が、★いまの実数と合わなければ通しません。**
 *     ★`verify-prod-exposure` の `--expect protected|open` と同じ形です。
 *
 * 🔴 ★**理由の文に、★いまの実数を書かないこと。**
 *   ★書くと ★**1 回 失敗して画面の数を写す**だけになり、★「見る」が起きません。
 *
 * 【★戻り値】★問題があれば ★**理由の文字列**、★無ければ `null`。
 *   ⚠️ ★**頭数が違うのは「間違い」ではなく「あなたの想定と違う」**ので、★呼ぶ側は
 *     ★**終了コード 2（判定不能）**で終わること（★1 ではない）。
 */
export function productionOptInProblem({
  environment, yesProduction = false, wipeWorld = false,
  expectHorses = null, actualHorses = null,
}) {
  if (environment !== 'production') return null;   // ★本番以外は、この関門を作らない
  if (!yesProduction) {
    return '本番の世界を作り直すには --yes-production が要ります'
      + '（★--env を書いただけでは、staging のつもりで production と打った場合を止められません）';
  }
  if (!wipeWorld) {
    return '本番では --wipe-world も要ります'
      + '（★migrate と同じ指で打てないように、★この道具だけの旗を 1 つ 立てさせます）';
  }
  if (!Number.isInteger(expectHorses)) {
    return '本番では --expect-horses <いまの頭数> が要ります'
      + '（★数は手順書から写せません。★その場で数えた人だけが通れます）';
  }
  if (!Number.isInteger(actualHorses)) {
    return 'いまの頭数を数えられませんでした（★数えられないなら通しません）';
  }
  if (expectHorses !== actualHorses) {
    // 🔴 ★**実数をここに書かないこと。**（★2026-09-20・レビュー側の指摘）
    //   ★書くと ★1 回 失敗して ★**画面の数を写す**だけになり、★手間が 1 往復 増えるだけです。
    //   ★★`--expect-horses` は「数を当てる」ためではなく ★**「数を見に行かせる」**ためです。
    return `--expect-horses ${expectHorses} と、いまの実数が違います`
      + '（★世界が想定と違います。★**間違いではなく「見てから来い」**です。'
      + '★実数はここには出しません）';
  }
  return null;
}

/**
 * 🔴 ★**本番の `pedigree_cache` を直してよいか**（★2026-09-21・簿 `PEDIGREE-CACHE-IDS-NOT-DB-IDS`）。
 *
 * 【★`productionOptInProblem` と ★**別の関数にした理由**】
 *   ★同じ形（★旗 2 つ ＋ 写せない数 1 つ）ですが、★**要求する数が違います**:
 *     ★`seed-world`  … ★いまの ★**頭数**（★世界を消すので、★世界の大きさを見せる）
 *     ★この道具      … ★いまの ★**壊れている頭数**（★直す対象の大きさを見せる）
 *   ⚠️ ★頭数を要求すると、★★**seed-world の手順書からそのまま写せてしまいます**。
 *     ★★「写せない数」という仕掛けは、★**他の道具と数が同じになった瞬間に死にます。**
 *
 * 【★2 つを歩調を合わせるのは ★**コードの共有ではなく検査**です】
 *   ★`apps/cli/test/migrate-guard.test.ts` が ★**両方の関門**に同じ 5 段を課します。
 *   ★片方に段を足して、★もう片方に足し忘れたら ★**そこで落ちます**。
 *
 * 【★戻り値】★問題があれば ★**理由の文字列**、★無ければ `null`。
 *   ⚠️ ★呼ぶ側は ★**終了コード 2（判定不能）**で終わること（★1 ではない）。
 * 🔴 ★**理由の文に、★いまの実数を書かないこと**（★書くと「見る」が起きません）。
 */
export function productionRepairOptInProblem({
  environment, yesProduction = false, repairFlag = false,
  expectBroken = null, actualBroken = null,
}) {
  if (environment !== 'production') return null;   // ★本番以外は、この関門を作らない
  if (!yesProduction) {
    return '本番の血統の写しを書き換えるには --yes-production が要ります'
      + '（★--env を書いただけでは、staging のつもりで production と打った場合を止められません）';
  }
  if (!repairFlag) {
    return '本番では --repair-pedigree も要ります'
      + '（★migrate や seed-world と同じ指で打てないように、★この道具だけの旗を 1 つ 立てさせます）';
  }
  if (!Number.isInteger(expectBroken)) {
    return '本番では --expect-broken <いまの壊れている頭数> が要ります'
      + '（★数は手順書から写せません。★その場で数えた人だけが通れます）';
  }
  if (!Number.isInteger(actualBroken)) {
    return 'いまの壊れている頭数を数えられませんでした（★数えられないなら通しません）';
  }
  if (expectBroken !== actualBroken) {
    // 🔴 ★**実数をここに書かないこと**（★2026-09-20・レビュー側の指摘と同じ）
    return `--expect-broken ${expectBroken} と、いまの実数が違います`
      + '（★世界が想定と違います。★**間違いではなく「見てから来い」**です。'
      + '★実数はここには出しません）';
  }
  return null;
}

/**
 * 🔴 ★**本番の `horses.name_key` を埋めてよいか**（★2026-09-22・PLAN I-3 段 2・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §3）。
 *
 *   ★上の 2 つと同じ形（★旗 2 つ ＋ 写せない数 1 つ）。★要求する数は ★**いま `name_key` が空の頭数**
 *   （★頭数でも壊れている頭数でもない — ★他の道具の手順書から写せないように）。
 *   ★歩調は ★`apps/cli/test/migrate-guard.test.ts` が 3 つの関門に同じ 5 段を課して合わせます。
 */
export function productionNameKeyOptInProblem({
  environment, yesProduction = false, backfillFlag = false,
  expectNull = null, actualNull = null,
}) {
  if (environment !== 'production') return null;   // ★本番以外は、この関門を作らない
  if (!yesProduction) {
    return '本番の馬名の正規化キーを書くには --yes-production が要ります'
      + '（★--env を書いただけでは、staging のつもりで production と打った場合を止められません）';
  }
  if (!backfillFlag) {
    return '本番では --backfill-name-key も要ります'
      + '（★migrate や seed-world と同じ指で打てないように、★この道具だけの旗を 1 つ 立てさせます）';
  }
  if (!Number.isInteger(expectNull)) {
    return '本番では --expect-null <いま name_key が空の頭数> が要ります'
      + '（★数は手順書から写せません。★その場で数えた人だけが通れます）';
  }
  if (!Number.isInteger(actualNull)) {
    return 'いま name_key が空の頭数を数えられませんでした（★数えられないなら通しません）';
  }
  if (expectNull !== actualNull) {
    // 🔴 ★**実数をここに書かないこと**
    return `--expect-null ${expectNull} と、いまの実数が違います`
      + '（★世界が想定と違います。★**間違いではなく「見てから来い」**です。'
      + '★実数はここには出しません）';
  }
  return null;
}

/**
 * 🔴 ★**本番の馬名を禁止名のリストで検査し直してよいか**（★2026-09-22・PLAN I-3・裁定 `ff7028c` §4-2）。
 *
 *   ★上の 3 つと同じ形（★旗 2 つ ＋ 写せない数 1 つ）。★要求する数は ★**いま未検査（`name_checked_with` が空）の頭数**
 *   （★他の道具の手順書から写せないように）。★歩調は `apps/cli/test/migrate-guard.test.ts` が 4 つの関門に同じ 5 段を課して合わせます。
 */
export function productionNameRecheckOptInProblem({
  environment, yesProduction = false, recheckFlag = false,
  expectUnchecked = null, actualUnchecked = null,
}) {
  if (environment !== 'production') return null;   // ★本番以外は、この関門を作らない
  if (!yesProduction) {
    return '本番の馬名を検査し直して記録するには --yes-production が要ります'
      + '（★--env を書いただけでは、staging のつもりで production と打った場合を止められません）';
  }
  if (!recheckFlag) {
    return '本番では --recheck-names も要ります'
      + '（★migrate や seed-world と同じ指で打てないように、★この道具だけの旗を 1 つ 立てさせます）';
  }
  if (!Number.isInteger(expectUnchecked)) {
    return '本番では --expect-unchecked <いま未検査の頭数> が要ります'
      + '（★数は手順書から写せません。★その場で数えた人だけが通れます）';
  }
  if (!Number.isInteger(actualUnchecked)) {
    return 'いま未検査の頭数を数えられませんでした（★数えられないなら通しません）';
  }
  if (expectUnchecked !== actualUnchecked) {
    // 🔴 ★**実数をここに書かないこと**
    return `--expect-unchecked ${expectUnchecked} と、いまの実数が違います`
      + '（★世界が想定と違います。★**間違いではなく「見てから来い」**です。'
      + '★実数はここには出しません）';
  }
  return null;
}

/**
 * ★**本番で馬名を戻す道具（`tools/reset-horse-name.mjs`）の関門**（★裁定 `REVIEW_NAME_RESET_TOOL_VERDICT_20260922.md` 骨組み）。
 *   ★旗 2 つ ＋ ★馬の ID を 2 回渡す（★写し間違いの 1 回で ★別の馬を書き換えない）。
 *   ⚠️ ★1 頭ずつ。★違っていても ★正しい ID は教えない（★打った人が見直す）。
 */
export function productionNameResetOptInProblem({
  environment, yesProduction = false, resetFlag = false, horse = null, expectHorse = null,
}) {
  if (environment !== 'production') return null;   // ★本番以外は、この関門を作らない
  if (!yesProduction) {
    return '本番の馬名を戻すには --yes-production が要ります'
      + '（★--env を書いただけでは、staging のつもりで production と打った場合を止められません）';
  }
  if (!resetFlag) {
    return '本番では --reset-name も要ります（★この道具だけの旗を 1 つ 立てさせます）';
  }
  if (typeof horse !== 'string' || horse.length === 0) return '--horse <馬の ID> が要ります';
  if (typeof expectHorse !== 'string' || expectHorse.length === 0) {
    return '本番では --expect-horse <同じ馬の ID をもう一度> が要ります（★写し間違いの 1 回で別の馬を書き換えないため）';
  }
  if (expectHorse !== horse) {
    return '--horse と --expect-horse が違います（★どちらが正しいかは教えません。★見直してから来てください）';
  }
  return null;
}
