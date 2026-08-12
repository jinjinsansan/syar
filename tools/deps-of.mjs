/**
 * ★あるエントリが依存するファイルを機械的に列挙する
 *
 * 【なぜ要るか】
 *   R-23 は「古い SHA でも有効なら**その理由を明文で書く**」を許します。
 *   その理由が「測定に効く経路は変わっていない」の形をとるとき、
 *   ★**「効く経路」を人が選ぶと、都合よく選べます。**
 *   → 依存を**辿って**列挙し、その集合に対して差分を取ります。
 *
 * 【★このツールが言えないこと】
 *   静的な import しか見ません。動的 import・実行時の設定ファイル・
 *   環境変数で切り替わる経路は**含まれません**。
 *   そこまで含めて「効かない」と言うには、結局は再実行が要ります。
 *
 * 実行: node tools/deps-of.mjs apps/cli/src/verify-payout.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const entry = process.argv[2];
if (entry === undefined) {
  console.error('使い方: node tools/deps-of.mjs <エントリ.ts>');
  process.exit(2);
}

const seen = new Set();
const missing = [];

const walk = (file) => {
  const f = resolve(file);
  if (seen.has(f)) return;
  if (!existsSync(f)) { missing.push(file); return; }
  seen.add(f);
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith('.')) {
      walk(join(dirname(f), spec.replace(/\.js$/, '.ts')));
    } else if (spec.startsWith('@star/')) {
      walk(join(process.cwd(), 'packages', spec.slice('@star/'.length), 'src', 'index.ts'));
    }
  }
};

walk(entry);
const rel = [...seen]
  .map((p) => p.slice(process.cwd().length + 1).split(sep).join('/'))
  .sort();
for (const r of rel) console.log(r);
// ★辿れなかったものを黙らせない（0件に見えて実は追えていない、を避ける）
if (missing.length > 0) {
  console.error(`★辿れなかった import が ${missing.length} 件あります:`);
  for (const m of missing.slice(0, 10)) console.error(`    ${m}`);
}
