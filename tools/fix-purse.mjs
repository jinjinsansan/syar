/**
 * ★purse=0 のレースを正典 §11.1 の値に直す。
 *   削除ではなく update にする理由: 確定済みレースの結果と馬券を消さないため。
 *   外部キー制約が「出走表を残したままレースだけ消す」を防いでいるのは正しい挙動。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { purseOf } from '../packages/scheduler/src/index.ts';
import { tierFromDb } from '../apps/worker/src/prize-award.ts';

import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'fix-purse.mjs');

const rows = (await c.query(`select id, cycle_index, class_rank, grade from races where purse = 0`)).rows;
console.log(`purse=0 のレース: ${rows.length}件`);
for (const r of rows) {
  const p = purseOf(tierFromDb(r.class_rank, r.grade));
  await c.query(`update races set purse = $1 where id = $2`, [p, r.id]);
  console.log(`  cycle=${r.cycle_index} class=${r.class_rank}${r.grade?'/'+r.grade:''} → purse=${p}`);
}
const z = (await c.query(`select count(*)::int n from races where purse = 0`)).rows[0].n;
console.log(`\n★purse=0 のレース: ${z}件（0 であること）`);
/**
 * 🔴 ★**期待を文章で書いて、★機械で見ていませんでした**（★**CK-11**・2026-09-19）。
 *   ★上の印刷に「0 であること」と書いてありながら、★**0 でなくても終了コード 0** でした。
 *   ★★**数えると、★その数で落ちるは別**です。
 */
if (z !== 0) {
  console.log(`🔴 ★purse=0 が ${z} 件 残っています`);
  process.exitCode = 1;
}
await c.end();
