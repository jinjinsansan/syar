/**
 * 較正定数の登録簿を JSON で吐く（変異試験ハーネスが読む）。
 *
 * ★ハーネス（run.mjs）は素の Node なので TypeScript を import できない。
 *   登録簿を手で書き写すと**二重管理**になり、片方だけ更新される（L-2 で潰したクラス）。
 *   ここで tsx 経由で吐き出し、ハーネスは常に登録簿そのものを読む。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CALIBRATION, declarationPattern } from '../../apps/cli/src/calibration.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ★現在の宣言行を**ソースから解決**して渡す。登録簿にリテラルを持たせると
//   摂動のたびに登録簿も直す羽目になり、二重管理になる（L-2 で潰したクラス）。
const out = CALIBRATION.map((c) => {
  const text = readFileSync(`${ROOT}${c.file}`, 'utf8');
  const m = text.match(declarationPattern(c.key));
  if (m === null) throw new Error(`${c.key}: ${c.file} に宣言が見つからない`);
  return { ...c, declaration: m[0] };
});
console.log(JSON.stringify(out, null, 0));
