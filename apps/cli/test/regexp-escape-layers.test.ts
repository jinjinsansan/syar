/**
 * ★**`new RegExp('...\b...')` — ★文字列リテラルの中の 1 本の `\b` はバックスペースです**
 *   （★CK-1 の家族・2026-09-19）
 *
 * 【🔴 ★同じ形を今日もう一度踏みました】
 *   ★正規表現を ★**文字列**で組むとき、★`\b`（単語境界）は ★**`\\b` と書かねばなりません**。
 *   ★1 本だと JS が ★**バックスペース（U+0008）**に変え、★正規表現は ★**何にも一致しません**。
 *   ★`/\bband\b/` を書いたつもりが `/\x08band\x08/` になっていた 6 か所（2026-09-18）が原形で、
 *   ★2026-09-19 にも ★**同じことを 2 回**やりました
 *     ① `apps/cli/test/lib/sql-source.ts` の `new RegExp(\`create\\s+...\`)`
 *     ② 手元の測定スクリプト（★「grant が 0 件」という**誤った測定**を出しました）
 *
 * 🔴 ★**`tools/scan-control-chars.mjs` では捕まりません。**
 *    ★ファイルの中身は正しい 2 文字（`\` と `b`）で、★バックスペースになるのは
 *    ★**JS が読んだ後**だからです。★だから ★**ここで見ます**。
 *
 * 【★何を見るか】
 *   ★`RegExp(` の引数の中に、★**奇数本のバックスラッシュ ＋ `b`/`f`/`v`/`0`** があること。
 *   ⚠️ ★正規表現リテラル（`/\b/`）は対象外です — ★そちらは 1 本で正しい。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
/**
 * ⚠️ ★**自分たちのソースだけを見ます。**
 *    ★リポジトリの直下には ★`.tmp-headless-contest/` のような
 *    ★**ブラウザのプロファイル**（★拡張機能の他社コード）が残っており、
 *    ★そこを読むと ★**他人のコードで赤になります**（★実際になりました）。
 */
const ROOTS = ['apps', 'packages', 'tools'];
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'coverage', 'tmp']);
const EXT = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.cjs']);

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e) || e.startsWith('.')) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (EXT.has(path.extname(e))) acc.push(p);
  }
  return acc;
}

/**
 * ★**註記を同じ長さの空白にする**（★位置を保つ）。
 * ⚠️ 🔴 ★これが無いと、★**この検査自身の説明文**を拾います（★CK-1 とまったく同じ形。
 *    ★実際に 1 回踏みました）。★文字列の中の `//` は註記ではないので、引用符を数えます。
 */
function blankComments(src: string): string {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k += 1) if (src[k] !== '\n') out[k] = ' ';
      i = stop;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * ★`RegExp(` の引数の範囲を、★括弧を数えて切り出す。
 * ⚠️ ★**文字列の中の括弧は数えません**（★`'( )'` で崩れないように）。
 */
function regexpArgs(src: string): readonly { readonly text: string; readonly index: number }[] {
  const out: { text: string; index: number }[] = [];
  const re = /\bRegExp\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote: string | null = null;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i]!;
      if (quote !== null) {
        if (c === '\\') { i += 2; continue; }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') { quote = c; }
      else if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      i += 1;
    }
    out.push({ text: src.slice(start, i - 1), index: start });
  }
  return out;
}

/**
 * ★奇数本のバックスラッシュ ＋ 危ない 1 文字。
 *
 * 【★2 種類の壊れ方】★どちらも ★**落ちずに、静かに間違える**
 *   ① ★`\b` `\f` `\v` `\0` … ★**別の文字になる**（★`\b` はバックスペース U+0008）
 *   ② ★`\s` `\S` `\d` `\D` `\w` `\W` `\B` … ★**バックスラッシュが消える**
 *      （★`'\s'` は JS では ただの `s`。★`create\s+view` が `creates+view` になります）
 *   ✔ ★**②を入れたのは、★①だけの版が実物の変異を捕まえられなかったから**です
 *     （★2026-09-19 に対照で確かめました。★`sql-source.ts` の `\\s` を `\s` に戻しても緑でした）。
 *
 * ⚠️ ★`\n` `\r` `\t` は ★**外します** — ★文字列でも正規表現でも同じ文字を意味し、害がありません。
 */
const ODD_ESCAPE = /(^|[^\\])(\\\\)*\\([bBsSdDwWfv0])/;

describe('★正規表現を文字列で組むときのエスケープ', () => {
  const files = ROOTS.flatMap((r) => sources(path.join(ROOT, r)));

  it('★走査が空振りしていない（R-21）', () => {
    expect(files.length, '★ソースを 1 つも読めていない').toBeGreaterThan(100);
    /** ★`RegExp(` を使っている所が実際にあること（★無ければこの検査は恒真） */
    const withRe = files.filter((f) => regexpArgs(blankComments(readFileSync(f, 'utf8'))).length > 0);
    expect(withRe.length, '★RegExp( を使っている所が 1 つも無い').toBeGreaterThan(3);
  });

  it('🔴 ★`RegExp(...)` の中に、1 本だけの `\\b` / `\\f` / `\\v` / `\\0` が無い', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = blankComments(readFileSync(f, 'utf8'));
      for (const a of regexpArgs(src)) {
        if (!ODD_ESCAPE.test(a.text)) continue;
        const line = src.slice(0, a.index).split('\n').length;
        bad.push(`${path.relative(ROOT, f).split(path.sep).join('/')}:${line}  ${a.text.slice(0, 80)}`);
      }
    }
    expect(
      bad,
      '🔴 ★`RegExp(...)` に渡す**文字列**の中では、バックスラッシュを 2 本書いてください。\n'
      + '   ★`\\b` → バックスペース U+0008（★何にも一致しない）／★`\\s` → ただの `s`（★別物に一致する）。\n'
      + '   ★どちらも**落ちずに静かに間違えます**:\n  ' + bad.join('\n  '),
    ).toEqual([]);
  });

  it('★この検査が本当に噛む（★わざと壊した文字列を見せる）', () => {
    /**
     * ⚠️ ★「0 件」は ★**何も見ていなくても 0 件**です（R-21）。
     *    ★検出器そのものに、★**壊れた形と正しい形**を通します。
     */
    /** ⚠️ ★`'\\\\b'` と書くと、★調べる対象の文字列は ★**バックスラッシュ 1 本 ＋ b**（★壊れた形） */
    expect(ODD_ESCAPE.test('grant[^;]*\\bselect'), '★壊れた形を見逃す').toBe(true);
    expect(ODD_ESCAPE.test('`create\\\\s+\\\\bfoo\\\\b`'), '★正しい形を誤検出').toBe(false);
    expect(ODD_ESCAPE.test('`create\\\\s+or`'), '★s は対象外').toBe(false);
  });
});
