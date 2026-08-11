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
// ★副作用の import。読み込んだ時点で int8 の型変換が有効になります。
//   `pg-store` は SQL を出す唯一の層なので、ここを通れば必ず設定済みです。
import { assertPgTypesConfigured } from './pg-types.js';
import type { RaceEntrant } from '@star/race-engine';
import { rowToHorse } from './horse-repo.js';
import { awardPrizes } from './prize-award.js';
import { settlePayouts } from './payout.js';
import { settleRace as settleRaceFair } from './settle.js';
import type { CycleStore, RaceSpec } from './cycle-runner.js';
import { overdueBefore } from '@star/scheduler';
import { cancelRace as cancelRaceImpl } from './cancel.js';

/**
 * ★`cycle_index` は bigint なので、`pg` は**文字列で返します**。
 *   `number[]` と型付けしたまま素通しすると、型は通るのに中身は文字列で、
 *   数値として比較した瞬間に静かに外れます（`horse-repo` で潰したのと同じ形）。
 *   ここで必ず数値に直し、直せなければ**黙って進まない**。
 */
export function toCycleIndexes(rows: readonly { cycle_index: number | string }[]): number[] {
  return rows.map((r) => {
    const n = Number(r.cycle_index);
    if (!Number.isFinite(n)) throw new Error(`cycle_index を数値にできません: ${String(r.cycle_index)}`);
    return n;
  });
}

export function createPgStore(
  client: pg.Client | pg.PoolClient,
  hash: { sha256(m: string): string; hmacSha256(k: string, m: string): string },
): CycleStore {
  // ★import しただけで効くが、**効いていることを確かめる**。
  //   副作用の import は書き忘れると静かに無効になります
  //   （`cancelRace` が呼ばれていなかったのと同じ穴をここで作らない）
  assertPgTypesConfigured();
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
                 to_timestamp($5 / 1000.0), $6, $7, $11, 'scheduled')
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
          spec.purse,
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
      return toCycleIndexes(r.rows);
    },

    /**
     * ★確定できないまま期限を過ぎたレース（正典 D-037 の S型）。
     *
     *   `pendingSettlements` は「確定すべきもの」、こちらは**「もう確定を待たないもの」**です。
     *   境界は `scheduled_at + CANCEL_AFTER_START_MS`（60分＝6サイクル）。
     *   ★配備・再起動・ヘルスチェック待ち600秒を吸収してなお十分で、
     *     かつ客を1時間以上 pending で拘束しません。
     */
    async overdueRaces(nowMs: number): Promise<number[]> {
      const r = await client.query<{ cycle_index: number }>(
        `select cycle_index from races
          where status = 'scheduled'
            -- ★引き算を SQL でやらない。$1 - $2 を素で書くと Postgres が
            --   "operator is not unique: unknown - unknown" で落ちる（実際に落ちた）。
            --   偽ストアの単体テストでは絶対に出ず、実 DB を叩いて初めて出た。
            --   境界は overdueBefore()（純関数・単体テストで防御）に置く
            and scheduled_at <= to_timestamp($1::bigint / 1000.0)
          order by cycle_index`,
        [overdueBefore(nowMs)],
      );
      return toCycleIndexes(r.rows);
    },

    /** ★開催中止＋EP 全額返還（D-037・§9.1）。1トランザクション・冪等 */
    async cancelRace(cycleIndex: number): Promise<{ refundedBets: number; refundedEp: number }> {
      const r = await cancelRaceImpl(client, cycleIndex);
      return { refundedBets: r.refundedBets, refundedEp: r.refundedEp };
    },

    /**
     * レースを確定する（§8.6・§8.7・§9）。
     *
     * ★**同一トランザクション**で 着順・seed_reveal・払戻 をすべて行います。
     *   途中で落ちると「着順は出たが払戻されていない」「reveal だけ公開された」
     *   といった状態が残り、どちらも手で直せません（結果の事後差し替えは §8.6 で禁止）。
     *
     * ★二重確定・二重払戻の防止は **status を条件に含める**ことで行います。
     *   既に settled なら最初の update が0行になり、そこで抜けます。
     *   A-5 の place_bet と同じ構造です。
     */
    async settleRace(cycleIndex: number): Promise<void> {
      await client.query('begin');
      try {
        // ★ここで排他を取る。同時に2プロセスが確定に入っても、片方は0行で抜ける
        const race = await client.query<{
          id: string; server_seed: string; distance: number;
          surface: string; track_condition: string; course_id: string;
          class_rank: number; grade: string | null;
        }>(
          `update races set status = 'settled', seed_reveal = server_seed
            where cycle_index = $1 and status = 'scheduled'
            returning id, server_seed, distance, surface, track_condition, course_id,
                      class_rank, grade`,
          [cycleIndex],
        );
        if (race.rowCount === 0) {
          // 既に確定済み。**何もしない**（二重払戻にならない）
          await client.query('rollback');
          return;
        }
        const r = race.rows[0]!;

        // --- 出走表を読んで着順を計算 ---
        // ★horses と結合して**実際の能力**を読む。
        //   中立値で走らせると全馬が同じ実力になり、V-4（1番人気の勝率）などの
        //   較正がすべて意味を失います。
        const es = await client.query<Record<string, unknown>>(
          `select e.gate, e.weight, e.strategy, h.*
             from race_entries e join horses h on h.id = e.horse_id
            where e.race_id = $1 order by e.gate`,
          [r.id],
        );
        if (es.rowCount === 0) {
          // ★出走表が無いレースは確定できない。黙って settled にしない
          throw new Error(`settleRace: cycle=${cycleIndex} に出走表がありません`);
        }

        // ★着順は §8.6 の final_seed から決める（settle.ts）。
        //   ここで独自の乱数を使うと、seed_reveal を公開しても検証できません。
        const entrants: RaceEntrant[] = es.rows.map((row) => {
          const h = rowToHorse(row);
          return {
            // ★着順の同定は馬番で行う（DB の UUID ではなく枠番）
            horseId: String(row['gate']),
            stats: h.stats,
            surfaceAptitude: h.surfaceAptitude,
            distanceCenter: h.distanceCenter,
            distanceRange: h.distanceRange,
            strategyAptitude: h.strategyAptitude,
            heavyAptitude: h.heavyAptitude,
            strategy: String(row['strategy']) as RaceEntrant['strategy'],
            /**
             * ★B-6（D-050）: 調子・疲労を DB から読む（0010 で列を追加）。
             *
             * 【★ここが2か所目だったこと】
             *   出走馬は**生成時（race-field.ts）と確定時（ここ）で別々に組まれます**。
             *   `docs/B6_WIRING_PLAN.md` に「MC と本番確定は同じ entrants を使うので
             *   乖離は構造上起きません」と書きましたが、**誤りでした**。
             *   片方だけ実データにすると、**オッズを計算した馬と実際に走る馬が変わります**。
             *
             * ★週送りを通していない馬（`last_processed_week` が null）は
             *   §7.4 の中央値に落とします。**0 にすると生まれた瞬間が絶不調**になります。
             */
            condition: row['condition'] === null || row['condition'] === undefined
              ? 3 : Number(row['condition']),
            fatigue: row['fatigue'] === null || row['fatigue'] === undefined
              ? 0 : Number(row['fatigue']),
            weightKg: Number(row['weight']),
            gate: Number(row['gate']),
            age: 4,
            skillGenes: h.skillGenes,
          };
        });
        const res = settleRaceFair(
          {
            conditions: {
              raceId: r.id,
              distance: r.distance,
              surface: r.surface as RaceEntrant['surfaceAptitude'] extends never ? never : 'turf' | 'dirt',
              trackCondition: r.track_condition as 'good' | 'yielding' | 'soft' | 'bad',
              courseShape: 'oval',
              baseWeightKg: 55,
            },
            entrants,
            serverSeed: r.server_seed,
          },
          hash,
        );
        const finished = res.order.map((o) => ({
          gate: Number(o.horseId),
          finishPosition: o.finishPosition,
          timeSec: o.timeSec,
        }));
        for (const f of finished) {
          await client.query(
            `update race_entries set finish_pos = $1, finish_time = $2
              where race_id = $3 and gate = $4`,
            [f.finishPosition, f.timeSec, r.id, f.gate],
          );
        }

        // --- 賞金（§11.1）。★PP の主な発行源（§9.3）---
        await awardPrizes(client, r.id, r.class_rank, r.grade, finished);

        // --- 馬券の精算（§9）。EP で買い PP で払い戻す ---
        await settlePayouts(client, r.id, finished);

        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
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
