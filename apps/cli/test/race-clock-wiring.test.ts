/**
 * ★**画面が実際に使う時計が、共有部品から来ているか**（★2026-09-09・F-3・裁定 §2）
 *
 * 【★なぜ文字列検査では足りないと分かったか】
 *   ★前の便で ★`ratesForPolicy` を共有しました。★レビュー側が ★画面ソースの写しに対して
 *   ★時計を固定倍率へ差し替え、★`void ratesForPolicy(...)` だけを残したところ、
 *   ★**4 判定すべてが成功**しました。★名前は残るが ★**戻り値が時計に届いていない**形です。
 *
 * 【★どう見るか】
 *   ★TypeScript の構文木で ★**`warp` に代入される式そのもの**を見ます。
 *   ★「名前がどこかにある」ではなく ★「★**実際に使われる値がどこから来たか**」を見ます。
 *
 * 【★この検査が自分で確かめること（★R-22）】
 *   ⚠️ ★見張りは ★**捕まえるべきものを捕まえられることを、自分で示す**こと。
 *   ★裁定が挙げた 3 つの壊し方を ★**その場で作って**、★落ちることを確かめます。
 *   ★製品ファイルは変更しません（★文字列の写しに対して行います）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'apps/web/src/app/race/page.tsx';
const AUDIT = 'tools/lib/race-audit-build.mjs';
const readSrc = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

interface Wiring {
  /** ★`warp` に代入される式が呼んでいる関数名（★式そのもの・名前の出現ではない）*/
  readonly clockCallee: string | undefined;
  /** ★その呼び出しの引数（★原文のまま）*/
  readonly clockArgs: readonly string[];
  /** ★`RACE_PACE_POLICY` の定義式（★原文のまま）*/
  readonly policyInit: string | undefined;
  /** ★`straightMetersLeft` に渡している式（★原文のまま）*/
  readonly straightArg: string | undefined;
}

/**
 * ★構文木から ★**接続**を読む。
 * ⚠️ ★`grep` ではありません。★`warp` の初期化子が何であるかを見ます。
 */
function wiringOf(source: string, fileName: string): Wiring {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  let clockCallee: string | undefined;
  let clockArgs: readonly string[] = [];
  let policyInit: string | undefined;
  let straightArg: string | undefined;
  const text = (n: ts.Node): string => n.getText(sf);

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      if (node.name.text === 'warp' && clockCallee === undefined) {
        const init = node.initializer;
        // ★呼び出しでなければ `undefined` のまま＝違反（★固定倍率の直渡しなど）
        if (ts.isCallExpression(init)) {
          clockCallee = text(init.expression);
          clockArgs = init.arguments.map(text);
        } else {
          clockCallee = `（呼び出しではない: ${text(init).slice(0, 60)}）`;
        }
      }
      if (node.name.text === 'RACE_PACE_POLICY') policyInit = text(node.initializer);
    }
    if (ts.isPropertyAssignment(node) && text(node.name) === 'straightMetersLeft') {
      straightArg = text(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { clockCallee, clockArgs, policyInit, straightArg };
}

/** ★接続の判定。★**戻り値が実際に時計として使われていること**を見ます */
function violationsOf(w: Wiring, opts: { readonly expectPolicyTernary: boolean }): string[] {
  const bad: string[] = [];
  if (w.clockCallee !== 'raceClockFor') {
    bad.push(`★時計が共有部品から来ていません: ${w.clockCallee ?? '（warp の定義が見つからない）'}`);
  }
  if (w.clockArgs.length !== 3) bad.push(`★時計の引数が 3 つではありません: ${w.clockArgs.length}`);
  if (opts.expectPolicyTernary) {
    if (w.policyInit === undefined) bad.push('★RACE_PACE_POLICY がありません');
    else {
      // ★legacy / readable の対応が逆転していないこと
      if (!/\?\s*'legacy'\s*:\s*'readable'/.test(w.policyInit)) {
        bad.push(`★方針の対応が想定と違います: ${w.policyInit}`);
      }
    }
  }
  if (w.straightArg === undefined) bad.push('★straightMetersLeft がありません');
  else if (!/homeStretchMetersOf\s*\(/.test(w.straightArg)) {
    bad.push(`★直線長が走路から来ていません: ${w.straightArg}`);
  }
  return bad;
}

describe('★画面の時計の接続（構文木で見る）', () => {
  it('★★画面は共有部品の戻り値をそのまま時計に使っている', () => {
    expect(violationsOf(wiringOf(readSrc(PAGE), 'page.tsx'), { expectPolicyTernary: true })).toEqual([]);
  });

  it('★★監査道具も同じ接続', () => {
    expect(violationsOf(wiringOf(readSrc(AUDIT), 'audit.mjs'), { expectPolicyTernary: false })).toEqual([]);
  });

  /**
   * ★**この見張りが、裁定の挙げた 3 つの壊し方を捕まえること**（★R-22）
   *
   * ⚠️ ★製品ファイルは変更しません。★読み込んだ文字列に対して壊します。
   */
  describe('★見張りが壊れ方を捕まえる（★変異版・製品ファイルは無傷）', () => {
    const mutate = (from: string, to: string): Wiring => {
      const src = readSrc(PAGE);
      expect(src, `変異のもとが見つかりません: ${from}`).toContain(from);
      return wiringOf(src.replace(from, to), 'page.tsx');
    };

    it('★① 時計を固定倍率へ置換し、正しい名前を未使用呼出だけに残す', () => {
      const w = mutate(
        'const warp = raceClockFor(knots, DIST, RACE_PACE_POLICY);',
        'void raceClockFor(knots, DIST, RACE_PACE_POLICY);\n'
        + '  const warp = timeWarpFor(knots, { cruise: 2, spurt: 2, straight: 2, goal: 1, start: 1 });',
      );
      expect(violationsOf(w, { expectPolicyTernary: true }).length).toBeGreaterThan(0);
    });

    it('★② 画面だけ legacy 固定にする', () => {
      const w = mutate(
        "const RACE_PACE_POLICY: RacePacePolicy = LEGACY_MOTION ? 'legacy' : 'readable';",
        "const RACE_PACE_POLICY: RacePacePolicy = 'legacy';",
      );
      expect(violationsOf(w, { expectPolicyTernary: true }).length).toBeGreaterThan(0);
    });

    it('★③ legacy / readable の対応を逆転する', () => {
      const w = mutate(
        "LEGACY_MOTION ? 'legacy' : 'readable'",
        "LEGACY_MOTION ? 'readable' : 'legacy'",
      );
      expect(violationsOf(w, { expectPolicyTernary: true }).length).toBeGreaterThan(0);
    });

    it('★④ 画面だけ直線長を 400 へ戻す', () => {
      const w = mutate('straightMetersLeft: homeStretchMetersOf(course)', 'straightMetersLeft: 400');
      expect(violationsOf(w, { expectPolicyTernary: true }).length).toBeGreaterThan(0);
    });
  });
});
