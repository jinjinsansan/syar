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
/**
 * ★凍結（0016）を持たない出走馬がいるレース（D-056）。
 *
 *   確定せず、**正典 D-037 の開催中止**に載せます。返還・冪等・アラートは実装済みです。
 *   ⚠️ これを握り潰して `horses` から組み直す経路を足さないこと。
 *      それは D-055 で閉じた欠陥そのもので、**「凍結が無いとき」だけ穴が既定で開きます。**
 */
export class UnfrozenRaceError extends Error {
  constructor(
    readonly cycleIndex: number,
    readonly unfrozen: number,
    readonly total: number,
  ) {
    super(
      `cycle=${cycleIndex} の出走馬 ${unfrozen}/${total} 頭に凍結がありません。`
        + '確定せず開催中止にします（D-056）',
    );
    this.name = 'UnfrozenRaceError';
  }
}

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
         values ($1, $2, $3, $4, $8, $9, $12, $10,
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
          /**
           * ★馬場状態を保存する（Q-P3-32 の是正）。
           *   ここは **'good' を直書き**していました。`generateRace` は §10.4 の分布から
           *   稍重・重・不良も引いてオッズを計算しているのに、DB には常に良と書かれ、
           *   確定処理は DB の値で走らせていました。
           *   ★本番の 443件すべてが good で、**道悪が一度も発生せず
           *     `heavy_aptitude` が一度も効いていません**（P-1 で genotype に足した形質）。
           */
          spec.conditions.trackCondition,
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

        /**
         * --- 出走表（§10.4 の同格帯から。D-018: 無作為だと V-4 が壊れる）---
         *
         * ★1行ずつではなく**一括**で入れます（2026-08-11・A-1 の余裕のため）。
         *   下のオッズと同じ理由です。
         */
        await client.query(
          `insert into race_entries (race_id, horse_id, gate, weight, strategy, popularity, entrant_snapshot)
           select $1, t.horse_id, t.gate, t.weight, t.strategy, t.popularity, t.snapshot
             from unnest($2::uuid[], $3::int[], $4::numeric[], $5::text[], $6::int[], $7::jsonb[])
               as t(horse_id, gate, weight, strategy, popularity, snapshot)`,
          [
            raceId,
            spec.entrants.map((e) => e.horseId),
            spec.entrants.map((e) => e.gate),
            spec.entrants.map((e) => e.weightKg),
            spec.entrants.map((e) => e.strategy),
            spec.entrants.map((e) => e.popularity ?? null),
            // ★オッズ計算に使った出走馬を凍結（0016）。確定はこれを使う
            spec.entrants.map((e) => (e.snapshot === undefined ? null : JSON.stringify(e.snapshot))),
          ],
        );

        /**
         * --- オッズ（§9.2）---
         *
         * ★**1行ずつ入れていました。** 18頭立てだと 5,483 行あり、
         *   1行 = 1往復なので、**生成時間の大半がネットワーク待ち**になっていました。
         *   実測（staging・シドニー）: 27分のうち CPU は 6.4分（24%）だけ。
         *   残りはこの往復です。
         *
         *   ★これは A-1（10分サイクルが無人で回り続ける）を脅かします。
         *     生成はサイクルのロックを保持したまま行われるので、
         *     長引くとその間の確定が止まります。
         *
         *   → `unnest` で**1往復**にします。行の中身も順序も変えません。
         *     ⚠️ `numeric(9,8)` / `numeric(9,1)` に入るので、配列も `numeric[]` で渡します
         *        （`float8[]` にすると丸めが変わりえます）。
         */
        await client.query(
          `insert into race_odds (race_id, bet_type, selection, probability, odds, capped)
           select $1, t.bet_type, t.selection::jsonb, t.probability, t.odds, t.capped
             from unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::boolean[])
               as t(bet_type, selection, probability, odds, capped)`,
          [
            raceId,
            spec.odds.map((o) => o.betType),
            spec.odds.map((o) => JSON.stringify(o.selection)),
            spec.odds.map((o) => o.probability),
            spec.odds.map((o) => o.odds),
            spec.odds.map((o) => o.capped),
          ],
        );
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

        /**
         * --- 出走表を読んで着順を計算 ---
         *
         * ★**`horses` と結合しません**（D-056）。読むのは**凍結だけ**です。
         *   結合を残すと「一部だけ最新値で上書き」が書けてしまい、
         *   2回読む構造に戻れます。**読む対象を1つにして、戻れなくします。**
         */
        const es = await client.query<Record<string, unknown>>(
          `select e.gate, e.weight, e.strategy, e.entrant_snapshot
             from race_entries e
            where e.race_id = $1 order by e.gate`,
          [r.id],
        );
        if (es.rowCount === 0) {
          // ★出走表が無いレースは確定できない。黙って settled にしない
          throw new Error(`settleRace: cycle=${cycleIndex} に出走表がありません`);
        }

        /**
         * ★**凍結が無いレースは確定せず、開催中止にします**（D-056・正典 D-037 の経路）。
         *
         * 【なぜ「昔の経路に落ちる」ではいけないか】
         *   旧経路（`horses` を読み直す）こそが D-055 で閉じた欠陥そのものです。
         *   フォールバックを残すと、**「凍結が無いとき」だけ閉じたはずの穴が既定で開きます。**
         *   ★警告を出しても、開いていることに変わりはありません。
         *
         * 【移行の猶予は終わっています】
         *   レースは生成2周先 → 10分程度で確定するので、
         *   0016 適用から1時間もあれば全レースが凍結を持ちます。
         *
         * ★中止なら返還・冪等・アラートが実装済みで、**新しい仕組みは要りません**。
         *   将来この書き込みが壊れても、静かに劣化せず**目に見える形で止まります**。
         */
        const unfrozen = es.rows.filter(
          (row) => row['entrant_snapshot'] === null || row['entrant_snapshot'] === undefined,
        ).length;
        if (unfrozen > 0) {
          // ★中止は**別トランザクション**（cancelRace が自分で begin する）。
          //   ここでは確定を巻き戻してから抜け、呼び出し側の中止経路に載せます。
          await client.query('rollback');
          throw new UnfrozenRaceError(cycleIndex, unfrozen, es.rowCount ?? 0);
        }

        // ★着順は §8.6 の final_seed から決める（settle.ts）。
        //   ここで独自の乱数を使うと、seed_reveal を公開しても検証できません。
        const entrants: RaceEntrant[] = es.rows.map((row) => ({
          // ★凍結された出走馬を**そのまま**使う（D-056）。
          //   ⚠️ ここに DB の最新値を混ぜないこと。混ぜた瞬間に2回読む構造に戻ります。
          ...(row['entrant_snapshot'] as unknown as RaceEntrant),
          // ★着順の同定は馬番で行う（凍結側は元の馬の UUID を持っている）
          horseId: String(row['gate']),
        }));
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
