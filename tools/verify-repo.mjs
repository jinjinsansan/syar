/**
 * ★DB 往復で馬の情報が失われていないかを確かめる。
 *   「DB には正しく入っているのにレースでは能力が違う」を検出する。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadRaceablePool } from '../apps/worker/src/horse-repo.ts';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.ts';
import { Rng } from '../packages/sim-engine/src/index.ts';

import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

const pool = await loadRaceablePool(c, 3000);
console.log(`読み込み ${pool.length} 頭`);

// ★必須項目が欠けていないか
const h = pool[0];
const keys = ['potential','stats','surfaceAptitude','strategyAptitude','genotype','pedigreeCache'];
for (const k of keys) {
  const v = h[k];
  const size = v instanceof Map ? v.size : Object.keys(v ?? {}).length;
  console.log(`  ${k}: ${size} 項目`);
}
console.log(`  heavyAptitude=${h.heavyAptitude} durability=${h.durability} inbreedCoeff=${h.inbreedCoeff}`);

// ★較正済みの generateRace にそのまま渡せるか（複製していないことの確認）
const sorted = sortPoolByClass(pool);
const race = generateRace(sorted, 0, new Rng(42));
console.log('');
console.log(`★generateRace が動いた: ${race.entrants.length}頭  ${race.conditions.surface} ${race.conditions.distance}m  classLevel=${race.classLevel.toFixed(3)}`);
const sizes = [];
for (let i = 0; i < 200; i += 1) sizes.push(generateRace(sorted, i, new Rng(1000 + i)).entrants.length);
const min = Math.min(...sizes), max = Math.max(...sizes);
const mean = sizes.reduce((a,b)=>a+b,0)/sizes.length;
console.log(`★出走頭数（200レース）: ${min}〜${max}  平均 ${mean.toFixed(2)}（正典 §10.4 は 8〜18・平均13）`);
await c.end();
