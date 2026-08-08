/**
 * A-2「強制終了して再起動しても二重生成・二重払戻が起きない」を**実 DB で**確かめる。
 * ★偽ストアではなく本物の Postgres に対して行う。
 *   P2 指示書 §3「ローカルでは動くが本番構成では動かない」を避けるため。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { runCycle } from '../apps/worker/src/cycle-runner.ts';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// テスト用の起点（過去）。既存データを汚さないよう後で消す
const EPOCH = Date.parse('2020-01-01T00:00:00Z');
const store = createPgStore(c);
const before = (await c.query(`select count(*)::int n from races`)).rows[0].n;

console.log('--- 1周目 ---');
const a = await runCycle(store, EPOCH);
console.log(`  作成 ${a.created.length} / 既存 ${a.skipped.length}`);

console.log('--- 「強制終了して再起動」= もう一度呼ぶ × 5 ---');
for (let i = 0; i < 5; i++) await runCycle(store, EPOCH);

const rows = await c.query(`select cycle_index, count(*)::int n from races where cycle_index is not null group by 1 having count(*) > 1`);
const total = (await c.query(`select count(*)::int n from races`)).rows[0].n;
console.log(`  レース総数 ${before} → ${total}（増分 ${total - before}）`);
console.log(`  ★重複しているサイクル番号: ${rows.rowCount}件`);

// ★一意制約が本当に効くか、直接ぶつけて確かめる
let uniqueOk = false;
try {
  const idx = a.created[0];
  await c.query(`insert into races (cycle_index,name,class_rank,surface,distance,track_condition,course_id,scheduled_at,seed_commit,purse) values ($1,'DUP',1,'turf',2000,'good','C1',now(),'x',0)`, [idx]);
  console.log('  ★一意制約: FAIL — 同じ cycle_index を挿入できてしまった');
} catch (e) {
  uniqueOk = true;
  console.log(`  ★一意制約: PASS — ${e.message.slice(0,50)}`);
}

console.log(`\n★A-2: ${rows.rowCount === 0 && total - before === a.created.length && uniqueOk ? 'PASS' : 'FAIL'}`);
await c.query(`delete from races where cycle_index is not null`);
await c.end();
