// @ts-check
/**
 * ★**ワーカーの「拾う」問い合わせを 実 DB に投げる smoke**（★読むだけ・2026-09-29）
 *
 * 【🔴 ★なぜ】
 *   ★2026-09-29 23:44、★本番のワーカーが 毎周「operator is not unique: unknown - unknown」で落ちた（★3 周・約 3 分）。
 *   ★`pendingSettlements` の `to_timestamp(($1 - $2) / 1000.0)` で ★2 つの引数の型が決まらなかった。
 *   ★偽の DB の網は ★SQL を文字で見るだけなので ★型の誤りを出さない。★staging の verify-live-results は ★この述語を通らなかった。
 *   → ★配備の前に ★staging の実 DB へ ★拾う問い合わせを全部 1 度 投げる（★行が返るか・★例外が出ないか だけ）。
 *
 * 【★見るもの】 CycleStore の読むだけの口: serverNowMs・announcedRaces・pendingResolutions・pendingSettlements・overdueRaces
 *   ★書く口（resolveRace・settleRace・announceRace…）は ★呼ばない。
 *
 * ⚠️ ★**必ず `--env staging`**（★本番では止まる）。
 *   npx tsx tools/verify-worker-queries.mjs --env staging
 */
import pg from 'pg';
import { createHash, createHmac } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import '../apps/worker/src/pg-types.ts';
import { createPgStore } from '../apps/worker/src/pg-store.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'verify-worker-queries.mjs');
const hash = {
  sha256: (/** @type {string} */ m) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (/** @type {string} */ k, /** @type {string} */ m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};
const store = createPgStore(c, hash);
let fail = 0;
try {
  const now = await store.serverNowMs();
  console.log(`  ✅ serverNowMs  ${new Date(now).toISOString()}`);
  /** @type {[string, () => Promise<number[]>][]} */
  const reads = [
    ['announcedRaces', () => store.announcedRaces()],
    ['pendingResolutions', () => store.pendingResolutions(now)],
    ['pendingSettlements', () => store.pendingSettlements(now)],
    ['overdueRaces', () => store.overdueRaces(now)],
  ];
  for (const [name, run] of reads) {
    try {
      const rows = await run();
      console.log(`  ✅ ${name.padEnd(20)} ${rows.length} 件`);
    } catch (e) {
      fail += 1;
      console.log(`  🔴 ${name.padEnd(20)} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
} finally {
  await c.end();
}
console.log(fail === 0 ? '\n★合格（★拾う問い合わせは どれも例外なく返った）' : `\n🔴 ${fail} 本 落ちました（★配備しないこと）`);
process.exitCode = fail === 0 ? 0 : 1;
