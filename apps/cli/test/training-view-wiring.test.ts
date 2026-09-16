/**
 * ★**調教の画面が、見せ方の写像とバーを `@star/training` の 1 か所から引いているか**
 *   （★GB-1・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §1-2 の 2・3・4）
 *
 * 【★なぜ要るか】
 *   ★画面に同じ表を複製すると、★片方だけ直した日に画面と検査が離れます
 *   （★`v18` の ②b を 2 通りに実装して 0.567 対 0.216 と食い違わせた前科・台帳 B-5）。
 *   ★`game-demo.ts` には実際に ★**8 行の表の写し**がありました（★GB-1 で是正）。
 *
 * 【★見方】★`grep` ではなく **構文木**で見ます（★`race-clock-wiring.test.ts` と同じ作法）:
 *   ① 画面（`training/page.tsx`）と表示モデル（`game-demo.ts`）が `@star/training` から引いていること
 *   ② 画面の 3 本のバーが `trainingBarsOf(...)` の**戻り値そのもの**から作られていること
 *   ③ ★**画面側に写像の表（メニュー → 体・心／強度）を持っていないこと**
 *   ④ ★バーに ★**素質（`potential`）や「上限までの割合」を渡していないこと**（★入力で見る・§5.5）
 * 【★この検査が自分で確かめること（R-22）】★名指しされた壊し方をその場で作り、落ちることを見ます
 *   （★製品ファイルは変更しません。★読み込んだ文字列に対して行います）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = 'apps/web/src/app/training/page.tsx';
const MODEL = 'apps/web/src/lib/game-demo.ts';
const readSrc = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

const parse = (source: string, fileName: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** ★そのファイルが `from` から取り込んでいる名前 */
function importedFrom(sf: ts.SourceFile, from: string): string[] {
  const out: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteralLike(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== from) continue;
    const named = st.importClause?.namedBindings;
    if (named !== undefined && ts.isNamedImports(named)) for (const e of named.elements) out.push(e.name.text);
  }
  return out;
}

/** ★`fn(...)` の呼び出しを集める */
function callsOf(sf: ts.SourceFile, fn: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === fn) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** ★画面側に「メニュー → 体・心／強度」の表が書かれていないか（★オブジェクトの中身で見る） */
function localViewTables(sf: ts.SourceFile): string[] {
  const bad: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      const text = n.getText(sf);
      const hasAxis = /\baxis\s*:/.test(text) && /'(body|mind)'/.test(text);
      const hasIntensity = /\bintensity\s*:/.test(text) && /'(weak|mid|strong)'/.test(text);
      if (hasAxis && hasIntensity) bad.push(text.slice(0, 80));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

function violationsOf(pageSrc: string, modelSrc: string): string[] {
  const page = parse(pageSrc, 'page.tsx');
  const model = parse(modelSrc, 'game-demo.ts');
  const bad: string[] = [];

  // ① 取り込み
  const pageImports = importedFrom(page, '@star/training');
  for (const name of ['TRAINING_AXES', 'TRAINING_INTENSITIES', 'trainingBarsOf']) {
    if (!pageImports.includes(name)) bad.push(`★画面が @star/training から ${name} を引いていません`);
  }
  const modelImports = importedFrom(model, '@star/training');
  for (const name of ['MENUS', 'MENU_IDS', 'menuViewOf', 'menusOfView']) {
    if (!modelImports.includes(name)) bad.push(`★表示モデルが @star/training から ${name} を引いていません`);
  }

  // ② バーは trainingBarsOf の戻り値そのもの（★別の式で作っていない）
  const barCalls = callsOf(page, 'trainingBarsOf');
  if (barCalls.length === 0) bad.push('★画面が trainingBarsOf を呼んでいません');
  for (const call of barCalls) {
    // ④ 引数は 2 つ（★素質・上限までの割合を渡す口を作らない）
    if (call.arguments.length !== 2) bad.push(`★trainingBarsOf の引数が 2 つではありません: ${call.arguments.length}`);
    const text = call.getText(page);
    if (/potential|capRatio/i.test(text)) bad.push(`★バーに素質・上限までの割合を渡しています: ${text.slice(0, 60)}`);
  }

  // ③ 画面側に写像の表が無い
  for (const t of [...localViewTables(page), ...localViewTables(model)]) {
    bad.push(`★写像の表が画面側に複製されています: ${t}`);
  }
  return bad;
}

describe('★調教の見せ方の接続（構文木で見る・GB-1）', () => {
  it('★★画面と表示モデルが @star/training の 1 か所から引いている', () => {
    expect(violationsOf(readSrc(PAGE), readSrc(MODEL))).toEqual([]);
  });

  describe('★見張りが壊れ方を捕まえる（★変異版・製品ファイルは無傷）', () => {
    const page = (): string => readSrc(PAGE);
    const model = (): string => readSrc(MODEL);

    it('★① 画面が写像を自前の表で持つ（複製）', () => {
      const injected = page().replace('const WEEK_NO = 32;',
        "const WEEK_NO = 32;\nconst LOCAL_VIEW = { hill: { axis: 'body', intensity: 'mid' } } as const;");
      expect(violationsOf(injected, model()).length).toBeGreaterThan(0);
    });

    it('★② 画面がバーを自前で組む（trainingBarsOf を呼ばない）', () => {
      const src = page();
      expect(src).toContain('trainingBarsOf(');
      expect(violationsOf(src.replace(/trainingBarsOf\(/g, 'localBarsOf('), model()).length).toBeGreaterThan(0);
    });

    it('★③ バーに「上限までの割合」を渡す（素質が復元できる形）', () => {
      const src = page();
      const from = 'trainingBarsOf(DEMO_TRAINING_ABILITY[horse.id] ?? DEFAULT_TRAINING_ABILITY, horse.condition)';
      expect(src, '変異のもとが見つかりません').toContain(from);
      const to = 'trainingBarsOf(DEMO_TRAINING_ABILITY[horse.id] ?? DEFAULT_TRAINING_ABILITY, horse.condition, capRatio)';
      expect(violationsOf(src.replace(from, to), model()).length).toBeGreaterThan(0);
    });

    it('★④ 表示モデルが 8 メニューの表を自前に戻す', () => {
      const src = model();
      expect(violationsOf(page(), src.replace(/menusOfView/g, 'localMenusOfView')).length).toBeGreaterThan(0);
    });
  });
});
