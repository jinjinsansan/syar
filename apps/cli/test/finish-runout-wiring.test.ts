/**
 * ★**線を越えた瞬間に速さが跳ばないこと**（★2026-09-12・★オーナー指摘⑦）
 *
 * 【★経緯】★オーナー評「★ゴール前はスピードを上げているのに ★**ゴール直前で遅くなります**。
 *   ★ゴールを通過するまで同じスピードで駆け抜けてください」。
 *
 *   ★`withFinishRunOut` は、★線を越えた馬を ★**決勝線の先へ自分で走らせます**。
 *   ★そのとき ★**その馬の通過時の速さ**（`speedOf`）を渡さないと、★保険の一定値
 *   ★`FINISH_RUNOUT_FALLBACK_MPS`（14 m/s）へ ★**1 コマで切り替わります**。
 *   ★実測（seed 42・勝馬 10 番）: ★**17.32 → 14.00 m/s ＝ −19%**。
 *
 * ⚠️ ★同じ不具合は ★**2026-08-28 にリプレイ側だけ直っていました**
 *    （★オーナー指摘「リプレイのゴール前で必ず 1 度がくっとする」）。
 *    ★**本編側に同じ直しが入らないまま 2 週間残りました。**
 *    ★「片方だけ直る」を止めるのがこの検査です。
 *
 * 【★なぜ文字列検査にしないか】
 *   ★`withFinishRunOut` という名前は残したまま第 7 引数だけ落とせます。
 *   → ★**節点で見ます**。★`visualAt` を作っている呼び出しすべてに、
 *     ★`finishSpeeds` を読む関数が渡されていることを確かめます。
 *
 * 【★この検査が自分で確かめること（★R-22）】
 *   ★見張りは ★**捕まえるべきものを捕まえられることを、自分で示す**こと。
 *   ★第 7 引数を落とした写しを作り、★**落ちること**を確かめます（★製品ファイルは変更しません）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { withFinishRunOut, FINISH_RUNOUT_FALLBACK_MPS } from '@star/render';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'apps/web/src/app/race/page.tsx';

/**
 * ★`visualAt` を作っている `withFinishRunOut` の呼び出しを拾い、
 *   ★第 7 引数が `finishSpeeds` を読んでいるかを返す。
 */
function auditVisualAt(source: string): { readonly calls: number; readonly offenders: readonly string[] } {
  const sf = ts.createSourceFile(PAGE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const offenders: string[] = [];
  let calls = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'visualAt'
      && node.initializer !== undefined) {
      const scan = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'withFinishRunOut') {
          calls += 1;
          const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          const speedOf = n.arguments[6];
          if (speedOf === undefined) { offenders.push(`${line} 行: ★第 7 引数（通過時の速さ）が無い`); }
          else if (!/finishSpeeds/.test(speedOf.getText(sf))) {
            offenders.push(`${line} 行: ★第 7 引数が finishSpeeds を読んでいない（${speedOf.getText(sf)}）`);
          }
        }
        ts.forEachChild(n, scan);
      };
      scan(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { calls, offenders };
}

describe('★ゴール線の前後で速さが跳ばない（配線）', () => {
  const source = readFileSync(path.join(ROOT, PAGE), 'utf8');

  it('★`visualAt` を作る呼び出しが 2 つある（★本編とリプレイ）', () => {
    /** ⚠️ ★0 件だと、下の検査は何も見ていません（★R-12） */
    expect(auditVisualAt(source).calls).toBe(2);
  });

  it('★本編もリプレイも「その馬の通過時の速さ」を渡している', () => {
    expect(auditVisualAt(source).offenders).toEqual([]);
  });

  /** ★R-22: ★壊した写しで落ちることを、この検査自身が示す */
  it('★第 7 引数を落とすと、この検査は落ちる', () => {
    const broken = source.replace(
      'FINISH_RUNOUT_FALLBACK_MPS, (gate) => built.finishSpeeds.get(gate));',
      'FINISH_RUNOUT_FALLBACK_MPS);',
    );
    expect(broken, '★写しが作れていない（★製品側の書き方が変わった）').not.toBe(source);
    expect(auditVisualAt(broken).offenders.length).toBeGreaterThan(0);
  });

  it('★`finishSpeeds` を別のものに差し替えても落ちる', () => {
    const broken = source.replace(
      '(gate) => built.finishSpeeds.get(gate));',
      '(gate) => 14);',
    );
    expect(broken).not.toBe(source);
    expect(auditVisualAt(broken).offenders.length).toBeGreaterThan(0);
  });
});

describe('★ランアウトそのもの（★速さが繋がること）', () => {
  const finishSec = 100;
  const at = [{ gate: 1, meters: 1600, w: 10, staminaRatio: 1 }];
  const metersAt = (raceSec: number, speedOf?: (g: number) => number | undefined): number =>
    withFinishRunOut(at, () => finishSec, raceSec, 1600, 0, FINISH_RUNOUT_FALLBACK_MPS, speedOf)[0]!.meters;

  it('★通過時の速さを渡せば、線の先でもその速さで進む', () => {
    const v = 17.32;
    const a = metersAt(finishSec + 1, () => v);
    const b = metersAt(finishSec + 2, () => v);
    expect(b - a).toBeCloseTo(v, 6);
  });

  /** ⚠️ ★渡さないと保険の値に切り替わる ＝ ★**オーナーが見た「がくっと遅くなる」** */
  it('★渡さないと保険の一定値になる（★これが指摘⑦の正体）', () => {
    const a = metersAt(finishSec + 1);
    const b = metersAt(finishSec + 2);
    expect(b - a).toBeCloseTo(FINISH_RUNOUT_FALLBACK_MPS, 6);
    expect(FINISH_RUNOUT_FALLBACK_MPS).toBeLessThan(17.32);
  });
});
