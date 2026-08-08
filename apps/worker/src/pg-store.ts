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

    /**
     * レースを作る。★**レース行・出走表・オッズを同一トランザクションに収める**。
     *
     *   advisory lock は「二重に作らない」を守りますが、**半端な生成**は防げません:
     *     レース行を作る →（ここで SIGKILL）→ オッズが無いレースが残る
     *   オッズが無いと place_bet が「発売していない買い目」で全部拒否するので、
     *   **誰も買えないレースが番組に並びます**。
     *   A-2 で確認したのは「重複しないこと」だけで、この状態は見ていませんでした。
     *   → トランザクションで、途中で落ちれば全部消えるようにします（A-5 と同じ構造）。
     */
    async createRace(spec: RaceSpec): Promise<void> {
      await client.query('begin');
      try {
      // ★on conflict do nothing: 存在確認と挿入の間に割り込まれても二重にならない。
      //   確認（raceExists）は無駄な生成計算を避けるためで、**一意性の担保はこちら**。
      //   確認だけに頼ると「確認 → 割り込み → 挿入」で二重になります。
      const ins = await client.query(
        `insert into races (cycle_index, name, class_rank, grade, surface, distance,
                            track_condition, course_id, scheduled_at, seed_commit, server_seed, purse, status)
         values ($1, $2, $3, $4, $8, $9, 'good', $10,
                 to_timestamp($5 / 1000.0), $6, $7, 0, 'scheduled')
         on conflict (cycle_index) do nothing`,
        [
          spec.cycleIndex,
          `R${spec.cycleIndex}`,
          classRankOf(spec.raceClass),
          spec.grade,
          spec.scheduledAtMs,
          spec.seedCommit,
          // ★保存する。公開経路（races_public）には含めない
          spec.serverSeed,
          spec.conditions.surface,
          spec.conditions.distance,
          spec.conditions.courseId,
        ],
      );
        // ★挿入されなかった＝他プロセスが先に作った。何もせず抜ける（重複させない）
        if (ins.rowCount === 0) {
          await client.query('rollback');
          return;
        }
        const raceId = (await client.query<{ id: string }>(
          'select id from races where cycle_index = $1', [spec.cycleIndex],
        )).rows[0]!.id;

        // --- 出走表（§10.4 の同格帯から。D-018: 無作為だと V-4 が壊れる）---
        for (const e of spec.entrants) {
          await client.query(
            `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity)
             values ($1,$2,$3,$4,$5,$6)`,
            [raceId, e.horseId, e.gate, e.weightKg, e.strategy, e.popularity ?? null],
          );
        }

        // --- オッズ（§9.2）---
        for (const o of spec.odds) {
          await client.query(
            `insert into race_odds (race_id, bet_type, selection, probability, odds, capped)
             values ($1,$2,$3::jsonb,$4,$5,$6)`,
            [raceId, o.betType, JSON.stringify(o.selection), o.probability, o.odds, o.capped],
          );
        }
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
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
      //   確定時に server_seed を seed_reveal として公開する（§8.6）
      await client.query(
        `update races set status = 'settled', seed_reveal = server_seed
          where cycle_index = $1 and status = 'scheduled'`,
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

/**
 * ★A-7: DB 側の環境宣言を読む（§14.6）。
 *   行が無ければ null を返し、呼び出し側が**起動を失敗させる**。
 *   ここで既定値を返さないこと — 「不明なら安全側」は
 *   「不明なら止める」であって「不明なら production でないとみなす」ではありません。
 */
export async function readDbEnvironment(client: pg.Client | pg.PoolClient): Promise<string | null> {
  const r = await client.query<{ environment: string }>(
    `select environment from app_environment limit 1`,
  );
  return r.rows[0]?.environment ?? null;
}
