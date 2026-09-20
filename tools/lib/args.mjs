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
    return `--expect-horses ${expectHorses} と、いまの実数 ${actualHorses} が違います`
      + '（★世界が想定と違います。★**間違いではなく「見てから来い」**です）';
  }
  return null;
}
