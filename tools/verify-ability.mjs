/**
 * ★能力が着順に効いているかを測る。
 *   判定: 人気（MC勝率順位）と着順に相関があること。
 *   中立値なら枠順だけで決まり、人気と着順は**無相関**になる。
 */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const hash = { sha256:(m)=>createHash('sha256').update(m,'utf8').digest('hex'), hmacSha256:(k,m)=>createHmac('sha256',k).update(m,'utf8').digest('hex') };
const store = createPgStore(c, hash);

const races = (await c.query(`select cycle_index from races where status='scheduled' order by cycle_index`)).rows;
console.log(`確定するレース: ${races.length}件`);
for (const r of races) await store.settleRace(r.cycle_index);

const q = await c.query(`
  select e.popularity, e.finish_pos from race_entries e
   join races r on r.id = e.race_id
  where r.status='settled' and e.popularity is not null and e.finish_pos is not null`);
console.log(`データ: ${q.rowCount} 行`);
if (q.rowCount > 0) {
  const xs = q.rows.map(r=>Number(r.popularity)), ys = q.rows.map(r=>Number(r.finish_pos));
  const mx = xs.reduce((a,b)=>a+b,0)/xs.length, my = ys.reduce((a,b)=>a+b,0)/ys.length;
  let num=0, dx=0, dy=0;
  for (let i=0;i<xs.length;i++){ num+=(xs[i]-mx)*(ys[i]-my); dx+=(xs[i]-mx)**2; dy+=(ys[i]-my)**2; }
  const r = num/Math.sqrt(dx*dy);
  console.log(`★人気と着順の相関: r=${r.toFixed(3)}`);
  console.log(`   （正の相関なら能力が効いている。0 付近なら中立値のまま）`);
  const top = q.rows.filter(x=>Number(x.popularity)===1);
  const wins = top.filter(x=>Number(x.finish_pos)===1).length;
  console.log(`★1番人気の勝率: ${wins}/${top.length} = ${top.length?((wins/top.length)*100).toFixed(0):0}%（正典 V-4 は 30〜34%）`);
}
await c.end();
