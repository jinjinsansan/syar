/**
 * ★**画面がゴール前のカメラに「結果」を渡していないこと**（★2026-09-14・オーナー確認 O-7）
 *
 * 【★守るもの】★レビュー側の回答 §1-6 の 2:
 *   > ★ゴールより前のカメラ・音を決める関数が、★`winnerGate`・`development`・確定着順を引数に取らない
 *
 * 【★見るところ】`apps/web/src/app/race/page.tsx` の ★`resolveBroadcastV2Scene(...)` の呼び出し ★すべて。
 *   ★① `development` を渡していない
 *   ★② `finishChase`（★状態から決める値）を渡している
 *   ★③ `leadGates`（★画に収める相手）が ★確定着順から作られていない
 * ⚠️ ★文字列の一致ではなく ★**構文木**で見ます（★`race-clock-wiring.test.ts` の教訓）。
 * ⚠️ ★見張りが壊れ方を捕まえることを ★**その場で壊して**確かめます（★R-22・★製品ファイルは無傷）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'apps/web/src/app/race/page.tsx';
const readPage = (): string => readFileSync(path.join(ROOT, PAGE), 'utf8');

/** ★確定着順・勝ち馬・展開の札・走破時刻に当たる名前（★これを読む式からカメラの入力を作らない） */
const RESULT_NAMES = new Set([
  'result', 'finishPos', 'finishPlaceByGate', 'climaxLeadGates', 'development', 'winnerGate', 'settled',
  'finishSec', 'finishSpeeds',
]);
/**
 * ⚠️ ★**辿るのは「値がそのまま変数名」のときの 1 段だけです**（★2026-09-14・★誤検出を 2 回出して直しました）。
 *    ★1 回目（★2 段辿った）… ★`stateLeadGates → easedAt → finishPlaceByGate`（★`?climax=on` のときだけ効く
 *      ★表示の演出）と ★`visual → finishSec` に当たりました。
 *    ★2 回目（★式の中の変数も 1 段辿った）… ★`[...visual]` の `visual` が ★ゴールを通過した後の流しで
 *      ★`finishSec` を読むので当たりました。
 *    ★どれも ★**描いている位置**を作る経路で、★ゴール前の構図に確定着順を渡しているのではありません。
 *    → ★`leadGates: 変数名` のときだけ ★その変数の初期化子を見ます。★式の中の変数は辿りません。
 * ⚠️ ★この検査は ★**描いている位置そのもの**を「状態」として扱います。★`?climax=on` が表示位置に
 *    ★確定着順を混ぜる件は ★オーナー判断 O-4（★既定にしない）と ★`script-v6.test.ts` が守ります。
 */
const FOLLOW_DEPTH = 0;

function violationsOf(source: string): string[] {
  const sf = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bad: string[] = [];
  /** ★変数名 → 初期化子（★`leadGates: stateLeadGates` の中身を辿るため） */
  const inits = new Map<string, ts.Expression>();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      inits.set(node.name.text, node.initializer);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'resolveBroadcastV2Scene') {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  /** ★式の中に結果の名前が出てくるか（★識別子と属性名の両方を見る・★変数は 1 段だけ辿る） */
  const readsResult = (expr: ts.Node, depth = 0): string | undefined => {
    let hit: string | undefined;
    const walk = (n: ts.Node): void => {
      if (hit !== undefined) return;
      if (ts.isIdentifier(n) && RESULT_NAMES.has(n.text)) { hit = n.text; return; }
      if (ts.isIdentifier(n) && depth < FOLLOW_DEPTH) {
        const init = inits.get(n.text);
        if (init !== undefined && init !== expr) {
          const inner = readsResult(init, depth + 1);
          if (inner !== undefined) { hit = `${n.text} → ${inner}`; return; }
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(expr);
    return hit;
  };
  if (calls.length < 2) bad.push(`★resolveBroadcastV2Scene の呼び出しが ${calls.length} 件（★画面と流れの表の 2 か所のはず）`);
  for (const call of calls) {
    const line = sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1;
    const opts = call.arguments[4];
    if (opts === undefined || !ts.isObjectLiteralExpression(opts)) {
      bad.push(`★${line} 行: オプションが対象の書き方ではありません`);
      continue;
    }
    const props = new Map<string, ts.Expression>();
    for (const p of opts.properties) {
      if (ts.isPropertyAssignment(p)) props.set(p.name.getText(sf), p.initializer);
      if (ts.isShorthandPropertyAssignment(p)) props.set(p.name.text, p.name);
      if (ts.isSpreadAssignment(p)) {
        const r = readsResult(p.expression);
        if (r !== undefined && /development|leadGates/.test(p.expression.getText(sf))) {
          bad.push(`★${line} 行: 展開の中で結果を渡しています（${r}）`);
        }
      }
    }
    if (props.has('development')) bad.push(`★${line} 行: development（★確定の 1 着から決まる札）を渡しています`);
    if (!props.has('finishChase')) bad.push(`★${line} 行: finishChase（★状態から決める値）を渡していません`);
    const lead = props.get('leadGates');
    if (lead !== undefined) {
      /** ★値がそのまま変数名なら、★その初期化子を見る（★`FOLLOW_DEPTH` の註記） */
      const target = ts.isIdentifier(lead) ? (inits.get(lead.text) ?? lead) : lead;
      const r = readsResult(target);
      if (r !== undefined) bad.push(`★${line} 行: leadGates が確定着順から作られています（${r}）`);
    }
  }
  return bad;
}

describe('★ゴール前のカメラの入力（構文木で見る）', () => {
  it('★★画面は結果をカメラに渡していない', () => {
    expect(violationsOf(readPage())).toEqual([]);
  });

  describe('★見張りが壊れ方を捕まえる（★変異版・製品ファイルは無傷）', () => {
    const mutate = (from: string, to: string): string[] => {
      const src = readPage();
      expect(src, `変異のもとが見つかりません: ${from}`).toContain(from);
      return violationsOf(src.replace(from, to));
    };

    it('★① 状態の値を展開の札へ戻す', () => {
      expect(mutate('finishChase: built.finishChaseAt(sec),', 'development: built.development.kind,').length)
        .toBeGreaterThan(0);
    });

    it('★② 画に収める相手を確定着順の上位 5 頭へ戻す', () => {
      expect(mutate('const stateLeadGates = [...easedAt]',
        'const stateLeadGates = built.result.map((row) => row.gate) || [...easedAt]').length).toBeGreaterThan(0);
    });

    it('★③ 流れの表の側だけ確定着順を渡す', () => {
      expect(mutate('leadGates: [...visual].sort',
        'leadGates: [...finishSec.keys()].slice(0, 5) || [...visual].sort').length).toBeGreaterThan(0);
    });
  });
});
