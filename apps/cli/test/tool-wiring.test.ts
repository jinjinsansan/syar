/**
 * ★**手で回す道具が、必要な引数を渡していること**（★正典 **§18 LR-9**・条件 **GC-3**・2026-09-16）
 *
 * 【★なぜこの検査が要るか（実例）】
 *   ★`tools/settle-races.mjs` は `createPgStore(c, hash)` と呼んでおり、★**`epochMs` を渡していませんでした**。
 *   ★`pg-store.ts` は `epochMs` が無ければ ★**物語を 1 行も書きません**（★週が分からないまま 0 週で書かないため）。
 *   ⚠️ ★**純関数の検査も偽 DB の検査も、すべて緑でした。**
 *      ★「実装した」と「経路に繋がっている」は別です（D-037・R-28 の家族）。
 *   → ★**道具の側を、構文木で見ます。**
 *
 * 【★なぜ文字列の一致で書かないか】
 *   ★`grep` で `epochMs` を探すだけだと、★**コメントに書いてあるだけ**でも通ります。
 *   ★ここでは ★**`createPgStore(...)` の呼び出しの第 3 引数に、その名前の項がある**ことを構文木で見ます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');

/** ★`createPgStore` の呼び出しを構文木から拾い、第 3 引数のオブジェクトの鍵を返す */
function pgStoreOptionKeys(file: string): string[][] {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
  const found: string[][] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'createPgStore') {
      const third = node.arguments[2];
      if (third === undefined) {
        found.push([]);
      } else if (ts.isObjectLiteralExpression(third)) {
        found.push(third.properties
          .map((p) => (p.name !== undefined && ts.isIdentifier(p.name) ? p.name.text : ''))
          .filter((x) => x !== ''));
      } else {
        /** ★変数で渡している場合は鍵が読めない。★読めないことを「読めない」として出す */
        found.push(['(オブジェクトのリテラルではない)']);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

describe('★手で回す道具が引数を渡している（LR-9・GC-3）', () => {
  it('★`tools/settle-races.mjs` が createPgStore に epochMs を渡している', () => {
    const calls = pgStoreOptionKeys('tools/settle-races.mjs');
    expect(calls.length, '★createPgStore の呼び出しが見つからない').toBeGreaterThan(0);
    for (const keys of calls) {
      /**
       * ⚠️ ★**これが無いと、確定しても生涯の記録が 1 行も書かれません**（★2026-09-16 に踏んだ形）。
       */
      expect(keys, '★epochMs を渡していない（物語が書かれません）').toContain('epochMs');
    }
  });

  it('★本番のワーカー（main.ts）も渡している', () => {
    const calls = pgStoreOptionKeys('apps/worker/src/main.ts');
    expect(calls.length).toBeGreaterThan(0);
    for (const keys of calls) expect(keys).toContain('epochMs');
  });

  it('★道具が環境ファイルから週の起点を読んでいる（★値を直書きしていない）', () => {
    const src = readFileSync(path.join(ROOT, 'tools/settle-races.mjs'), 'utf8');
    /** ★`STAR_EPOCH_ISO` から作る（★本番のワーカー `env.ts` と同じ出どころ） */
    expect(src).toMatch(/STAR_EPOCH_ISO/);
    /** ★起点をその場の数字で書いていない（★ワーカーと違う週になる） */
    expect(src).not.toMatch(/epochMs:\s*\d/);
  });

  it('★物語を書かない条件が「epochMs が無いとき」だけであること（★黙って 0 週で書かない）', () => {
    const src = readFileSync(path.join(ROOT, 'apps/worker/src/pg-store.ts'), 'utf8');
    expect(src).toMatch(/if \(epochMs !== undefined\)/);
    expect(src).toMatch(/writeRaceStory/);
  });
});
