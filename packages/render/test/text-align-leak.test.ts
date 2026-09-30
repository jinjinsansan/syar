/**
 * ★**文字の寄せを 残したまま返さない**（★2026-09-30・オーナー「実況中継の文字があちこち被っていて見栄えが悪い」）。
 *
 * 【★見ている壊れ方】
 *   ★`ctx.textAlign` は 画布ぜんぶで 1 つ。★ある部品が `'center'` を残して返すと、★後から描く部品の文字がずれる。
 *   ★実例: ★リプレイの札（`drawFinishReplayBadge`）が中央寄せを残し、★実況の帯の文字が 川崎タカシの顔の上へずれ、
 *   ★名札の「実況」が消えていた（★リプレイの間だけ）。
 * → ★描く関数のうち `textAlign` を書くものは ★最後に `'left'` へ戻すか ★`save()`／`restore()` で囲む（★構文木で見る）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const FILES = [
  ...readdirSync(path.join(ROOT, 'packages/render/src')).filter((f) => f.endsWith('.ts')).map((f) => `packages/render/src/${f}`),
  'apps/web/src/app/race/page.tsx',
];

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
const isFn = (n: ts.Node): n is Fn => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);

/** ★寄せを残して返す関数（★ファイル名:行 関数名） */
export function leaksOf(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (isFn(n) && n.body !== undefined) {
      const assigns: string[] = [];
      const walk = (m: ts.Node): void => {
        if (m !== n && isFn(m)) return;
        if (ts.isBinaryExpression(m) && m.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isPropertyAccessExpression(m.left) && m.left.name.text === 'textAlign' && ts.isStringLiteral(m.right)) {
          assigns.push(m.right.text);
        }
        ts.forEachChild(m, walk);
      };
      walk(n.body);
      const body = n.body.getText(sf);
      const wrapped = /\.save\(\)/.test(body) && /\.restore\(\)/.test(body);
      if (assigns.length > 0 && assigns[assigns.length - 1] !== 'left' && !wrapped) {
        const name = ts.isFunctionDeclaration(n) && n.name !== undefined ? n.name.text
          : ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(sf) : '(無名)';
        out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${name}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('★文字の寄せを残したまま返さない', () => {
  it('🔴 描く関数は textAlign を左へ戻す（★または save/restore で囲む）', () => {
    const leaks = FILES.flatMap((f) => leaksOf(f, readFileSync(path.join(ROOT, f), 'utf8')));
    expect(leaks, '★寄せを残して返す関数（★後から描く帯の文字がずれる）').toEqual([]);
  });

  it('★対照: リプレイの札の「左へ戻す」を外すと 捕まる', () => {
    const f = 'packages/render/src/finish-replay.ts';
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    const i = src.indexOf("ctx.fillText(label, x + bar + (w - bar) / 2, y + h / 2 + px * 0.36);");
    expect(i, '★変異のもとが見つかりません').toBeGreaterThan(0);
    const j = src.indexOf("ctx.textAlign = 'left';", i);
    expect(j).toBeGreaterThan(i);
    const mutated = src.slice(0, j) + src.slice(j + "ctx.textAlign = 'left';".length);
    expect(leaksOf(f, mutated).some((l) => l.includes('drawFinishReplayBadge'))).toBe(true);
  });
});
