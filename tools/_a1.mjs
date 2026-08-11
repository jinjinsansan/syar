import pg from 'pg';
import { buildRace } from '../apps/worker/src/build-race.ts';
import { ODDS_MC_TRIALS } from '../apps/worker/src/odds.ts';
import { loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { loadEnv } from './lib/env.mjs';
const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const pool = await loadRaceablePool(c);
const states = await loadTrainingStates(c);
const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
await c.end();
console.log(`  試行数 ${ODDS_MC_TRIALS.toLocaleString()}（本番と同じ）／DB を含まない純計算`);
const rows = [];
for (const idx of [601, 602, 603, 604, 605]) {
  const t0 = process.hrtime.bigint();
  const r = buildRace(pool, idx, EPOCH, ODDS_MC_TRIALS, states);
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  rows.push({ n: r.entrants.length, sec });
  console.log(`  cycle ${idx}  ${String(r.entrants.length).padStart(2)}頭  オッズ ${String(r.odds.length).padStart(5)}点  ${sec.toFixed(0).padStart(4)}秒`);
}
const worst = rows.reduce((a, b) => (b.sec > a.sec ? b : a));
console.log('');
console.log(`  ★最も重かったレース: ${worst.n}頭 / ${worst.sec.toFixed(0)}秒`);
console.log(`  ★1周600秒に2レース先行生成 → 最悪 ${(worst.sec * 2).toFixed(0)}秒 / 余裕 ${(600 - worst.sec * 2).toFixed(0)}秒`);
