/**
 * ★**画面が実際に使う時計が、共有部品から来ているか**（★2026-09-09・F-3・裁定 §2）
 *
 * 【★なぜ文字列検査では足りないと分かったか】
 *   ★第 2 便で ★`ratesForPolicy` を共有しました。★レビュー側が ★画面ソースの写しに対して
 *   ★時計を固定倍率へ差し替え、★`void ratesForPolicy(...)` だけを残したところ、
 *   ★**4 判定すべてが成功**しました。★名前は残るが ★**戻り値が時計に届いていない**形です。
 *
 * 【★なぜ「構文木で見る」だけでも足りなかったか（★2026-09-09・第 3 便で判明）】
 *   ⚠️ ★最初の版は ★引数を**取り出しておきながら**、★**個数が 3 であることしか見ていませんでした。**
 *      ★方針の式も ★`? 'legacy' : 'readable'` という**文字列があれば**通していました。
 *      ★レビュー側が当てた 4 つの変異が ★**すべて違反 0 件**で通りました:
 *        ★`!LEGACY_MOTION ? 'legacy' : 'readable'`          … ★条件に `!` を 1 文字足すだけ
 *        ★`raceClockFor(knots, DIST, (void RACE_PACE_POLICY, 'legacy'))`
 *        ★`raceClockFor(knots, 800, RACE_PACE_POLICY)`      … ★実際の距離を渡さない
 *        ★`straightMetersLeft: (homeStretchMetersOf(course), 400)`
 *   → ★**節点の種類と中身**で判定します。★文字列の一致では見ません
 *     （★引用符の種類や空白を仕様にしないためでもあります）。
 *
 * 【★この検査が自分で確かめること（★R-22）】
 *   ⚠️ ★見張りは ★**捕まえるべきものを捕まえられることを、自分で示す**こと。
 *   ★名指しされた壊し方を ★**その場で作って**、★落ちることを確かめます。
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

/** ★`raceClockFor` に渡すべき引数の形（★節点で見る・★文字列ではない） */
interface ExpectedArgs {
  /** ★第 2 引数（距離）… `'DIST'`（識別子）または `'built.DIST'`（属性参照） */
  readonly distance: { readonly kind: 'identifier' | 'property'; readonly text: string };
  /** ★第 3 引数（方針）… `'RACE_PACE_POLICY'`（識別子）または `'racePacePolicyOf'`（呼び出し） */
  readonly policy: { readonly kind: 'identifier' | 'call'; readonly text: string };
}

interface Wiring {
  /** ★`warp` の初期化子（★呼び出しでなければ `undefined`）*/
  readonly clockCall: ts.CallExpression | undefined;
  /** ★呼び出しでなかったときの原文（★報告用）*/
  readonly clockInitText: string | undefined;
  /** ★`RACE_PACE_POLICY` の初期化子 */
  readonly policyInit: ts.Expression | undefined;
  /** ★`straightMetersLeft` に渡している式 */
  readonly straightInit: ts.Expression | undefined;
  readonly sf: ts.SourceFile;
}

/**
 * ★構文木から ★**接続**を読む。
 * ⚠️ ★`grep` ではありません。★`warp` の初期化子が何であるかを見ます。
 */
function wiringOf(source: string, fileName: string): Wiring {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  let clockCall: ts.CallExpression | undefined;
  let clockInitText: string | undefined;
  let policyInit: ts.Expression | undefined;
  let straightInit: ts.Expression | undefined;
  let foundWarp = false;

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      if (node.name.text === 'warp' && !foundWarp) {
        foundWarp = true;
        if (ts.isCallExpression(node.initializer)) clockCall = node.initializer;
        else clockInitText = node.initializer.getText(sf).slice(0, 80);
      }
      if (node.name.text === 'RACE_PACE_POLICY') policyInit = node.initializer;
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'straightMetersLeft') {
      straightInit = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { clockCall, clockInitText, policyInit, straightInit, sf };
}

/** ★識別子 `name` そのものか（★カンマ式や括弧で包んだものは通しません）*/
const isIdent = (n: ts.Node | undefined, name: string): boolean =>
  n !== undefined && ts.isIdentifier(n) && n.text === name;
/** ★`obj.prop` そのものか */
const isProperty = (n: ts.Node | undefined, text: string): boolean => {
  if (n === undefined || !ts.isPropertyAccessExpression(n)) return false;
  const [obj, prop] = text.split('.');
  return isIdent(n.expression, obj ?? '') && n.name.text === prop;
};
/** ★`fn(...)` そのものか */
const isCallTo = (n: ts.Node | undefined, fn: string): n is ts.CallExpression =>
  n !== undefined && ts.isCallExpression(n) && isIdent(n.expression, fn);
/** ★文字列リテラル `value` そのものか（★引用符の種類は問いません）*/
const isStringLit = (n: ts.Node | undefined, value: string): boolean =>
  n !== undefined && ts.isStringLiteralLike(n) && n.text === value;

/**
 * ★接続の判定。★**戻り値が実際に時計として使われ、正しい入力から来ていること**を見ます。
 *
 * ⚠️ ★引数は ★**個数だけでなく式そのもの**を見ます（★2026-09-09・第 3 便の裁定 §1-1）。
 */
function violationsOf(
  w: Wiring, opts: { readonly expectPolicyTernary: boolean; readonly args: ExpectedArgs },
): string[] {
  const bad: string[] = [];
  const t = (n: ts.Node | undefined): string => (n === undefined ? '（無し）' : n.getText(w.sf).slice(0, 60));

  // ★① 時計は共有部品の戻り値そのものであること
  if (w.clockCall === undefined) {
    bad.push(`★時計が呼び出しではありません: ${w.clockInitText ?? '（warp の定義が見つからない）'}`);
  } else if (!isIdent(w.clockCall.expression, 'raceClockFor')) {
    bad.push(`★時計が共有部品から来ていません: ${t(w.clockCall.expression)}`);
  } else {
    const a = w.clockCall.arguments;
    if (a.length !== 3) bad.push(`★時計の引数が 3 つではありません: ${a.length}`);
    else {
      // ★② 局面の折れ点
      if (!isIdent(a[0], 'knots')) bad.push(`★第1引数が knots ではありません: ${t(a[0])}`);
      // ★③ ★**実際のレース距離**（★`800` のような定数を渡していないこと）
      const d = opts.args.distance;
      const okDistance = d.kind === 'identifier' ? isIdent(a[1], d.text) : isProperty(a[1], d.text);
      if (!okDistance) bad.push(`★第2引数が ${d.text} ではありません: ${t(a[1])}`);
      // ★④ ★**方針**（★カンマ式で参照だけ残して固定値を渡していないこと）
      const p = opts.args.policy;
      const okPolicy = p.kind === 'identifier' ? isIdent(a[2], p.text) : isCallTo(a[2], p.text);
      if (!okPolicy) bad.push(`★第3引数が ${p.text} ではありません: ${t(a[2])}`);
    }
  }

  // ★⑤ 方針の対応（★条件の否定・固定値・別の旗を通さない）
  if (opts.expectPolicyTernary) {
    const init = w.policyInit;
    if (init === undefined) bad.push('★RACE_PACE_POLICY がありません');
    else if (!ts.isConditionalExpression(init)) {
      bad.push(`★方針が条件式ではありません（固定値？）: ${t(init)}`);
    } else {
      if (!isIdent(init.condition, 'LEGACY_MOTION')) {
        bad.push(`★方針の条件が LEGACY_MOTION そのものではありません: ${t(init.condition)}`);
      }
      if (!isStringLit(init.whenTrue, 'legacy')) bad.push(`★真側が 'legacy' ではありません: ${t(init.whenTrue)}`);
      /**
       * ★**偽側は `'readable'`、★または `PACE_SHORT ? 'short' : 'readable'`**
       *   （★2026-09-12・`?pace=short` を足した）。
       * ⚠️ ★入れ子を無条件に許すと、★`LEGACY_MOTION ? 'legacy' : (何か)` が
       *    ★全部通ってしまいます。★**中身まで見ます**。
       */
      const f = init.whenFalse;
      if (ts.isConditionalExpression(f)) {
        if (!isIdent(f.condition, 'PACE_SHORT')) {
          bad.push(`★偽側の入れ子の条件が PACE_SHORT ではありません: ${t(f.condition)}`);
        }
        if (!isStringLit(f.whenTrue, 'short')) bad.push(`★短縮側が 'short' ではありません: ${t(f.whenTrue)}`);
        if (!isStringLit(f.whenFalse, 'readable')) bad.push(`★既定が 'readable' ではありません: ${t(f.whenFalse)}`);
      } else if (!isStringLit(f, 'readable')) {
        bad.push(`★偽側が 'readable' ではありません: ${t(f)}`);
      }
    }
  }

  // ★⑥ 直線長は ★式そのものが `homeStretchMetersOf(course)` であること
  const s = w.straightInit;
  if (s === undefined) bad.push('★straightMetersLeft がありません');
  else if (!isCallTo(s, 'homeStretchMetersOf') || s.arguments.length !== 1
    || !isIdent(s.arguments[0], 'course')) {
    bad.push(`★直線長が homeStretchMetersOf(course) そのものではありません: ${t(s)}`);
  }
  return bad;
}

const PAGE_ARGS: ExpectedArgs = {
  distance: { kind: 'identifier', text: 'DIST' },
  policy: { kind: 'identifier', text: 'RACE_PACE_POLICY' },
};
const AUDIT_ARGS: ExpectedArgs = {
  distance: { kind: 'property', text: 'built.DIST' },
  policy: { kind: 'call', text: 'racePacePolicyOf' },
};

describe('★画面の時計の接続（構文木で見る）', () => {
  it('★★画面は共有部品の戻り値をそのまま時計に使っている', () => {
    expect(violationsOf(wiringOf(readSrc(PAGE), 'page.tsx'),
      { expectPolicyTernary: true, args: PAGE_ARGS })).toEqual([]);
  });

  it('★★監査道具も同じ接続', () => {
    expect(violationsOf(wiringOf(readSrc(AUDIT), 'audit.mjs'),
      { expectPolicyTernary: false, args: AUDIT_ARGS })).toEqual([]);
  });

  /**
   * ★**この見張りが、名指しされた壊し方を捕まえること**（★R-22）
   *
   * ⚠️ ★製品ファイルは変更しません。★読み込んだ文字列に対して壊します。
   * ⚠️ ★★のうち ★**⑤〜⑧ は、第 3 便の裁定が「違反 0 件で通る」と示したもの**です。
   */
  describe('★見張りが壊れ方を捕まえる（★変異版・製品ファイルは無傷）', () => {
    const check = (from: string, to: string): string[] => {
      const src = readSrc(PAGE);
      expect(src, `変異のもとが見つかりません: ${from}`).toContain(from);
      return violationsOf(wiringOf(src.replace(from, to), 'page.tsx'),
        { expectPolicyTernary: true, args: PAGE_ARGS });
    };
    const CLOCK = 'const warp = raceClockFor(knots, DIST, RACE_PACE_POLICY);';
    /**
     * ⚠️ ★**方針が 3 通りになりました**（★2026-09-12・`?pace=short` を足した）。
     *    ★`LEGACY_MOTION ? 'legacy' : PACE_SHORT ? 'short' : 'readable'`
     *    ★ここは ★**変異のもと**なので、★製品の字面と一致していなければ検定が空回りします。
     */
    const POLICY = "LEGACY_MOTION ? 'legacy' : PACE_SHORT ? 'short' : 'readable'";
    const STRAIGHT = 'straightMetersLeft: homeStretchMetersOf(course)';

    it('★① 時計を固定倍率へ置換し、正しい名前を未使用呼出だけに残す', () => {
      expect(check(CLOCK,
        'void raceClockFor(knots, DIST, RACE_PACE_POLICY);\n'
        + '  const warp = timeWarpFor(knots, { cruise: 2, spurt: 2, straight: 2, goal: 1, start: 1 });',
      ).length).toBeGreaterThan(0);
    });

    it('★② 画面だけ legacy 固定にする（★方針を定数へ）', () => {
      expect(check(`const RACE_PACE_POLICY: RacePacePolicy = ${POLICY};`,
        "const RACE_PACE_POLICY: RacePacePolicy = 'legacy';").length).toBeGreaterThan(0);
    });

    it('★③ legacy / readable の対応を入れ替える', () => {
      expect(check(POLICY, "LEGACY_MOTION ? 'readable' : PACE_SHORT ? 'short' : 'legacy'").length)
        .toBeGreaterThan(0);
    });

    it('★④ 画面だけ直線長を 400 へ戻す', () => {
      expect(check(STRAIGHT, 'straightMetersLeft: 400').length).toBeGreaterThan(0);
    });

    it('★⑤ 条件に `!` を 1 文字足して対応を逆転する', () => {
      expect(check(POLICY, `!${POLICY}`).length).toBeGreaterThan(0);
    });

    it('★⑥ 方針変数への参照だけ残し、カンマ式で legacy 固定にする', () => {
      expect(check(CLOCK,
        "const warp = raceClockFor(knots, DIST, (void RACE_PACE_POLICY, 'legacy'));").length).toBeGreaterThan(0);
    });

    it('★⑦ 実際のレース距離を時計へ渡さない', () => {
      expect(check(CLOCK, 'const warp = raceClockFor(knots, 800, RACE_PACE_POLICY);').length).toBeGreaterThan(0);
    });

    it('★⑧ 走路関数を呼んで捨て、直線長は 400 を渡す', () => {
      expect(check(STRAIGHT,
        'straightMetersLeft: (homeStretchMetersOf(course), 400)').length).toBeGreaterThan(0);
    });
  });
});
