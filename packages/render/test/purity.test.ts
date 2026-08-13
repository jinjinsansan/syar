/**
 * ★§12.8 の分離が壊れていないことを**機械で**見る（メタテスト）
 *
 *   > レンダラだけを Web（Canvas 2D）と将来のモバイルで差し替えられるようにする。
 *
 *   ★この分離は「気をつける」では守れません（P3 の教訓）。
 *     レンダラ固有の語がコードに入った瞬間に落とします。
 *
 * 【★この検査そのもので2回間違えました。記録として残します】
 *   1. コメントを区別しなかったので、**「持ち込むな」と書いたコメント自体**で落ちた。
 *      ★禁止の理由を書けない検査は、書いた人にしか意味が分かりません。
 *   2. 直した版が**構文エラーでファイルごと落ち**、
 *      パッケージ全体では「7件 PASS」に見えていました。
 *      ★**検査が消えたのに、緑に見えた**。R-19（緑のまま縮む）そのものです。
 *      → だから下に「対象ファイルが実在する」と「対照」を置いています。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'packages', 'render', 'src');

/** ★レンダラ固有のもの。ここに入れたら §12.8 は崩れる */
const FORBIDDEN = [
  'CanvasRenderingContext2D',
  'document.',
  'window.',
  'HTMLCanvas',
  'requestAnimationFrame',
  'getContext',
  'react',
  'skia',
];

/**
 * ★**コメントを除いてから見ます。**
 *   ⚠️ ただし**除きすぎると何も見なくなる**ので、下の対照で確かめます。
 */
function stripComments(src: string): string {
  const block = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const line = new RegExp('//.*$', 'gm');
  return src.replace(block, ' ').replace(line, ' ');
}

describe('★§12.8 描画抽象化は、レンダラを知らない', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

  it('★対象ファイルが実在する（0件で通らない）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('★レンダラ固有の語がコードに入っていない', () => {
    const hits: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(join(SRC, f), 'utf8'));
      for (const word of FORBIDDEN) {
        if (code.includes(word)) hits.push(`${f}: ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('★対照: コメントを除いても、コードに入れば捕まる', () => {
    const inCode = stripComments('/* getContext と書いてよい */ const x = a.getContext("2d");');
    expect(inCode).toContain('getContext');
  });

  it('★対照: コメントの中の語は捕まえない', () => {
    const onlyComment = stripComments('/* getContext */ // window.foo\nconst y = 1;');
    expect(onlyComment).not.toContain('getContext');
    expect(onlyComment).not.toContain('window.');
  });

  it('★依存を持たない（package.json の dependencies が空）', () => {
    const pkgPath = join(process.cwd(), 'packages', 'render', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
