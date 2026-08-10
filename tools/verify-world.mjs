/**
 * ★投入した世界が選定時の値と一致するかを確かめる。
 *   ⚠️ 測定対象を選定時と揃えること。選定時（world-search.mjs）は
 *      **種牡馬プール200頭**の系統集中を測っている。現役世代で測ると別の値になる。
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { ALLOW_ALL_NAMES, NPC_STABLES } from '../packages/sim-engine/src/index.ts';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../apps/cli/src/preseed.ts';
import { lineConcentration } from '../apps/cli/src/pedigree-audit.ts';

import { loadEnv } from './lib/env.mjs';
const SEED = Number(process.argv[2] ?? 1231);
const pre = runPreseed({
  ...DEFAULT_PRESEED_OPTIONS, seed: SEED, generations: 50,
  nicks: preseedNicks(SEED, NPC_STABLES), blocklist: ALLOW_ALL_NAMES,
});
const lk = (id) => pre.world.all.get(id)?.record;

// ★選定時と同じ定義: 種牡馬プールの系統集中
const stallionLines = pre.world.stallionIds.map((id) => lk(id).sireLine);
const conc = lineConcentration(stallionLines);
const Fs = pre.world.activeIds.map((id) => lk(id).inbreedCoeff);
const meanF = Fs.reduce((a, b) => a + b, 0) / Fs.length;

console.log(`# seed ${SEED} の再現確認（選定時と同じ定義）`);
console.log(`  種牡馬プール ${pre.world.stallionIds.length}頭`);
console.log(`  ★有効系統数: ${conc.effective.toFixed(2)}   （選定時 8.00）`);
console.log(`  ★平均F:      ${meanF.toFixed(4)}  （選定時 0.0287）`);
console.log(`  系統数 ${conc.count} / 最大シェア ${(conc.topShare*100).toFixed(1)}%`);

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const dbn = (await c.query('select count(*)::int n from horses')).rows[0].n;
console.log(`\n  DB の馬: ${dbn}頭（投入対象と一致するか）`);
await c.end();
