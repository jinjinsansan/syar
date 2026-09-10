/**
 * ★**画面が実際に使う配置が、共有部品から来ているか**（★2026-09-10・F-G1 / F-G2 / F-G4）
 *
 * ★指示書 §5「数値・接続」:
 *   ★「本文に関数名がある」だけでなく、★**通常のロード経路から実際に配置関数へ届く**検査を行う。
 *   ★`?dev=1` だけ直って既定画面は旧処理、★という状態を防ぐ。
 *
 * 【★何を見るか】★節点の種類と中身で見る。★文字列の一致では見ない（★第 3 便の教訓）。
 *   ★① コマの物差し（`referenceHeight`）が ★**配置関数の戻り値**から来ている
 *      （★掛け算でその場で作っていない ＝ ★コマ別拡縮が復活していない）
 *   ★② 浮き（`bodyLiftSourcePx`）が ★**配置関数の戻り値**から来ている（★固定表に戻っていない）
 *   ★③ 較正値（`calibration`）が ★**素材から引く関数**の呼び出しである（★定数を直に置いていない）
 *   ★④ 1 完歩が ★**較正値**から来ている（★数値や旧定数に戻っていない）
 *   ★⑤ 配置の決め方が ★**URL の引数で分岐していない**（★既定の画面が旧処理に落ちない）
 *
 * 【★この検査が自分で確かめること（★R-22）】
 *   ★上の 5 つそれぞれについて ★**壊し方をその場で作り**、★落ちることを確かめる。
 *   ★製品ファイルは変更しない（★文字列の写しに対して行う）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'apps/web/src/app/race/page.tsx';
const source = readFileSync(path.join(ROOT, PAGE), 'utf8');

const parse = (src: string): ts.SourceFile =>
  ts.createSourceFile(PAGE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
};

const propName = (p: ts.PropertyAssignment): string =>
  ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';

/** ★1 コマぶんのフレーム（★`bodyLiftSourcePx` を持つ物）だけを拾う */
function frameLiterals(sf: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const out: ts.ObjectLiteralExpression[] = [];
  walk(sf, (n) => {
    if (!ts.isObjectLiteralExpression(n)) return;
    const names = n.properties.filter(ts.isPropertyAssignment).map(propName);
    if (names.includes('bodyLiftSourcePx') && names.includes('referenceHeight')) out.push(n);
  });
  return out;
}

const initOf = (lit: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined =>
  lit.properties.filter(ts.isPropertyAssignment).find((p) => propName(p) === name)?.initializer;

/** ★`x.y` の形で、★`y` が指定の名前であること（★掛け算・呼び出し・定数は通さない） */
const isPropertyRead = (e: ts.Expression | undefined, member: string): boolean =>
  e !== undefined && ts.isPropertyAccessExpression(e) && e.name.text === member;

function violationsOf(src: string): string[] {
  const sf = parse(src);
  const bad: string[] = [];

  /** ★前提: ★フレームを組んでいる箇所が 2 つある（★焼いた経路と原版経路・★R-11） */
  const frames = frameLiterals(sf);
  if (frames.length !== 2) bad.push(`フレームの組み立てが 2 か所ではない: ${frames.length}`);

  frames.forEach((lit, i) => {
    const ref = initOf(lit, 'referenceHeight');
    if (!isPropertyRead(ref, 'referenceHeight')) {
      bad.push(`① コマ${i + 1}: 物差しが配置関数の戻り値でない: ${ref?.getText() ?? '(無し)'}`);
    }
    const lift = initOf(lit, 'bodyLiftSourcePx');
    if (!isPropertyRead(lift, 'bodyLiftSourcePx')) {
      bad.push(`② コマ${i + 1}: 浮きが配置関数の戻り値でない: ${lift?.getText() ?? '(無し)'}`);
    }
  });

  /** ★③ 較正値は素材から引く関数の呼び出し */
  let calibrationSeen = 0;
  walk(sf, (n) => {
    if (!ts.isPropertyAssignment(n) || propName(n) !== 'calibration') return;
    calibrationSeen += 1;
    const init = n.initializer;
    if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)
      || init.expression.text !== 'horseCalibrationFor') {
      bad.push(`③ 較正値が素材から引かれていない: ${init.getText().slice(0, 60)}`);
    }
  });
  if (calibrationSeen === 0) bad.push('③ 較正値の指定が見つからない');

  /** ★④ 1 完歩は較正値から（★`?? calibration.strideM` の形） */
  let strideSeen = 0;
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== 'strideM') return;
    strideSeen += 1;
    const init = n.initializer;
    const right = init !== undefined && ts.isBinaryExpression(init)
      && init.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ? init.right : undefined;
    if (!isPropertyRead(right, 'strideM')) {
      bad.push(`④ 1 完歩が較正値から来ていない: ${init?.getText() ?? '(無し)'}`);
    }
  });
  if (strideSeen === 0) bad.push('④ 1 完歩の指定が見つからない');

  /** ★⑤ 配置の決め方が URL の引数で分岐していない */
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name)) return;
    if (n.name.text !== 'sideMode' && n.name.text !== 'frontMode') return;
    const text = n.initializer?.getText() ?? '';
    /**
     * ⚠️ ★`.get(` では見ない。★目録の対応表（`bakedPrefixByRole.get(...)`）まで拾ってしまう。
     *    ★見るのは ★**URL を読んでいるか**。
     */
    if (/URLSearchParams|window\.location|location\.search/.test(text)) {
      bad.push(`⑤ ${n.name.text} が URL の引数で分岐している`);
    }
  });

  /**
   * ★⑦ 配置関数へ渡す ★**決め方そのもの**が、★素材から来ていること（★裁定 R2）。
   *   ★`placementMode === 'measured-ground'` を ★`false && ...` にすると
   *   ★新しい配置が常に無効になりますが、★名前は全部残ります。
   */
  let modeTestSeen = 0;
  walk(sf, (n) => {
    if (!ts.isConditionalExpression(n)) return;
    /** ★新旧の組を選んでいる三項演算子だけを見る（★`mode: 'measured-ground'` を返す枝がある物） */
    const picksPlacement = ts.isObjectLiteralExpression(n.whenTrue)
      && n.whenTrue.properties.filter(ts.isPropertyAssignment).some((p) =>
        propName(p) === 'mode' && ts.isStringLiteral(p.initializer)
        && p.initializer.text === 'measured-ground');
    if (!picksPlacement) return;
    modeTestSeen += 1;
    /**
     * ★条件は ★**その比較そのもの**であること。★`false && ...` や `!` で包むと落ちます
     * （★裁定 R2 が名指しした変異。★内側の比較は残るので、★節点の形で見ないと通ってしまう）。
     */
    const c = n.condition;
    const ok = ts.isBinaryExpression(c)
      && c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isStringLiteral(c.right) && c.right.text === 'measured-ground'
      && (ts.isIdentifier(c.left)
        || (ts.isCallExpression(c.left) && ts.isIdentifier(c.left.expression)
          && c.left.expression.text === 'effectivePlacementMode'));
    if (!ok) bad.push(`⑦ 決め方の判定が素材から来ていない: ${c.getText().slice(0, 60)}`);
  });
  if (modeTestSeen < 2) bad.push(`⑦ 決め方の判定が 2 か所未満: ${modeTestSeen}`);

  /**
   * ★⑧ 接地線は素材から求めること（★`feetRatioOf` の呼び出し・★裁定 R2）。
   * ⚠️ ★書き方が 2 通りあります（★`feetRatio: feetRatioOf(...)` と ★短縮形 `feetRatio`）。
   *    ★短縮形のときは ★**その変数の宣言**まで辿ります。
   */
  const isFeetCall = (e: ts.Expression | undefined): boolean =>
    e !== undefined && ts.isCallExpression(e) && ts.isIdentifier(e.expression)
    && e.expression.text === 'feetRatioOf';
  /** ⚠️ ★従来経路は接地線を使わないので `1` で構わない。★新経路だけを見る */
  const inLegacyLiteral = (n: ts.Node): boolean =>
    /legacy-table/.test(n.parent.getText().slice(0, 80));
  let feetSeen = 0;
  let feetShorthand = 0;
  walk(sf, (n) => {
    if (ts.isPropertyAssignment(n) && propName(n) === 'feetRatio') {
      if (inLegacyLiteral(n)) return;
      feetSeen += 1;
      if (!isFeetCall(n.initializer)) {
        bad.push(`⑧ 接地線が素材から来ていない: ${n.initializer.getText().slice(0, 50)}`);
      }
      return;
    }
    if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'feetRatio') {
      if (inLegacyLiteral(n)) return;
      feetSeen += 1;
      feetShorthand += 1;
    }
  });
  if (feetShorthand > 0) {
    let declOk = false;
    walk(sf, (n) => {
      if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name)) return;
      if (n.name.text !== 'feetRatio') return;
      if (isFeetCall(n.initializer)) declOk = true;
    });
    if (!declOk) bad.push('⑧ 短縮形で渡している接地線の宣言が `feetRatioOf` でない');
  }
  if (feetSeen < 2) bad.push(`⑧ 接地線の指定が 2 か所未満: ${feetSeen}`);

  /**
   * ★⑨ 較正値の引数が ★**素材から決まった値**であること（★定数を直に渡していない・★裁定 R2）。
   * ⚠️ ★識別子だけに限りません。★`effectivePlacementMode(...)` の戻り値を直に渡す形も通します
   *    （★2026-09-10・★焼いた経路はこの形です）。★弾くのは ★**文字列の直書き**です。
   */
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    if (n.expression.text !== 'horseCalibrationFor') return;
    const arg = n.arguments[0];
    const ok = arg !== undefined && (ts.isIdentifier(arg)
      || (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)
        && (arg.expression.text === 'effectivePlacementMode'
          || arg.expression.text === 'placementModeFor')));
    if (!ok) bad.push(`⑨ 較正値の引数が素材から来ていない: ${arg?.getText() ?? '(無し)'}`);
  });

  /**
   * ★⑥ 比較用の口は ★**旧処理へ戻す方向にしか効かない**こと。
   *   ★`'measured-ground'` を返す枝があると、★「引数を付けたときだけ直る」状態になりうる。
   */
  let overrideSeen = 0;
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name)) return;
    if (n.name.text !== 'PLACEMENT_OVERRIDE') return;
    overrideSeen += 1;
    if (/measured-ground/.test(n.initializer?.getText() ?? '')) {
      bad.push('⑥ 比較用の口が新しい配置を有効化しうる');
    }
  });
  if (overrideSeen !== 1) bad.push(`⑥ 比較用の口が 1 つではない: ${overrideSeen}`);

  return bad;
}

describe('配置の接続（構文木）', () => {
  it('現在の画面は違反 0 件', () => {
    expect(violationsOf(source)).toEqual([]);
  });

  /**
   * ★**壊し方を当てて、落ちることを確かめる**（★R-22）。
   *   ★`from` が写しの中に 1 か所以上あることも確かめる（★当たっていない変異で
   *   ★「検出した」ことにしない・★R-21）。
   */
  const mutations: readonly { readonly label: string; readonly from: string; readonly to: string }[] = [
    {
      label: '① コマ別拡縮を戻す',
      from: 'referenceHeight: placed.referenceHeight',
      to: 'referenceHeight: placed.referenceHeight * 1.05',
    },
    {
      label: '② 浮きを固定表へ戻す',
      from: 'bodyLiftSourcePx: placed.bodyLiftSourcePx',
      to: 'bodyLiftSourcePx: 0',
    },
    {
      label: '③ 較正値を定数で置く',
      from: 'calibration: horseCalibrationFor(',
      to: 'calibration: LEGACY_HORSE_CALIBRATION ?? horseCalibrationFor(',
    },
    {
      label: '④ 1 完歩を数値へ戻す',
      from: 'const strideM = strideOverrideM ?? calibration.strideM;',
      to: 'const strideM = strideOverrideM ?? 7;',
    },
    {
      label: '⑤ 配置を URL の引数で分岐させる',
      from: 'const sideMode: HorsePlacementMode = bakedLibs !== undefined',
      to: 'const sideMode: HorsePlacementMode = new URLSearchParams(window.location.search).get(\'ground\') === \'1\' ? \'legacy-table\' : bakedLibs !== undefined',
    },
    {
      label: '⑥ 比較用の口で新しい配置を有効化する',
      from: '? \'legacy-table\' : undefined;',
      to: '? \'legacy-table\' : \'measured-ground\';',
    },
    /** ★以下は裁定 R2 で「素通りする」と名指しされた 4 件（★2026-09-10） */
    {
      label: '⑦-a 原版の新配置を常に無効化する',
      from: "placementMode === 'measured-ground'",
      to: "false && placementMode === 'measured-ground'",
    },
    {
      label: '⑦-b 焼いた素材の新配置を常に無効化する',
      from: "effectivePlacementMode(set.prefix) === 'measured-ground'",
      to: "false && effectivePlacementMode(set.prefix) === 'measured-ground'",
    },
    {
      label: '⑧-a 焼いた素材の接地線を素材から取らない',
      from: 'feetRatio: feetRatioOf(placementFrames.map((f) => f.lowRatio)),',
      to: 'feetRatio: 1,',
    },
    {
      label: '⑧-b 原版の接地線を素材から取らない',
      from: 'const feetRatio = feetRatioOf(placementFrames.map((f) => f.lowRatio));',
      to: 'const feetRatio = 1;',
    },
    {
      label: '⑨ 較正値を定数の引数で固定する',
      from: 'horseCalibrationFor(sideMode)',
      to: "horseCalibrationFor('legacy-table')",
    },
  ];

  it.each(mutations)('$label を検出する', ({ from, to }) => {
    expect(source.includes(from), `変異が当たっていない: ${from}`).toBe(true);
    expect(violationsOf(source.split(from).join(to)).length).toBeGreaterThan(0);
  });

  it('書式を変えただけでは落ちない（★意味で見ていることの確認）', () => {
    const reformatted = source
      .split('referenceHeight: placed.referenceHeight,')
      .join('referenceHeight:\n              placed.referenceHeight,');
    expect(violationsOf(reformatted)).toEqual([]);
  });
});
