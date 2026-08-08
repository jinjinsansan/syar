/**
 * ★purse=0 のレースを正典 §11.1 の値に直す。
 *   削除ではなく update にする理由: 確定済みレースの結果と馬券を消さないため。
 *   外部キー制約が「出走表を残したままレースだけ消す」を防いでいるのは正しい挙動。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { purseOf } from '../packages/scheduler/src/index.ts';
import { tierFromDb } from '../apps/worker/src/prize-award.ts';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const rows = (await c.query(`select id, cycle_index, class_rank, grade from races where purse = 0`)).rows;
console.log(`purse=0 のレース: ${rows.length}件`);
for (const r of rows) {
  const p = purseOf(tierFromDb(r.class_rank, r.grade));
  await c.query(`update races set purse = $1 where id = $2`, [p, r.id]);
  console.log(`  cycle=${r.cycle_index} class=${r.class_rank}${r.grade?'/'+r.grade:''} → purse=${p}`);
}
const z = (await c.query(`select count(*)::int n from races where purse = 0`)).rows[0].n;
console.log(`\n★purse=0 のレース: ${z}件（0 であること）`);
await c.end();
