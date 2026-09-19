/**
 * ★**DL-1: 日次の流れは、なぜ 1 か月 止まっているのか**（★2026-09-19・rollback 付き）
 *
 * ✔ ★`point_flow_daily` = 0 行 ／ `story_daily` = 0 行 ／ `unlock_daily` は 2026-08-13 が最後。
 * ✔ ★`lastAggregated` は**起動のたびに `''` に戻る**ので、★起動 1 周目には必ず走るはず。
 *   → ★★**走ったが失敗しているのか、そもそも到達していないのか**を分けます。
 *
 * ⚠️ ★`daily-flow` / `story-daily` / `unlock-flow` は ★**自分で `begin`/`commit` しません**（✔ 確認済み）。
 *    → ★外側の取引に閉じ込められます。★`txid` の見張りも付けます。
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import { assertNotProduction } from './lib/guard.mjs';
import { beginSandbox, endSandbox } from './lib/sandbox-tx.mjs';
import { aggregateDay } from '../apps/worker/src/daily-flow.ts';
import { recordUnlockDistribution } from '../apps/worker/src/unlock-flow.ts';
import { recordStoryRows } from '../apps/worker/src/story-daily.ts';
import { dayIndexAt, dayStartMs } from '../packages/scheduler/src/index.ts';
import { loadConfig } from '../apps/worker/src/env.ts';

const env = loadEnv();
console.log('接続先:', env.STAR_ENV);
const c = new pg.Client({ connectionString: env.DATABASE_URL });
await c.connect();
await assertNotProduction(c, 'diag-dl1-daily.mjs');
/** ★`secrets.staging.env` の中身をそのまま渡す（★ワーカーと同じ設定で判定するため） */
const cfg = loadConfig({ ...process.env, ...env });
const __tx = await beginSandbox(c);
try {
  const nowMs = Number((await c.query(`select (extract(epoch from now())*1000)::bigint as ms`)).rows[0].ms);
  const idx = dayIndexAt(nowMs, cfg.epochMs);
  const from = new Date(dayStartMs(idx, cfg.epochMs)).toISOString();
  const to = new Date(dayStartMs(idx + 1, cfg.epochMs)).toISOString();
  const today = from.slice(0, 10);
  console.log(`\n★いまのゲーム内日: index=${idx} / ${from} .. ${to}（見出し ${today}）`);

  for (const [label, fn] of [
    ['① aggregateDay（point_flow_daily）', () => aggregateDay(c, today, from, to)],
    ['② recordUnlockDistribution（unlock_daily）', () => recordUnlockDistribution(c, today)],
    ['③ recordStoryRows（story_daily）', () => recordStoryRows(c, today)],
  ]) {
    try {
      const r = await fn();
      console.log(`  ✅ ${label}: 通った ${String(JSON.stringify(r) ?? "(返り値なし)").slice(0, 120)}`);
    } catch (e) {
      console.log(`  🔴 ${label}: ★落ちた — ${e.message.split('\n')[0]}`);
      if (e.code) console.log(`       code=${e.code} ${e.detail ?? ''}`);
    }
  }
} finally {
  await endSandbox(c, __tx);
  await c.end();
}
