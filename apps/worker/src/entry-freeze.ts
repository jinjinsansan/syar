/**
 * ★**出走登録した馬の凍結を書き、埋まらない馬を取消にする**（★正典 **D-111**・移行 `0028`）
 *
 * 【★なぜこの層が要るか】
 *   ★`enter_race`（`0024`）は ★**受付まで**です（枠・料金・凍結待ちの行）。★凍結は書きません。
 *   ★確定側は ★**1 頭でも凍結が無ければレースごと開催中止・全ベット返還**（D-056）なので、
 *   ★そのままだと ★**利用者が登録しただけで、他の客の馬券まで消えます**。
 *
 * 【★D-111 の形】
 *   ②★**凍結はワーカーが、レース生成と同じ関数で書く**（★出どころを 1 か所に保つ・D-052・R-30）
 *   ③★**発走前に凍結の無い馬が残っていたら、その馬だけを取消**にし、★**レースは止めない**
 *     → §9.1 の「取消・除外馬を含む馬券は全額返還（EP）」に載る
 *   ④**D-056 は最後の安全網として残す**（★この層は何も外しません）
 *   ⑤★**取消の理由を出し、登録料と騎手の料金を返す**（★`ep_ledger` の `refund`）
 *
 * ⚠️ ★**1 頭の不備で他の客の馬券まで消すのは釣り合いが取れていない**（裁定 §1-4 の 3）。
 * ⚠️ ★乱数も時刻も読みません（★時刻は Postgres の `now()`・憲法 4）。
 */

import type pg from 'pg';
import { deriveRng, type Rng } from '@star/sim-engine';
import { rowToHorse } from './horse-repo.js';
/**
 * ★**生成側と同じ変換**（★`build-race.ts:13` と同じ相対の引き方）。
 * ⚠️ ★ここで組み直さないこと（★D-052・R-30。★生成側と確定側で別の形になります）。
 */
import { toEntrant } from '../../cli/src/race-field.js';
// ★取消と返金（★D-111 ③⑤）。★D-117 DS-7 と同じ関数を通します（D-052）
import { scratchEntry } from './scratch.js';

/**
 * ★乱数の用途 ID（★`toEntrant` が開放率を 1 回引くため）。
 * ⚠️ ★**新しい乱数源を作りません**（★憲法 4・D-112 ①と同じ縛り）。
 *    ★レースの `cycle_index` と枠から決まるので、★**何度回しても同じ凍結**になります。
 * ⚠️ ★ここで引いた開放率は ★**実データの能力で上書きされます**（`overrides.stats`）。
 *    ★引いてから捨てるのは `toEntrant` の約束（Q-P3-29）で、★並びをずらさないためです。
 */
export const FREEZE_STREAM = 71;

/**
 * ★登録料（`0024` の `enter_race` と同じ値）。★騎手の料金は凍結から読む
 *
 * 🔴 ★**この定数はもう使いません**（★2026-09-19・D-117 DS-7 の切り出しで見つけた穴）。
 *   ★取る側は `races.entry_fee_ep`（★行の値・EF-2）、★返す側はこの 200 —
 *   ★**2 通りの写し**でした（D-052）。★今は両方 200 なので壊れていませんが、
 *   ★`packages/scheduler/src/entry-fee.ts` を変えると ★**取る額だけが動きます**。
 *   → ★返金は `scratch.ts` が ★**行から読みます**。
 *
 * ⚠️ ★**再輸出として残します**（★検査が読んでいるため）。★正は `@star/scheduler`。
 */
export { ENTRY_FEE_EP } from '@star/scheduler';

export interface FreezeResult {
  /** ★凍結を書いた頭数 */
  readonly frozen: number;
  /** ★取消にした頭数 */
  readonly scratched: number;
  /** ★返した EP の合計 */
  readonly refundedEp: number;
}

interface PendingRow {
  entry_id: string;
  race_id: string;
  cycle_index: string;
  horse_id: string;
  gate: number;
  weight: string | number;
  strategy: string;
  jockey_frozen: { feeEP?: number } | null;
  /** ★馬の行（`rowToHorse` に渡す） */
  horse: Record<string, unknown> | null;
  /**
   * ★**引退した週**（★null なら現役）。
   * ⚠️ ★`enter_race` は登録の時点で引退を弾きますが、★**登録の後・発走の前に引退する**ことは
   *    ★実際に起こります（★週送りで 260 週に達する／致命的な故障・§7.1・§7.5）。
   *    ★そのまま凍結すると ★**引退した馬が走ります**。→ ★その馬だけ取消にします（D-111 ③）。
   */
  retired_at_week: string | number | null;
  /** ★レースの条件（凍結を組むのに要る） */
  distance: number;
  surface: string;
  track_condition: string;
}

/**
 * ★発走が近いレースの「凍結待ち」の行を埋める。
 *
 * ★`beforeStartMs` … ★発走の何ミリ秒前までを対象にするか（★既定 15 分）。
 *   ★`enter_race` の締切は発走 60 分前（§10.4）なので、★締切後・発走前に必ず 1 回は通ります。
 */
export async function freezePendingEntries(
  client: pg.Client | pg.PoolClient,
  onAlert: (msg: string) => void,
  beforeStartMs = 15 * 60_000,
): Promise<FreezeResult> {
  const rows = await client.query<PendingRow>(
    `select e.id as entry_id, e.race_id, r.cycle_index, e.horse_id, e.gate, e.weight, e.strategy,
            e.jockey_frozen,
            to_jsonb(h.*) as horse,
            h.retired_at_week,
            r.distance, r.surface, r.track_condition
       from race_entries e
       join races r on r.id = e.race_id
       left join horses h on h.id = e.horse_id
      where e.entrant_snapshot is null
        and e.scratched_at is null
        and r.status = 'scheduled'
        and r.scheduled_at <= now() + ($1::bigint || ' milliseconds')::interval
      order by r.cycle_index, e.gate`,
    [beforeStartMs],
  );
  if (rows.rowCount === 0) return { frozen: 0, scratched: 0, refundedEp: 0 };

  let frozen = 0;
  let scratched = 0;
  let refundedEp = 0;

  for (const row of rows.rows) {
    /**
     * ★凍結を組む。★**生成と同じ関数**（`entrantFromHorse`）を通します
     *   — ★ここで組み直すと、★生成側と確定側で別の形になります（D-052・R-30）。
     */
    let snapshot: Record<string, unknown> | null = null;
    let why = '';
    try {
      if (row.horse === null) throw new Error('馬の行がありません');
      /**
       * ★**登録の後・発走の前に引退した馬は走らせません**（★D-111 ③）。
       * ⚠️ ★`enter_race` は登録時に弾きますが、★その後に引退することは実際に起こります
       *    （★週送りで 260 週に達する／致命的な故障）。★ここで止めないと引退馬が走ります。
       */
      if (row.retired_at_week !== null && row.retired_at_week !== undefined) {
        throw new Error('登録の後に引退しました');
      }
      const horse = rowToHorse(row.horse);
      /** ★シードは既存の系列から（★レースと枠で決まる・時計も Math.random も読まない） */
      const rng: Rng = deriveRng(Number(row.cycle_index), FREEZE_STREAM, row.gate);
      snapshot = toEntrant(horse, rng, {
        gate: row.gate,
        weightKg: Number(row.weight),
        strategy: row.strategy as Parameters<typeof toEntrant>[2] extends { strategy?: infer S } ? S : never,
        /** ★能力は DB の現在値（★生成側と同じく実データを使う・Q-P3-29） */
        stats: horse.stats,
      }) as unknown as Record<string, unknown>;
    } catch (e) {
      why = (e as Error).message;
    }

    await client.query('begin');
    try {
      if (snapshot !== null) {
        await client.query(
          `update race_entries set entrant_snapshot = $1::jsonb where id = $2`,
          [JSON.stringify(snapshot), row.entry_id],
        );
        frozen += 1;
      } else {
        /**
         * ★**その馬だけを取消**（★レースは止めない・D-111 ③）。
         * ★理由を残します（★黙って消さない・D-111 ⑤）。
         */
        const reason = `出走に必要な記録を作れませんでした（${why}）`;
        /**
         * ★**取消と返金は 1 か所**（★2026-09-19・D-117 DS-7 で `scratch.ts` に切り出し）。
         *   ★D-117 の「組成が間に合わなかったレース」も同じ関数を通ります（D-052）。
         */
        const sc = await scratchEntry(
          client,
          {
            entryId: row.entry_id,
            raceId: row.race_id,
            horseId: row.horse_id,
            jockeyFeeEP: Number(row.jockey_frozen?.feeEP ?? 0),
          },
          reason,
        );
        scratched += 1;
        refundedEp += sc.refundedEp;
        /**
         * ★**返した額をそのまま言います**（★D-111 ⑤）。
         * ⚠️ ★`0` は「★既に返してあった」か「★NPC の馬」です — ★**取りっぱぐれではありません**。
         */
        const fee = sc.refundedEp;
        onAlert(
          `★出走を取消しました cycle=${row.cycle_index} 枠 ${row.gate}（馬 ${row.horse_id}）: ${reason}` +
          `。★レースは止めていません（D-111 ③）。料金 ${fee} EP を返しました`,
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }

  return { frozen, scratched, refundedEp };
}
