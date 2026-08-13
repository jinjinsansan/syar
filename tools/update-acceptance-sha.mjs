/**
 * ★判定書の SHA を HEAD に更新する（**再実行した項目だけ**）
 *
 * ⚠️⚠️ **このツールは、証拠を作りません。**
 *    SHA を書き換えるだけです。**再実行していない項目に使ってはいけません。**
 *    R-23 が守っているのは「古い証拠が黙って残らない」ことなので、
 *    ★**測らずに SHA だけ合わせると、規則が守るはずのものを規則の道具で壊します。**
 *
 * 【なぜツールにするか】
 *   最初シェルのヒアドキュメントで置換したところ、**バッククォートがコマンド置換として
 *   解釈され、SHA が空欄になりました**（判定書の5行が壊れた）。
 *   ★置換の内容にバッククォートが含まれるので、シェルを経由させてはいけません。
 *
 * 実行: node tools/update-acceptance-sha.mjs <file> <KEY> [KEY...]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [file, ...keys] = process.argv.slice(2);
if (file === undefined || keys.length === 0) {
  console.error('使い方: node tools/update-acceptance-sha.mjs <file> <KEY> [KEY...]');
  process.exit(2);
}
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
let text = readFileSync(file, 'utf8');

let changed = 0;
const notFound = [];
for (const key of keys) {
  // 「| **KEY** | 内容 | 判定 | `SHA` |」の SHA 欄だけを差し替える
  const re = new RegExp(
    '(\\|\\s*\\*\\*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\*[^\\n|]*\\|[^\\n|]*\\|[^\\n|]*\\|\\s*)`[0-9a-f]{7,40}`',
  );
  if (!re.test(text)) { notFound.push(key); continue; }
  text = text.replace(re, (_m, head1) => head1 + '`' + head + '`');
  changed += 1;
}
writeFileSync(file, text, 'utf8');

console.log(`HEAD=${head} / 更新 ${changed} 件`);
// ★見つからなかったものを黙らせない（0件に見えて実は当たっていない、を避ける）
if (notFound.length > 0) {
  console.error(`★見つかりませんでした（表の形が違う可能性）: ${notFound.join(', ')}`);
  process.exit(1);
}
