/**
 * ★**引数の取りこぼしを黙って既定値で走らせない**（★2026-09-17・V-10 の測定で踏んだ事故）
 *
 * 【★何が起きたか】
 *   ★オーナーが PowerShell から `npm run verify:pmin -- --races 40` を実行した。
 *   ★**PowerShell が `--` を自分のパラメータ終端記号として落とし**、npm には
 *   ★`npm run verify:pmin --races 40` が渡り、★npm が `--races` を**自身の設定**として食べ、
 *   ★道具に届いたのは **`40` という位置引数ひとつだけ**だった。
 *   → ★`RACES` は既定の **100** に落ち、★**40 レースのつもりが 100 レース**（所要 3 倍以上）で走り出した。
 *
 * 【★これは 2026-08-20 の本番事故と同じ形】
 *   ★`tools/lib/args.mjs` の冒頭にあるとおり、★あのときも
 *   ★**「引数が消えて、既定の**広い**動作に落ちる」**方向に壊れた（★本番に指定していない移行が当たった）。
 *   ★**狭くなるなら気づく。広くなると黙って余計に効く。**
 *
 * 【★この道具がすること】
 *   ★**知らない引数が 1 つでもあれば、走る前に投げる。**
 *   ★位置引数も、知らない `--` フラグも、値の無い値フラグも、すべて止める。
 *   ⚠️ ★**既定値に落として走り続けない**のが要点です（★R-21「読み取れない量で判定しない」の家族）。
 */

export interface CliSpec {
  /** ★値を取るフラグ（★`--races 40` の形） */
  readonly valueFlags: readonly string[];
  /** ★値を取らないフラグ（★`--legacy-conditions` の形）。★次の語を食べない */
  readonly switches: readonly string[];
}

/**
 * ★引数を検算する。★知らないものがあれば ★**走る前に**投げる。
 *
 * @param argv `process.argv.slice(2)` 相当
 * @param spec 知っているフラグ
 * @param tool 道具の名前（★エラーに出す。★どの道具の話か分かるように）
 */
export function assertKnownArgs(argv: readonly string[], spec: CliSpec, tool: string): void {
  const takesValue = new Set(spec.valueFlags);
  const isSwitch = new Set(spec.switches);
  const known = [...spec.valueFlags, ...spec.switches].join(' ');
  /**
   * ★**シェルによっては `--` が落ちます。** ★そのときは npm がフラグを食べ、
   * ★値だけが位置引数として残ります（★まさにこの事故）。★案内を添えます。
   */
  const hint = `★${tool} は \`npx tsx\` で直接呼んでください（★\`npm run\` 経由は、シェルによっては \`--\` が落ちてフラグが消えます）。`
    + `\n★知っているフラグ: ${known}`;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      throw new Error(
        `${tool}: ★引数「${a}」を読み取れませんでした（★位置引数は受け取りません）。\n${hint}`,
      );
    }
    if (takesValue.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        throw new Error(`${tool}: ★${a} には値が要ります。\n${hint}`);
      }
      i += 1; // ★値を読み飛ばす（★次の語を位置引数と誤らない）
      continue;
    }
    if (isSwitch.has(a)) continue; // ★真偽値フラグ。★次の語を食べない
    throw new Error(`${tool}: ★知らないフラグ「${a}」です。\n${hint}`);
  }
}
