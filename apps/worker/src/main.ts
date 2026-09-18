/**
 * ワーカー本体（正典 §14 / 合格基準 A-1）
 *
 * 【止まらないことが仕事】
 *   A-1 は「★サイクル（★D-007 再改訂で 6 分）が無人で24時間回り続けること」です。
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
import { announceConditions, buildRace } from './build-race.js';
import { aggregateDay } from './daily-flow.js';
import { loadHorsesByIds, loadRaceablePool, loadTrainingStates, loadWinsByHorse } from './horse-repo.js';
import { createPgStore, readDbEnvironment } from './pg-store.js';
import { seedCommitFor, serverSeedFor } from './seeding.js';
import { advanceTrainingWeeks } from './training-runner.js';
import { recordUnlockDistribution, unlockDrift } from './unlock-flow.js';
import { formatStoryDay, recordStoryRows } from './story-daily.js';
import { STORY_EVENT_TYPES } from '@star/training';
import { MARKET_TARGET_LISTINGS, refreshMarketListings } from './market-flow.js';
import { syncStableGradePrices } from './grade-flow.js';
import { freezePendingEntries } from './entry-freeze.js';
import { runSelfcheck } from './selfcheck.js';
import { runSchemacheck } from './schemacheck.js';
import {
  CANCEL_AFTER_START_MS, CYCLE_MS, classOf, conditionsOf, gradeOf,
  weekIndexAt, weekStartMs, dayIndexAt, dayStartMs,
} from '@star/scheduler';
// ★投票の上限の正（★2026-09-19・BT-1。★ワーカーが `bet_limits` に書き、RPC はその行を読む）
import {
  BET_CAP_PER_KIND_EP, BET_CAP_PER_RACE_EP, BET_CAP_PER_DAY_EP, BET_CAP_OWN_RACE_EP,
} from '@star/betting';

/** 1周の間隔。★サイクル長より短くする（1サイクルを取りこぼさないため） */
export const TICK_MS = 60_000;

/** 連続で失敗した回数がこれを超えたら、異常として終了する（systemd が再起動する） */
export const MAX_CONSECUTIVE_FAILURES = 10;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new pg.Client({
    connectionString: cfg.databaseUrl,
    ssl: { rejectUnauthorized: false },
    // ★名前は付けるが、**数えるのには使えません**。
    //   Supabase のプーラ（Supavisor）が application_name を上書きするため、
    //   Postgres 側からはこの名前が見えません（実測で確認）。
    //   リーク検出はプロセス側の FD／ソケット数で行います（resources.ts）。
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

  /**
   * ★出走可能な馬。★**毎周は読みません**（★DB を無駄に叩く）。
   *
   * 🔴 ★**2026-09-19・EN-4 ② で「起動時に 1 回だけ」をやめました。**
   *   ★旧の註記は「プリシード集団は日次バッチでしか変わらない」でしたが、
   *   ★**もう本当ではありません** — ★引退・購入・繁殖で変わります。
   *   → ★**週送りが進んだ後に読み直します**（★下のループの中）。
   * ⚠️ ★`const` のまま ★**中身を入れ替えます**（★`buildRace` に渡す参照を保つため）。
   */
  /**
   * ★★**上限で切ったら黙らない**（★**PO-2**・2026-09-19）。
   * ✔ ★staging の実測: ★条件に合う **4,389 頭** のうち ★**3,000 頭しか読みません**。
   *   ★`order by id` なので ★**毎回おなじ 1,389 頭が一度も出走表に載りません**。
   * ⚠️ ★上限を上げるのは **AL-11 / D-117 の便**（★顔ぶれが変わる → V-4/V-5/V-6 の取り直し）。
   */
  const onPoolTruncated = (eligible: number, used: number): void => {
    console.error(
      `[worker] ★出走可能な馬を上限で切りました ${eligible} 頭中 ${used} 頭`
      + `（★残り ${eligible - used} 頭は一度も出走表に載りません・PO-2）`,
    );
  };
  const pool = await loadRaceablePool(client, undefined, onPoolTruncated);
  console.log(`[worker] 出走可能な馬 ${pool.length} 頭`);

  /**
   * ★`epochMs` を渡すのは ★**生涯の記録（§18）のゲーム内の週**のためです。
   *   ⚠️ ★渡さないと物語を書きません（★週が分からないまま 0 週で書かない・`pg-store.ts` の註記）。
   */
  const store = createPgStore(client, hash, {
    epochMs: cfg.epochMs,
    onStoryError: (e) => console.error(
      `[worker] ★生涯の記録の書き込みに失敗 cycle=${e.cycleIndex}: ${e.message}` +
      `（★確定と払戻は済んでいます。記録は着順にも経済にも効きません・§18 LR-5）`,
    ),
  });
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
      /**
       * ★B-6（調子・疲労）と Q-P3-29（能力の実データ化）を**揃えて入れています**
       *   （2026-08-12・Q-P3-35 の裁定）。
       *
       * 【なぜ揃えるのか】
       *   ハーネスで4通り測りました。**帯に入るのは①と③だけ**です:
       *     ①どちらも無し           V-4 31.29% / V-5 62.40%  ✓
       *     ①＋B-6 だけ             V-4 34.60% / V-5 65.83%  ✗ 帯外
       *     ②能力だけ               V-4 29.20% / V-5 59.78%  ✗ 帯外
       *     ★③両方                 V-4 32.73% / V-5 63.99%  ✓
       *   → **2つの是正は V-4 を逆向きに動かし、揃えたときだけ帯に入ります。**
       *     ★片方だけ入れると、途中で必ず落ちる状態を通ります。
       *
       * 【本番の実分布でも確認済み】
       *   staging の 3,000頭をそのままハーネスに食わせて:
       *     V-4 32.32% / V-5 63.26% / V-6 1.00% / V-8 93.59% / V-13 0.165  全 PASS
       *
       * ⚠️ **どちらか片方だけを外さないこと。** 外すなら両方です。
       */
      /**
       * ── ★出走登録の凍結を埋める（★正典 D-111 ②③・移行 `0028`）──────────
       *
       *   ★`enter_race` は受付までなので、★**凍結はここで、生成と同じ関数で書きます**。
       *   ★発走前に埋まらない馬は ★**その馬だけ取消**にし、★レースは止めません（D-111 ③）。
       *   ⚠️ ★**確定より前**に置きます（★確定に間に合わないと D-056 でレースごと中止になる）。
       *   ★失敗しても周を止めません（A-1）。ただし黙らせません。
       */
      try {
        const f = await freezePendingEntries(client, (m) => console.error(`[worker] ★${m}`));
        if (f.frozen > 0 || f.scratched > 0) {
          console.log(
            `[worker] 出走登録の凍結 ${f.frozen} 頭 / 取消 ${f.scratched} 頭` +
            `${f.refundedEp > 0 ? ` / 返金 ${f.refundedEp.toLocaleString()} EP` : ''}`,
          );
        }
      } catch (e) {
        console.error('[worker] 出走登録の凍結に失敗:', (e as Error).message);
      }

      const trainingStates = await loadTrainingStates(client);
      /**
       * ★**出走資格に使う勝利数**（★CL-1/CL-3）。★周に 1 回だけ読み、その周の全レースで使い回します。
       *   ⚠️ ★`horses` に勝利数の列は無いので `race_entries` から数えます（`finish_pos = 1`）。
       */
      const winsByHorse = await loadWinsByHorse(client);
      const out = await runCycle(
        store,
        cfg.epochMs,
        seeds,
        /**
         * ★**公示の条件**（★2026-09-19・**D-117** ①）。★番組表 ＋ 馬場状態。
         *   ★出走馬も母集団も見ません。★ここで引いた馬場状態が行に書かれ、
         *   ★組成（下）は**その行を読み直します**（D-052）。
         */
        (i) => announceConditions(cfg.epochMs, i, conditionsOf(i, classOf(i), gradeOf(i))),
        async (i, conditions, registered) => {
          const raceClass = classOf(i);
          /**
           * ★**登録した馬の行**（★D-117 **DS-2**）。★`pool` には入っていません
           *   （★`pool` は `owner_id is null` ＝ NPC だけ）。★名指しで読みます。
           * ⚠️ ★引けなければ投げます — ★組成は止まります。★黙って落とすと
           *    ★「登録できたのに走らない馬」になり、★料金だけ取られます（R-16）。
           */
          const registeredHorses = await loadHorsesByIds(client, registered);
          const built = buildRace(pool, i, cfg.epochMs, undefined, trainingStates,
            {
              // ★番組表（§10.3）が距離・馬場・コースを決める（Q-P3-32）
              ...conditionsOf(i, raceClass, gradeOf(i)),
              /**
               * ★**公示の行から読んだ馬場と走路**（★D-117・引き直さない・R-30）。
               *   ★公示のときプレイヤーに見せたものと ★**同じもの**でオッズを計算します。
               */
              trackCondition: conditions.trackCondition,
              courseFrozen: conditions.courseFrozen,
            },
            // ★資格の層（★CL-3）。★選抜（能力の帯）はこの下でそのまま働きます
            { raceClass, winsOf: (h) => winsByHorse.get(h.id) ?? 0 },
            /**
             * ★**登録した馬を必ず入れる**（★2026-09-19・**D-117 DS-2**）。
             * ⚠️ ★`pool` は `owner_id is null` で絞っているので、★登録馬はそこにいません。
             *    ★**別に読みます**（`loadHorsesByIds`）。★読めなければ組成を止めます —
             *    ★黙って落とすと「登録できたのに走らない馬」になります（R-16）。
             */
            registeredHorses);
          /**
           * 🔴 ★**登録した馬が出走表に入っているか**（★D-117 **DS-2**）。
           *   ★`fillRace` も同じことを見ますが、★**ここで先に言います**（★どの段で落ちたか分かるように）。
           */
          if (registered.length > 0) {
            const missing = registered.filter((h) => !built.entrants.some((e) => e.horseId === h));
            if (missing.length > 0) {
              console.error(
                `[worker] 🔴 ★登録した ${missing.length} 頭が出走表に入りません cycle=${i}` +
                  `（★DS-2・組成は失敗します）`,
              );
            }
          }
          // 🔴 ★**資格を広げたら黙って通さない**（★D-079 ⑦ と同じ形・CL-3）
          if (built.eligibility !== null && built.eligibility.widenedSteps > 0) {
            console.error(
              `[worker] ★出走資格を広げました cycle=${i} class=${built.eligibility.raceClass} ` +
                `広げた段数=${built.eligibility.widenedSteps} 資格のある馬=${built.eligibility.poolSize} 頭` +
                `（★そのクラスの馬が足りていません。★流量を見てください・CL-7）`,
            );
          }
          return built;
        },
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
      const res = sampleResources();
      /**
       * ★周の所要時間を毎周出します（レビュー側指定・2026-08-12）。
       *
       *   A-1 は「10分サイクルが無人で回り続ける」ですが、
       *   **最初の PASS は1周116秒の観測**でした。D-035 で M が 3,896,104 になり、
       *   1レースの生成に時間がかかるようになったので、**余裕は動きます**。
       *   ★ログに出していないと、余裕が減っていることに気づく契機がありません。
       *
       *   ★`Date.now()` を使うのは「経過時間の計測」だけです（憲法④）。
       *     ゲームの判断はすべて Postgres の `now()` で行っています。
       */
      const cycleMs = Date.now() - started;
      console.log(
        `[worker] cycle=${out.cycleIndex} phase=${out.phase} ` +
          `公示=[${out.announced.join(',')}] 生成=[${out.filled.join(',')}] 既存=${out.skipped.length} ` +
          // ★★遅れ（DS-8）と間に合わなかったレース（DS-7）。★0 でない周は調査対象
          (out.fillDeferred.length > 0 ? `★組成待ち=[${out.fillDeferred.join(',')}] ` : '') +
          (out.fillFailed.length > 0 ? `🔴組成間に合わず中止=[${out.fillFailed.join(',')}] ` : '') +
          `確定=[${out.settled.join(',')}] ` +
          // ★1 周に対する割合も出す。秒数だけだと余裕が読み取れません。
          // 🔴 ★**ここは 600000（10 分）の直書きでした**（★2026-09-18・T-13 で発見）。
          //   ★D-007 改訂で 1 周が 3 分になっても割合だけ 10 分基準のままになり、
          //   ★**配備後に読む「周の使用率」が 1/3.3 に見える**ところでした（★R-28 で読む数字そのもの）。
          `周=${(cycleMs / 1000).toFixed(1)}s(${((cycleMs / CYCLE_MS) * 100).toFixed(1)}%) ` +
          `${formatResources(res)}` +
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
      /**
       * 🔴 ★**2026-09-19・BT-6 ②⑤ — ★「1 日」を `current_date` で決めるのをやめました。**
       *
       *   ★旧: `select current_date::text` — ★**セッションの TimeZone** にしたがいます。
       *   ★`bet_allowance`（PostgREST の接続）は `date_trunc('day', now())` を使っていて、
       *   ★★**同じ「1 日」のつもりで、別々に切れうる 2 つ**でした。
       *   → ★**`dayIndexAt` / `dayStartMs` の 1 本から引きます**（★`week_started_at` と同じ形）。
       * ⚠️ ★日付の文字列は ★**見出しだけ**に使います（★範囲の判定は境目の瞬間で行います）。
       */
      const dayNowMs = Number(
        (await client.query<{ ms: string }>(
          'select (extract(epoch from now()) * 1000)::bigint as ms',
        )).rows[0]!.ms,
      );
      const dayIdx = dayIndexAt(dayNowMs, cfg.epochMs);
      const dayFromMs = dayStartMs(dayIdx, cfg.epochMs);
      const dayToMs = dayStartMs(dayIdx + 1, cfg.epochMs);
      const today = new Date(dayFromMs).toISOString().slice(0, 10);
      if (today !== lastAggregated) {
        await aggregateDay(client, today, new Date(dayFromMs).toISOString(), new Date(dayToMs).toISOString());
        lastAggregated = today;
        /**
         * ★開放率の分布も毎日残す（レビュー側裁定 2026-08-12）。
         *   P1 のゲートはこの分布の上に立っているので、
         *   **測定時からずれたらゲートを測り直す**ための記録です。
         */
        const u = await recordUnlockDistribution(client, today);
        /**
         * ★**生涯の記録の行数も毎日残す**（★正典 §18 **LR-10**・移行 `0029`・2026-09-16）。
         *
         * ⚠️ ★**閾値は置きません**（★裁定 `REVIEW_STORY_GROWTH_VERDICT_20260916.md`）。
         *    ★見るのは「★急に増えた／★**急に止まった**」という変化です。
         * ⚠️ ★**新しい仕組みを作りません** — ★この日次の枠に 1 本足すだけです。
         * ★2026-09-16 に ★**15 種のうち 2 種しか書かれていない**ことが、★測って初めて分かりました。
         *   ★だから ★**「止まった」を捕まえられること**が大事です（★増えすぎより、増えないほうが起きています）。
         */
        /**
         * ⚠️ ★**独自の try/catch で囲みます**（★隣の出品の更新・格の値段と同じ形）。
         *    ★囲まないと、★`story_daily` が無い DB（★移行 `0029` 未適用）で投げた瞬間に
         *    ★**この後ろの出品の更新と格の値段の更新まで、毎日まとめて止まります**。
         *    ★しかも出るのは「日次集計に失敗」の 1 行だけで、★何が止まったか読めません。
         * ⚠️ ★記録は ★**着順にも経済にも効きません**（§18 LR-5）。★止めてよい側です。
         */
        try {
          const story = await recordStoryRows(client, today);
          console.log(`[worker] ${formatStoryDay(story, STORY_EVENT_TYPES)}`);
        } catch (e) {
          console.error(
            `[worker] ★生涯の記録の行数を残せませんでした: ${(e as Error).message}` +
            `（★移行 0029 が当たっていない可能性。★他の日次の処理は続けます・§18 LR-10）`,
          );
        }
        console.log(
          `[worker] 日次集計を更新 date=${today}` +
          (u === null ? ' / 開放率: 対象0頭'
            : ` / 開放率 平均${(u.mean * 100).toFixed(1)}% SD${(u.sd * 100).toFixed(1)}pt ` +
              `(${(u.p10 * 100).toFixed(0)}/${(u.p50 * 100).toFixed(0)}/${(u.p90 * 100).toFixed(0)}) ` +
              `週齢平均${u.ageMean.toFixed(0)} ${u.horses}頭`),
        );
        /**
         * ★**ずれたら黙らせない**（レビュー側裁定 2026-08-13）。
         *
         *   これまでは記録するだけで、「測定時からずれたら測り直してください」は
         *   ★**手順**でした。手順は読まれなければ働きません。
         *   → ワーカー自身がゲートを測ったときの分布と突き合わせ、**目に付く形で出します**。
         *
         *   ⚠️ ここで `UNLOCK_BASELINE` を実測に合わせて更新しないこと。
         *      更新すれば警告は消えますが、**消えるのは警告であってずれではありません。**
         */
        if (u !== null) {
          const drift = unlockDrift(u);
          if (drift.length > 0) {
            console.error(
              `[worker] ★★開放率が P1 のゲートを測ったときの分布からずれています — ` +
                drift.map((d) => `${d.key} ${(d.baseline * 100).toFixed(1)}% → ${(d.now * 100).toFixed(1)}%`
                  + `（${d.diff >= 0 ? '+' : ''}${(d.diff * 100).toFixed(1)}pt）`).join(' / ') +
                '。V-4/V-5/V-6 はこの分布の上に立っているので、測り直してください（D-053）',
            );
          }
        }

        /**
         * ── ★馬の購入の出品を作り直す（★D-102・移行 `0025`）───────────
         *
         *   ★帯（段）と価格は ★**TS 側**（`bandOfPotential` / `priceOfStars`）が出し、
         *   ★**行には価格だけ**を書きます（★段は書きません — D-114 ②・移行 `0036`）。
         *   ★SQL には式を書きません（★D-052・二重帳簿にしない）。
         *   ★在庫が下限を割ったら ★**警報だけ**出し、★帯は広げません（D-102 ⑤）。
         *
         *   ★集計と同じ「1 日 1 回」に置きます（★毎周やると DB を無駄に叩く）。
         *   ★失敗しても周を止めません（A-1）。ただし黙らせません。
         */
        try {
          const m = await refreshMarketListings(client, (msg) => console.error(`[worker] ★${msg}`));
          console.log(
            `[worker] 出品を更新 在庫${m.available}頭 / 下ろし${m.deactivated} / 追加${m.added}` +
            `（目安 ${MARKET_TARGET_LISTINGS} 口）${m.stockOk ? '' : ' ★在庫が下限を割っています'}`,
          );
        } catch (e) {
          console.error('[worker] 出品の更新に失敗:', (e as Error).message);
        }

        /**
         * ── ★厩舎の格の値段を書く（★D-103 ④・移行 `0027`）───────────
         *   ★値段は TS 側（`GRADE_UNLOCK_EP`）が持ち、★SQL には数を書きません（D-052）。
         *   ★値が同じなら書きません（★冪等）。
         */
        try {
          const g = await syncStableGradePrices(client);
          if (g.written > 0) console.log(`[worker] 厩舎の格の値段を更新 ${g.written} 行`);
        } catch (e) {
          console.error('[worker] 厩舎の格の値段の更新に失敗:', (e as Error).message);
        }
      }
    } catch (e) {
      // ★集計の失敗でループを止めない（A-1 が壊れる）。ただし黙らせない
      console.error('[worker] 日次集計に失敗:', (e as Error).message);
    }

    /**
     * ── ★週送り（正典 §7・P3 の本体）─────────────────────────
     *
     *   ★毎周呼びますが、**進むのは週が締まったときだけ**です
     *   （`weeksToProcess` が空を返せば何もしません）。
     *   ★サイクルは 6 分、週は `CYCLES_PER_WEEK` = 40 サイクル = 4 時間なので、★40 周に 1 回だけ動きます
     *   （★2026-09-18・D-007 改訂。★どちらも定数から導くので、この数え方は式に従います）。
     *
     *   ★レースの生成・確定より**後**に置いています。
     *     前に置くと、7,000頭の週送りが終わるまで確定が待たされます。
     *     確定は客が結果を待っている処理で、余裕がありません（D-038 と同じ考え方）。
     *
     *   ★失敗しても周を止めません（A-1）。ただし黙らせません。
     */
    try {
      const nowMs = Number(
        (await client.query<{ ms: string }>(
          'select (extract(epoch from now()) * 1000)::bigint as ms',
        )).rows[0]!.ms,
      );
      /**
       * ★**いまが何週かを書き出す**（★2026-09-19・**UI1-10**・移行 `0038`）。
       *
       *   ★画面は ★**開催の起点（epoch）も 1 週の長さも知りません** —
       *   ★知ってしまうと ★**画面が時計を持つ**ことになります（★正典 §14・憲法 3）。
       *   → ★**ここで書き**、★画面は `world_state_public` を読むだけにします。
       *
       * ⚠️ ★**週が進むかどうかに関わらず、毎周書きます**。
       *    ★`updated_at` が古ければ ★**ワーカーが止まっている**と分かる形にするためです。
       *    ★「週が進んだときだけ書く」と、★**4 時間古いのが正常**になり、★止まったのと区別できません。
       */
      /**
       * ★**週の始まりの実時刻も書きます**（★2026-09-19・**UI-4**・移行 `0048`）。
       *   ★`/records` は台帳を「今週」で絞りますが、★台帳が持つのは `created_at`（実時刻）だけです。
       *   ★画面に epoch を渡さずに済ませるため、★**変換した結果**をここに置きます
       *   （★BT-6 ② が「ワーカーが `day_started_at` を毎周書く」と定めたのと同じ形）。
       * ⚠️ ★**`game_week` と同じ週番号から導きます**（★2 通りの導き方を作らない・D-052）。
       */
      const weekIndex = weekIndexAt(nowMs, cfg.epochMs);
      /**
       * ★**「1 日」の境目も、同じ 1 本から書きます**（★2026-09-19・**BT-6 ②⑤**・移行 `0050`）。
       *   ★`bet_allowance` は ★**この行を読むだけ**になりました（★`date_trunc` をやめた）。
       * ⚠️ ★**ワーカー自身の日次の判定も `dayIndexAt`** から引いています（★上の日次集計）。
       *    ★片方だけ直すと「直した」という記憶だけが残ります（★裁定 BT-6 ⑤）。
       */
      await client.query(
        `insert into world_state (id, game_week, week_started_at, day_started_at, updated_at)
         values (true, $1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), now())
         on conflict (id) do update set game_week = excluded.game_week,
           week_started_at = excluded.week_started_at,
           day_started_at = excluded.day_started_at, updated_at = excluded.updated_at`,
        [weekIndex, weekStartMs(weekIndex, cfg.epochMs), dayStartMs(dayIndexAt(nowMs, cfg.epochMs), cfg.epochMs)],
      );

      /**
       * ★**投票の上限を書き出す**（★2026-09-19・**BT-1 / BT-4**・移行 `0044`）。
       *
       *   ★★**正 ＝ `@star/betting` の `BET_CAP_*`**。★`place_bet` はこの行の値で判定します
       *   （★D-103 ④ の先例。★旧は SQL に 4 つ直書きしていました）。
       *
       * ⚠️ ★**値が変わらなくても毎周書きます**（BT-4 ①・UI1-10 と同じ理由）。
       *    ★「変わったときだけ」だと ★**止まったのと区別できません**（R-16）。
       * ⚠️ ★**古い行は通してよい**（BT-4 ③）— ★上限は時間で変わる値ではありません。
       *    ★古さで弾く形にすると、★**ワーカーが落ちた瞬間に誰も投票できなくなります**。
       */
      await client.query(
        `insert into bet_limits (id, per_kind_ep, per_race_ep, per_day_ep, own_race_ep, updated_at)
         values (true, $1, $2, $3, $4, now())
         on conflict (id) do update set
           per_kind_ep = excluded.per_kind_ep, per_race_ep = excluded.per_race_ep,
           per_day_ep = excluded.per_day_ep, own_race_ep = excluded.own_race_ep,
           updated_at = excluded.updated_at`,
        [BET_CAP_PER_KIND_EP, BET_CAP_PER_RACE_EP, BET_CAP_PER_DAY_EP, BET_CAP_OWN_RACE_EP],
      );

      const t = await advanceTrainingWeeks(client, nowMs, cfg.epochMs,
        (m) => console.error(`[worker] ★${m}`));
      if (t.advanced > 0) {
        console.log(
          `[worker] 週送り 週=${t.weeks.join(',')} ` +
          `延べ${t.advanced}頭 / 引退${t.retired}頭 / EP ${t.epSpent.toLocaleString()}`,
        );
        /**
         * ── ★★**出走可能な馬を読み直す**（★2026-09-19・**EN-4 ②**）──────────
         *
         * 【🔴 ★何が起きていたか】
         *   ★プールは ★**起動時に 1 回だけ**読まれていました（`const pool` は while の外）。
         *   ★`loadRaceablePool` の `where` は ★**「ワーカーが起動した瞬間の真実」**でしかありません。
         *   → ★**時間が経つだけで、機構が効かなくなります**（★R-16 の親戚。★誰の操作も要りません）:
         *     ★① `retired_at_week is null`（CL-3）… ★週送りで引退した馬が出走表に載り続ける
         *     ★② `owner_id is null`（EN-1）… ★買われた馬が次の再起動まで残る
         *     ★③ 旧の註記「プリシード集団は日次バッチでしか変わらない」は ★**もう本当ではない**
         *
         * 【★なぜ「週送りの後」か】★レビュー側の見立てどおり
         *   ★引退も購入も繁殖も ★**週送りで起きます**。★周ごとに読み直すと DB を無駄に叩き、
         *   ★週送りが無かった周は ★**1 ビットも変わりません**。
         * ⚠️ ★`t.advanced > 0` の中に置いているのはそのためです（★週が進んだときだけ）。
         *
         * ✔ ★**再現は壊れません** — ★出走馬は `0016` の凍結に記録されており、
         *    ★再計算はそこから導きます（★レビュー側が確かめた・EN-4 ③）。
         *
         * ⚠️ ★失敗しても周を止めません（A-1）。★ただし ★**黙らせません** —
         *    ★黙ると「古いプールで走り続けている」ことに誰も気づきません。
         */
        try {
          const before = pool.length;
          const fresh = await loadRaceablePool(client, undefined, onPoolTruncated);
          pool.length = 0;
          // ⚠️ ★`push(...fresh)` は使いません（★引数の数に上限があり、★プールが育つと落ちます）
          for (const h of fresh) pool.push(h);
          console.log(`[worker] 出走可能な馬を読み直しました ${before} → ${pool.length} 頭`);
        } catch (e) {
          console.error(
            '[worker] ★出走可能な馬の読み直しに失敗:', (e as Error).message,
            '（★古いプールで走り続けます。★引退した馬・買われた馬が出走表に載りえます・EN-4 ②）',
          );
        }
      }
    } catch (e) {
      // ★週送りの失敗でループを止めない（A-1 が壊れる）。ただし黙らせない
      console.error('[worker] 週送りに失敗:', (e as Error).message);
    }

    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - elapsed)));
  }

  await client.end();
  console.log('[worker] 停止しました');
}

/**
 * ★`--selfcheck` は**設定を読む前**に処理します（D-043）。
 *   `loadConfig()` は STAR_ENV などを要求するので、後ろに置くと
 *   「環境変数が無いと自己検査もできない」形になります。
 *   ★配る物を**どこでも**走らせて確かめられることが要点です。
 */
/**
 * ★`--schemacheck` は DB に繋ぎます（`--selfcheck` と違う点）。
 *   配備前に「繋ぎ先がこのコードを動かせる形か」を確かめるためです。
 *   2026-08-12、これが無いまま配備してワーカーが10回連続失敗しました。
 */
if (process.argv.includes('--schemacheck')) {
  runSchemacheck()
    .then((r) => {
      for (const line of r.report) console.log(line);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e: unknown) => {
      console.error('[worker] schemacheck に失敗:', (e as Error).message);
      process.exit(1);
    });
} else if (process.argv.includes('--selfcheck')) {
  // ★動的 import を使いません。**CJS バンドルはトップレベル await を許しません**
  //   （esbuild が「Top-level await is currently not supported with the cjs output format」で落ちます）。
  //   ★ここで落ちると、配る物が作れなくなります。静的に読み込みます。
  const r = runSelfcheck();
  for (const line of r.report) console.log(line);
  process.exit(r.ok ? 0 : 1);
} else {
  /**
   * ★検査の旗が付いているときは **`main()` を呼びません**。
   *
   * 【なぜ else が要るか（2026-08-12 に踏みました）】
   *   `--schemacheck` は非同期なので、`process.exit` が走る前に**下の `main()` も始まります**。
   *   実際に `[worker] 起動 env=staging` が出ました。
   *   ★**検査のつもりでワーカーを起動していた**ことになります。
   *     本番に向けて流したら、周回が始まってレースを作りかねません。
   *   `--selfcheck` は同期なので偶然表面化しませんでしたが、同じ穴でした。
   */
  main().catch((e) => {
    console.error('[worker] 起動に失敗:', (e as Error).message);
    process.exit(1);
  });
}
