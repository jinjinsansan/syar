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

import { createHash, createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';
import { runCycle } from './cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from './env.js';
import { buildRace } from './build-race.js';
import { loadRaceablePool } from './horse-repo.js';
import { createPgStore, readDbEnvironment } from './pg-store.js';
import { seedCommitFor, serverSeedFor } from './seeding.js';

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

  // ★§8.6 の秘密。環境変数に無ければ**その場で作る**が、警告を出す。
  //   本番では STAR_SEED_SECRET を固定すること —
  //   毎回作ると、再起動をまたいだ commit/reveal の対応が取れなくなる。
  //   （生成時に server_seed を DB へ保存しているので直ちには壊れないが、
  //     保存前に落ちたレースは reveal を出せない）
  const secret = process.env.STAR_SEED_SECRET;
  if (secret === undefined || secret === '') {
    console.warn('[worker] ⚠️ STAR_SEED_SECRET が未設定です。起動ごとに秘密が変わります');
  }
  const effectiveSecret = secret !== undefined && secret !== '' ? secret : randomBytes(32).toString('hex');
  const hash = {
    sha256: (m: string) => createHash('sha256').update(m, 'utf8').digest('hex'),
    hmacSha256: (k: string, m: string) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
  };
  const seeds = {
    serverSeed: (i: number) => serverSeedFor(effectiveSecret, i, hash),
    seedCommit: (i: number) => seedCommitFor(effectiveSecret, i, hash),
  };

  // ★出走可能な馬を1回だけ読む。毎周読むと DB を無駄に叩く
  //   （プリシード集団は日次バッチでしか変わらない）
  const pool = await loadRaceablePool(client);
  console.log(`[worker] 出走可能な馬 ${pool.length} 頭`);

  const store = createPgStore(client, hash);
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
      const out = await runCycle(store, cfg.epochMs, seeds, (i) => buildRace(pool, i, cfg.epochMs));
      failures = 0;
      // ★毎周かならず記録する。
      //   当初は「生成か確定があったときだけ」出力していたが、それだと
      //   **プロセスが生きているだけの空回りと、実際に処理している状態を区別できない**。
      //   A-1 は「レースが実際に生成・確定・払戻されたことまで確認」する基準なので、
      //   周ごとの記録が無いと**測定そのものが成立しません**（指示書 §3 の警告どおり）。
      console.log(
        `[worker] cycle=${out.cycleIndex} phase=${out.phase} ` +
          `生成=[${out.created.join(',')}] 既存=${out.skipped.length} ` +
          `確定=[${out.settled.join(',')}]${out.lockBusy ? ' lock=busy' : ''}`,
      );
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
