/**
 * 報告書 §7「仕様からの逸脱・解釈で埋めた箇所」を**実行時に生成**する（R-10）。
 *
 *   npx tsx apps/cli/src/print-interpretations.ts [--md]
 *
 * ★手で書いた一覧は必ず漏れる。登録簿から出すことで、
 *   「報告書に書いた件数」と「コードが実際に持っている件数」が食い違わないようにする。
 */
import { INTERPRETATIONS } from '@star/race-engine';

if (process.argv.includes('--md')) {
  console.log('| ID | 正典 | 正典が定めていること | 開発側が埋めたこと |');
  console.log('|---|---|---|---|');
  for (const i of INTERPRETATIONS) {
    console.log(`| \`${i.id}\` | ${i.canon} | ${i.given} | ${i.filled} |`);
  }
} else {
  for (const i of INTERPRETATIONS) console.log(`${i.id.padEnd(22)} ${i.canon.padEnd(12)} ${i.filled}`);
}
console.log('');
console.log(`合計: ${INTERPRETATIONS.length} 件`);
