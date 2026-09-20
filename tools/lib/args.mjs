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
