import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadRaceablePool } from '../apps/worker/src/horse-repo.ts';
import { generateRace, sortPoolByClass } from '../apps/cli/src/race-field.ts';
import { deriveRng } from '../packages/sim-engine/src/index.ts';

const env = Object.fromEntries(readFileSync('secrets.local.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const pool = sortPoolByClass(await loadRaceablePool(c, 3000));
const race = generateRace(pool, 100, deriveRng(42, 61, 100));
console.log('index+1:', race.entrants.slice(0,8).map((_,i)=>i+1).join(','));
console.log('e.gate :', race.entrants.slice(0,8).map(e=>e.gate).join(','));
const same = race.entrants.every((e,i)=>e.gate===i+1);
console.log('');
console.log('★e.gate === index+1:', same, same?'（一致）':'★食い違い → MC と確定で別の枠番を使っている');
// ★能力順に並んでいるかも見る（人気が能力と対応するはず）
const ab = race.entrants.map(e=>Object.values(e.stats).reduce((a,b)=>a+b,0));
console.log('能力合計（枠順）:', ab.slice(0,8).join(','));
await c.end();
