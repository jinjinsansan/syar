/**
 * ★ソースに NUL バイトが混ざっていないこと（2026-08-20 の実害から）
 *
 * 【何が起きたか】
 *   `tools/verify-anon-exposure.mjs` の**スペース2文字が NUL バイトになっていました。**
 *
 *     const key = `${g.table_name}\x00${g.grantee}`;   // 本来はスペース
 *     const [name, grantee] = key.split('\x00');       // 同上
 *
 *   ★**区切り文字として一貫していたため、ツールは正しく動きました。**
 *     出力も期待どおりで、実行しても試験しても気づけません。
 *     見つかったのは `grep` が「Binary file matches」と言ったからで、**偶然です。**
 *
 * 【なぜ番人を置くか】
 *   ・**動くので気づけない** — 実行結果でも単体試験でも検出できない種類の破損です
 *   ・**次に触る人が壊す** — 見えない文字なので、編集のたびに増減しても分かりません
 *   ・この案件は **V: ドライブが「デバイスの準備ができていません」状態**になった直後です。
 *     同種の破損が他にも起きうる前提で置きます
 *
 * ★「動いているから正しい」は、この案件が繰り返し否定してきたものです（R-16 / D-054）。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** 中身がバイナリのもの。NUL があって当然なので走査しない */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|zip|mp4|webm|pdf|woff2?|ttf|otf|tsbuildinfo)$/i;

/**
 * ★既知の例外は、名前で明示する（登録簿方式）。
 *   `docs/MEASURE_V10_LAMBDA60_100RACES.txt` は P2 の測定ダンプ（`0b9f66f`）で、
 *   **当時の実測の証拠**です。中身を書き換えると証拠でなくなるので、そのまま残します。
 *   ⚠️ ここに足すのは「証拠として保存する生成物」だけ。**ソースを足さないこと。**
 */
const ALLOWED_WITH_NUL = ['docs/MEASURE_V10_LAMBDA60_100RACES.txt'];

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.length > 0);
}

describe('ソースの健全性', () => {
  it('★追跡中のテキストファイルに NUL バイトが無い', () => {
    const offenders: string[] = [];
    for (const f of trackedFiles()) {
      if (BINARY_EXT.test(f) || ALLOWED_WITH_NUL.includes(f)) continue;
      let buf: Buffer;
      try {
        buf = readFileSync(`${ROOT}${f}`);
      } catch {
        continue;   // 読めないもの（symlink 等）は対象外
      }
      const n = buf.filter((b) => b === 0).length;
      if (n > 0) offenders.push(`${f}（NUL ${n} 個）`);
    }
    expect(
      offenders,
      `★NUL バイトが混ざっています。見えない文字なので、実行しても試験しても気づけません:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★検出器が鈍っていないこと（R-14: 実際に NUL を含む列を検出できる）', () => {
    const withNul = Buffer.from('const a = `x\0y`;', 'utf8');
    expect(withNul.filter((b) => b === 0).length).toBe(1);
    const clean = Buffer.from('const a = `x y`;', 'utf8');
    expect(clean.filter((b) => b === 0).length).toBe(0);
  });

  it('例外簿に載せてよいのは生成物だけ（ソースを逃がさない）', () => {
    for (const f of ALLOWED_WITH_NUL) {
      expect(/\.(ts|tsx|mjs|js|sql|json|css)$/.test(f), `★ソースを例外簿に入れています: ${f}`).toBe(false);
    }
  });

  /**
   * ★**註釈に別字が混ざる**（2026-08-29 の実害・47 箇所）
   *
   *   NUL とは別種です。★**どれも「読める字」なので、目でも試験でも通ります。**
   *   実害の中心は **芝 → U+82DD**（38 箇所）でした。★`grep 芝` が**芝の註記を 38 件取り逃します**。
   *   ★「芝は 1 画素も変えていない」という保証そのものが、検索で見つからない字で書かれていました。
   *
   * ⚠️ ★**これは列挙です。必ず漏れます**（R-29）。実際、5 種を直した直後に
   *    **6 種目（蹄 → 蹴）を目で見つけました。** ★**防壁ではなく、再発の目印**として置きます。
   *    ★恒久の形（使ってよい漢字の登録簿にして、既定を閉じる）は
   *    **共通土台に触るので単独の便**とし、`QUESTIONS_P4_SOURCE_KANJI_20260829.md` で照会しています。
   */
  /**
   * ⚠️ ★**別字そのものをこのファイルに書きません。** 書くと**検出器が自分自身を検出して落ちます**
   *    （実際に落ちました）。★除外簿で逃がすと、逃がした先が次の温床になります（R-29）。
   *    → ★**コードポイントから組み立てます。** こうすると除外簿が要りません。
   */
  const KNOWN_WRONG: readonly { readonly cp: number; readonly meant: string }[] = [
    { cp: 0x82dd, meant: '芝' },
    { cp: 0x697a, meant: '楕' },
    { cp: 0x780a, meant: '砂' },
    { cp: 0x868a, meant: '蹴' },
    { cp: 0x9451, meant: '（文ごと書き直し）' },
  ].map((x) => ({ ...x }));

  it('★過去に混ざった別字が戻ってきていない（★目印であって防壁ではない）', () => {
    const offenders: string[] = [];
    for (const f of trackedFiles()) {
      if (!/\.(ts|tsx|mjs|js|md)$/.test(f)) continue;
      let text: string;
      try {
        text = readFileSync(`${ROOT}${f}`, 'utf8');
      } catch {
        continue;
      }
      for (const { cp, meant } of KNOWN_WRONG) {
        const n = text.split(String.fromCodePoint(cp)).length - 1;
        if (n > 0) offenders.push(`${f}: U+${cp.toString(16).toUpperCase()} を ${n} 個（${meant} のはず）`);
      }
    }
    expect(
      offenders,
      `★註釈に別字が混ざっています。★読める字なので目では気づけません:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★検出器が鈍っていないこと（R-14: 実際に別字を含む列を検出できる）', () => {
    const hit = (s: string): boolean =>
      KNOWN_WRONG.some(({ cp }) => s.includes(String.fromCodePoint(cp)));
    // ★汚れた列も**組み立てて**作る（このファイルに別字を置かないため）
    expect(hit(`/** ${String.fromCodePoint(0x82dd)}の板 */`)).toBe(true);
    expect(hit('/** 芝の板 */')).toBe(false);
    // ★正しい字を誤検出しない（芝・楕・砂・蹴 が素通りすること）
    expect(hit('芝 楕円 砂煙 蹴り出し 蹄')).toBe(false);
  });
});
