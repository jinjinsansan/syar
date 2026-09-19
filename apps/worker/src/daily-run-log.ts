/**
 * ★**日次の枝に入ったことと、その結果を行に残す**（★2026-09-19・**DL-2**・移行 `0052`）
 *
 * 【🔴 ★なぜ要るか — ★1 か月 誰も気づきませんでした】
 *   ✔ ★実測（staging・2026-09-19）: ★`point_flow_daily` **0 行** ／ `story_daily` **0 行** ／
 *     ★`unlock_daily` は **2026-08-13** が最後。★コードは **2026-08-08** からあります。
 *   ✔ ★3 つの関数は ★**今日 動きます**（★実 DB で `rollback` 付きに通しました）。
 *   🔴 ★**それでも「なぜ書かれていないか」は DB から答えられませんでした。**
 *
 *   ★日次ブロックは失敗しても `console.error` を 1 行 出して ★**ループを続けます**（A-1）。
 *   → ★★**理由は標準出力にしか出ず、★誰も見ていませんでした**（★R-16 の教科書どおりの形）。
 *
 * 【★この層がすること・しないこと】
 *   ✅ ★**後から DB に問えるようにする**（★「最後に日次が通ったのはいつか」「何で落ちたか」）
 *   🔴 ★**止めません。** ★ワーカーは今までどおり続けます。★変わるのは見えることだけです。
 *   🔴 ★**この記録の失敗で、日次を止めません**（★記録のために本体を落とすのは本末転倒）。
 *
 * ⚠️ ★時刻は `now()`（サーバー）。★ワーカーの時計は使いません（憲法 4・§14）。
 * ⚠️ ★`day_index` は ★**`dayIndexAt()` が出した値**を渡すこと（★SQL で計算しない・D-052）。
 */

import type pg from 'pg';

/**
 * ★1 つの枝を走らせ、★**結果を行に残してから**返す。
 *
 * ★`fn` が投げたら ★**投げ直します**（★呼ぶ側の try/catch が今までどおり効く）。
 *   ★ただし ★**投げる前に「落ちた」ことを行に書きます**。
 *
 * @param dayIndex ★`dayIndexAt()` が出した値
 * @param step ★枝の名前（`aggregate` / `unlock` / `story` …）
 */
export async function runDailyStep<T>(
  client: pg.Client | pg.PoolClient,
  dayIndex: number,
  step: string,
  fn: () => Promise<T>,
  /**
   * ★**何行 書いたか**を返り値から取り出す（★任意）。
   * 🔴 ★**「落ちなかった」と「書いた」は別**です。★0 行の成功（＝静かな劣化）を見分けるために渡します。
   *    ★2026-09-19、`aggregateDay` を「✅ 通った」とだけ確かめて、★書いたかを数えていませんでした。
   */
  rowsOf?: (out: T) => number | undefined,
): Promise<T> {
  const startedAt = new Date();
  try {
    const out = await fn();
    await record(client, dayIndex, step, true, null, rowsOf?.(out), startedAt);
    return out;
  } catch (e) {
    await record(client, dayIndex, step, false, (e as Error).message, undefined, startedAt);
    throw e;
  }
}

async function record(
  client: pg.Client | pg.PoolClient,
  dayIndex: number,
  step: string,
  ok: boolean,
  detail: string | null,
  rowsWritten: number | undefined,
  startedAt: Date,
): Promise<void> {
  try {
    await client.query(
      `insert into daily_run_log (day_index, step, ok, detail, rows_written, started_at, finished_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (day_index, step) do update set
         ok = excluded.ok, detail = excluded.detail, rows_written = excluded.rows_written,
         started_at = excluded.started_at, finished_at = excluded.finished_at`,
      [dayIndex, step, ok, detail, rowsWritten ?? null, startedAt.toISOString()],
    );
  } catch (e) {
    /**
     * 🔴 ★**記録に失敗しても、日次は止めません。**
     *   ★記録のために本体を落とすのは本末転倒です（★`0052` が当たっていない DB でも動くこと）。
     * ⚠️ ★ただし ★**黙りません**。
     */
    console.error(
      `[worker] ★日次の記録を残せませんでした step=${step}: ${(e as Error).message}` +
      '（★移行 0052 が当たっていない可能性。★日次の処理そのものは続けます・DL-2）',
    );
  }
}
