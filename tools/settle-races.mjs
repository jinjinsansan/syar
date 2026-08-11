/**
 * ★staging のレースを確定させる（時間を進める代わり）
 *
 * 【なぜ要るか】
 *   検証には**確定済みのレース**が要ります（着順が無いと何も測れません）。
 *   ところが `seed-races` は発売期間を確保するため**先のサイクル**に作るので、
 *   放っておくと何時間も確定しません。
 *
 *   ★`settleRace` は**発走時刻を見ません**（`status='scheduled'` の行を
 *     排他的に 'settled' にするだけ）。本番ではワーカーが
 *     `pendingSettlements(nowMs)` で時刻を見てから呼びますが、
 *     ここでは**時刻を待たずに**同じ関数を呼びます。
 *
 * 【★本番と違うのは「いつ呼ぶか」だけです】
 *   着順の計算・賞金・払戻はすべて `store.settleRace` の中で、本番と同じ経路を通ります。
 *   ★ここで着順を自前で計算したら、検証の意味がなくなります。
 *
 * 実行: npx tsx tools/settle-races.mjs --env staging [--from-cycle 581]
 */
import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../apps/worker/src/pg-store.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--from-cycle');
const FROM = i >= 0 ? Number(process.argv[i + 1]) : 0;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'settle-races.mjs');

const hash = {
  sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const store = createPgStore(c, hash);

const targets = (await c.query(
  `select cycle_index, track_condition from races
    where status = 'scheduled' and cycle_index >= $1 order by cycle_index`, [FROM],
)).rows;

console.log(`# staging のレースを確定させる（cycle ${FROM} 以降）`);
console.log(`  対象 ${targets.length} 本`);
if (targets.length === 0) {
  console.log('  ★確定できるレースがありません');
  await c.end();
  process.exit(2);
}

let done = 0;
for (const t of targets) {
  await store.settleRace(Number(t.cycle_index));
  done += 1;
  console.log(`  cycle ${t.cycle_index} ... 確定（馬場 ${t.track_condition}）`);
}

const chk = await c.query('select status, count(*)::int n from races group by 1 order by 1');
console.log('');
console.log(`  確定 ${done} 本 / DB: ${chk.rows.map((r) => `${r.status}=${r.n}`).join(' ')}`);
await c.end();
