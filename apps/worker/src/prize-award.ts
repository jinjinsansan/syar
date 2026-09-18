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
 *
 * 【★★2026-09-19・PR-1 — ★**賞金の「発生」と「発行」を分けました**（移行 `0049`）】
 *   🔴 ★旧は ★**発行（`pp_ledger`）しか記録していませんでした**。
 *     ★`pp_ledger.user_id` は `not null` で、★NPC 馬は上の `continue` で飛ばされるため、
 *     ★★**NPC 馬の獲得賞金がどこにも存在しませんでした。**
 *   🔴 ★これが **T-11** を塞いでいました:
 *     ★**D-102 ③** は出品価格を ★§10.5 の式〔`3,000 + G1勝利数 × 8,000 + 総獲得賞金 / 20`〕で決め、
 *     ★**D-102 ②** は売る馬を ★**NPC 世界から取る**と定めています。
 *     → ★式が必要とする「総獲得賞金」は ★**まさに存在しない側**でした（★D-107 も同じ式）。
 *   ★新:
 *     ★**発生** … `race_entries.prize_pp`。★**誰の馬かに関わらず**、着順から決まる額を書く（★一次資料）
 *     ★**発行** … `pp_ledger` ＋ `users.prize_points`。★**利用者の馬のときだけ**（★今までどおり）
 *   ⚠️ ★**二重帳簿ではありません** — ★意味が違い、★NPC 馬では ★**一致しません**（★発生あり・発行なし）。
 *   ⚠️ ★額は `prizeFor()` が決めます。★**賞金表を SQL に写しません**（D-052・EF-2 と同じ形）。
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

    /**
     * ★★**発生を先に書く**（★2026-09-19・**PR-1**・移行 `0049`）。
     * ⚠️ ★**NPC 馬にも書きます** — ★下の `continue` より**前**に置いているのはそのためです。
     *    ★ここを `continue` の後ろに移すと、★**T-11 の価格式がまた源を失います**。
     */
    await client.query(
      `update race_entries set prize_pp = $1 where race_id = $2 and gate = $3`,
      [amount, raceId, f.gate],
    );

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
