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
// ★最初に読み込む。DB へ最初のクエリを出す前に型変換を有効にする必要があります
import { assertPgTypesConfigured } from './pg-types.js';
import { APPLICATION_NAME, formatResources, sampleResources } from './resources.js';
import { runCycle } from './cycle-runner.js';
import { assertEnvironmentMatches, loadConfig } from './env.js';
import { buildRace } from './build-race.js';
import { aggregateDay } from './daily-flow.js';
import { loadRaceablePool } from './horse-repo.js';
import { createPgStore, readDbEnvironment } from './pg-store.js';
import { seedCommitFor, serverSeedFor } from './seeding.js';
import { CANCEL_AFTER_START_MS } from '@star/scheduler';

/** 1周の間隔。★サイクル長より短くする（1サイクルを取りこぼさないため） */
export const TICK_MS = 60_000;

/** 連続で失敗した回数がこれを超えたら、異常として終了する（systemd が再起動する） */
export const MAX_CONSECUTIVE_FAILURES = 10;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new pg.Client({
    connectionString: cfg.databaseUrl,
    ssl: { rejectUnauthorized: false },
    // ★自分の接続に名前を付ける。pg_stat_activity には他の接続（Web・検証
    //   スクリプト・手で繋いだセッション）も見えるので、名前で絞らないと
    //   他人の増減を自分のリークと読み違えます
    application_name: APPLICATION_NAME,
  });
  await client.connect();

  // ★bigint の型変換が効いていることを最初に確かめる（`pg-types.ts`）。
  //   効いていないと台帳の金額が文字列で流れ、演算が静かに壊れます
  assertPgTypesConfigured();

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
  /** ★日次集計は1日1回でよい。毎周やると DB を無駄に叩く */
  let lastAggregated = '';

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
      const out = await runCycle(
        store,
        cfg.epochMs,
        seeds,
        (i) => buildRace(pool, i, cfg.epochMs),
        // ★開催中止は黙って通さない（正典 D-037）。
        //   静かに返還されると原因が調査されないまま繰り返します。
        //   ⚠️ ここは「客の金が戻った」記録です。**必ず目に付く形で残すこと。**
        (a) =>
          console.error(
            `[worker] ★★開催中止 cycle=${a.cycleIndex} ` +
              `返還 ${a.refundedBets}枚 / ${a.refundedEp} EP ` +
              `— 確定が ${CANCEL_AFTER_START_MS / 60000}分以内に完了しませんでした。原因を調査してください`,
          ),
      );
      failures = 0;
      // ★毎周かならず記録する。
      //   当初は「生成か確定があったときだけ」出力していたが、それだと
      //   **プロセスが生きているだけの空回りと、実際に処理している状態を区別できない**。
      //   A-1 は「レースが実際に生成・確定・払戻されたことまで確認」する基準なので、
      //   周ごとの記録が無いと**測定そのものが成立しません**（指示書 §3 の警告どおり）。
      // ★資源は毎周記録する。リークは「あとで見よう」では測れません
      //   （1回目の A-1 で、最長無停止区間の両端を記録しておらず取得できませんでした）
      const res = await sampleResources(client);
      console.log(
        `[worker] cycle=${out.cycleIndex} phase=${out.phase} ` +
          `生成=[${out.created.join(',')}] 既存=${out.skipped.length} ` +
          `確定=[${out.settled.join(',')}] ${formatResources(res)}` +
          // ★0件のときは出さない。毎周 中止=[] と出ると、実際に起きた周が埋もれます
          `${out.cancelled.length > 0 ? ` ★中止=[${out.cancelled.join(',')}]` : ''}` +
          `${out.lockBusy ? ' lock=busy' : ''}`,
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
    // --- 日次集計（§4.6・§11.2）---
    //   ★サーバー時刻の日付で判定する。ワーカーの時計は使わない
    try {
      const today = (await client.query<{ d: string }>('select current_date::text as d')).rows[0]!.d;
      if (today !== lastAggregated) {
        await aggregateDay(client, today);
        lastAggregated = today;
        console.log(`[worker] 日次集計を更新 date=${today}`);
      }
    } catch (e) {
      // ★集計の失敗でループを止めない（A-1 が壊れる）。ただし黙らせない
      console.error('[worker] 日次集計に失敗:', (e as Error).message);
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
