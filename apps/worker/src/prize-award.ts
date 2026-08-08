/**
 * 賞金の支払い（正典 §11.1・§9.3）
 *
 * 【★PP の主な発行源】
 *   §9.3 は「PP の主な稼ぎ口は**育成した馬の賞金**であり、この関係を絶対に維持する
 *   （逆転すると育成が飾りになる）」と定めています。
 *
 * 【★NPC 馬には払わない】
 *   `horses.owner_id` が null なら NPC です。払う相手がいません。
 *   ⚠️ ここで「払ったことにする」と `point_flow_daily` の PP 発行量が過大に出ます。
 *      監視が誤った経済を測ることになるので、**実際に発行した分だけ**を記録します。
 */

import type pg from 'pg';
import { PRIZE_TABLE, prizeFor, type PrizeTier } from '@star/scheduler';
import type { FinishedEntry } from './payout.js';

/** class_rank（1..6）→ 賞金の格。★programme.ts の order と対応 */
const RANK_TO_TIER: readonly PrizeTier[] = ['maiden', 'win1', 'win2', 'win3', 'open', 'G3'];

export function tierFromDb(classRank: number, grade: string | null): PrizeTier {
  if (grade === 'G1' || grade === 'G2' || grade === 'G3') return grade;
  const t = RANK_TO_TIER[classRank - 1];
  if (t === undefined) throw new Error(`tierFromDb: 未知の class_rank ${classRank}`);
  return t;
}

export async function awardPrizes(
  client: pg.Client | pg.PoolClient,
  raceId: string,
  classRank: number,
  grade: string | null,
  finished: readonly FinishedEntry[],
): Promise<{ paid: number; horses: number }> {
  const tier = tierFromDb(classRank, grade);
  let paid = 0;
  let horses = 0;

  for (const f of finished) {
    const amount = prizeFor(tier, f.finishPosition);
    if (amount <= 0) continue;

    // 枠番から馬と所有者を引く
    const r = await client.query<{ horse_id: string; owner_id: string | null }>(
      `select e.horse_id, h.owner_id from race_entries e
         join horses h on h.id = e.horse_id
        where e.race_id = $1 and e.gate = $2`,
      [raceId, f.gate],
    );
    const row = r.rows[0];
    if (row === undefined) throw new Error(`awardPrizes: gate ${f.gate} の出走馬が見つかりません`);

    // ★NPC 馬（owner_id が null）には払わない。払う相手がいない
    if (row.owner_id === null) continue;

    await client.query(`update users set prize_points = prize_points + $1 where id = $2`,
      [amount, row.owner_id]);
    await client.query(
      `insert into pp_ledger (user_id, delta, balance_after, reason, ref_id)
       select $1, $2, prize_points, 'prize', $3 from users where id = $1`,
      [row.owner_id, amount, raceId],
    );
    paid += amount;
    horses += 1;
  }
  return { paid, horses };
}

/** 賞金テーブルの再エクスポート（監視側が参照する） */
export { PRIZE_TABLE };
