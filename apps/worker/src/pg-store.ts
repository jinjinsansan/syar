/**
 * `CycleStore` の Postgres 実装（正典 §14）
 *
 * 【この層の責務】
 *   SQL はここだけに書きます。`cycle-runner.ts` は SQL を知りません。
 *   ★理由: ループの正しさ（A-2）を、DB 無しでテストできる状態に保つため。
 *     SQL を混ぜると「本番でしか試せない」ものになり、
 *     P2 指示書 §3 が予告した「ローカルでは動くが本番構成では動かない」に近づきます。
 *
 * 【時刻】
 *   `serverNowMs` は **Postgres の now()** を返します（§14）。
 *   ワーカーの時計は使いません。
 */

import type pg from 'pg';
import type { CycleStore, RaceSpec } from './cycle-runner.js';

export function createPgStore(client: pg.Client | pg.PoolClient): CycleStore {
  return {
    async serverNowMs(): Promise<number> {
      // ★ゲーム内時刻の真実は Postgres の now() のみ（§14）
      const r = await client.query<{ ms: string }>(
        `select (extract(epoch from now()) * 1000)::bigint::text as ms`,
      );
      return Number(r.rows[0]!.ms);
    },

    async tryLock(key: number): Promise<boolean> {
      // ★pg_try_advisory_lock は**待たない**。待つと落ちたプロセスのぶん詰まる
      const r = await client.query<{ ok: boolean }>(`select pg_try_advisory_lock($1) as ok`, [key]);
      return r.rows[0]!.ok;
    },

    async unlock(key: number): Promise<void> {
      await client.query(`select pg_advisory_unlock($1)`, [key]);
    },

    async raceExists(cycleIndex: number): Promise<boolean> {
      const r = await client.query<{ n: string }>(
        `select count(*)::text as n from races where cycle_index = $1`,
        [cycleIndex],
      );
      return Number(r.rows[0]!.n) > 0;
    },

    async createRace(spec: RaceSpec): Promise<void> {
      // ★on conflict do nothing: 存在確認と挿入の間に割り込まれても二重にならない。
      //   確認（raceExists）は無駄な生成計算を避けるためで、**一意性の担保はこちら**。
      //   確認だけに頼ると「確認 → 割り込み → 挿入」で二重になります。
      await client.query(
        `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                            track_condition, course_id, scheduled_at, seed_commit, purse, status)
         values ($1, $2, $3, $4, 'turf', 2000, 'good', 'C1',
                 to_timestamp($5 / 1000.0), $6, 0, 'scheduled')
         on conflict (cycle_index) do nothing`,
        [
          spec.cycleIndex,
          `R${spec.cycleIndex}`,
          classRankOf(spec.raceClass),
          spec.grade,
          spec.scheduledAtMs,
          spec.seedCommit,
        ],
      );
    },

    async pendingSettlements(nowMs: number): Promise<number[]> {
      const r = await client.query<{ cycle_index: number }>(
        `select cycle_index from races
          where status = 'scheduled' and scheduled_at <= to_timestamp($1 / 1000.0)
          order by cycle_index`,
        [nowMs],
      );
      return r.rows.map((x: { cycle_index: number }) => x.cycle_index);
    },

    async settleRace(cycleIndex: number): Promise<void> {
      // ★status を条件に含める。既に settled なら 0行更新で、**二重払戻にならない**
      await client.query(
        `update races set status = 'settled' where cycle_index = $1 and status = 'scheduled'`,
        [cycleIndex],
      );
    },
  };
}

/** クラス → class_rank（正典 §10.3 の順序） */
function classRankOf(c: string): number {
  const order = ['maiden', 'win1', 'win2', 'win3', 'open', 'graded'];
  const i = order.indexOf(c);
  if (i < 0) throw new Error(`未知のクラス: ${c}`);
  return i + 1;
}
