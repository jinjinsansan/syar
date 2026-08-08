/**
 * ワーカー本体（正典 §14 / 合格基準 A-1）
 *
 * 【止まらないことが仕事】
 *   A-1 は「10分サイクルが無人で24時間回り続けること」です。
 *   ★したがって**落ちない**ことより、**落ちても戻る**ことを設計します:
 *     - 1周の失敗でプロセスを終了しない（次の周で回復しうる）
 *     - 起動時の検査（環境ガード）だけは失敗させる（続けると壊れる）
 *   この2つの区別が要点です。「全部例外にする」と再起動ループになり、
 *   「全部握りつぶす」と壊れたまま回り続けます。
 *
 * 【時刻】
 *   `Date.now()` を使うのは**次の起床までの待ち時間の計算だけ**です。
 *   ゲームの判断はすべて Postgres の `now()`（`serverNowMs`）で行います。
 */

import pg from 'pg';
import { runCycle } from './cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from './env.js';
import { createPgStore, readDbEnvironment } from './pg-store.js';

/** 1周の間隔。★サイクル長より短くする（1サイクルを取りこぼさないため） */
export const TICK_MS = 60_000;

/** 連続で失敗した回数がこれを超えたら、異常として終了する（systemd が再起動する） */
export const MAX_CONSECUTIVE_FAILURES = 10;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new pg.Client({
    connectionString: cfg.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // ★起動時の検査。ここだけは失敗させる（続けると本番の台帳を壊す）
  assertEnvironmentMatches(cfg.env, await readDbEnvironment(client));
  console.log(`[worker] 起動 env=${cfg.env} tick=${TICK_MS}ms`);

  const store = createPgStore(client);
  let stopping = false;
  let failures = 0;

  // ★SIGTERM で綺麗に止める。処理の途中で殺されないよう、周の切れ目で抜ける
  //   （A-2 があるので途中で殺されても壊れませんが、無駄な再計算を避けます）
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`[worker] ${sig} を受けました。現在の周を終えて停止します`);
      stopping = true;
    });
  }

  while (!stopping) {
    const started = Date.now();
    try {
      const out = await runCycle(store, cfg.epochMs);
      failures = 0;
      if (out.lockBusy) {
        console.log(`[worker] cycle=${out.cycleIndex} 他プロセスが処理中`);
      } else if (out.created.length > 0 || out.settled.length > 0) {
        console.log(
          `[worker] cycle=${out.cycleIndex} phase=${out.phase} ` +
            `生成=[${out.created.join(',')}] 確定=[${out.settled.join(',')}]`,
        );
      }
    } catch (e) {
      failures += 1;
      // ★1周の失敗で終了しない。次の周で回復しうる
      console.error(`[worker] 周の処理に失敗（連続 ${failures} 回目）:`, (e as Error).message);
      if (failures > MAX_CONSECUTIVE_FAILURES) {
        // ★ただし回復しないなら終了する。壊れたまま回り続けるほうが悪い
        console.error(`[worker] ${MAX_CONSECUTIVE_FAILURES} 回連続で失敗したため終了します`);
        break;
      }
    }
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - elapsed)));
  }

  await client.end();
  console.log('[worker] 停止しました');
}

main().catch((e) => {
  console.error('[worker] 起動に失敗:', (e as Error).message);
  process.exit(1);
});
