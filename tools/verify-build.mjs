import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadRaceablePool } from '../apps/worker/src/horse-repo.ts';
import { buildRace } from '../apps/worker/src/build-race.ts';

import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const pool = await loadRaceablePool(c, 3000);
console.log(`馬 ${pool.length} 頭`);

const t0 = Date.now();
const b = buildRace(pool, 100, 42, 2000);
console.log(`buildRace: 出走 ${b.entrants.length}頭 / オッズ ${b.odds.length}行 / ${((Date.now()-t0)/1000).toFixed(1)}秒（MC 2,000回）`);

const byKind = {};
for (const o of b.odds) byKind[o.betType] = (byKind[o.betType] ?? 0) + 1;
console.log('券種別の売り目数:', JSON.stringify(byKind));

const win = b.odds.filter(o=>o.betType==='win').sort((a,b)=>a.odds-b.odds);
console.log('単勝オッズ（低い順3件）:', win.slice(0,3).map(o=>`${o.selection[0]}番 ${o.odds.toFixed(1)}倍(p=${(o.probability*100).toFixed(1)}%)`).join(' / '));
const sum = win.reduce((a,o)=>a+o.probability,0);
console.log(`★単勝の確率合計: ${(sum*100).toFixed(1)}%（100%に近いこと）`);
const capped = b.odds.filter(o=>o.capped).length;
console.log(`★上限に当たった目: ${capped}/${b.odds.length}`);
console.log(`★人気1位: ${b.entrants.find(e=>e.popularity===1)?.gate}番枠`);
await c.end();
