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

  /**
   * ★★**① 発生を、確定した全頭ぶん 1 文で書く**（★2026-09-19・**PR-1** ＋ **PR-2**・移行 `0049`）。
   *
   * ⚠️ ★**NPC 馬にも書きます**（★T-11 の価格式が必要とするのはそちら）。
   * ⚠️ 🔴 ★**賞金 0 の着順にも `0` を書きます**（★**PR-2**）。
   *    ★旧は `if (amount <= 0) continue;` で ★**書かずに飛ばして**いました。
   *    → ★`null` に意味が 2 つできます: ★①まだ書いていない（`0049` より前）★②書いたが 0 だった。
   *      ★**埋め戻しの道具が 2 つを区別できず**、★二度流したときに同じ結果になると言えません。
   *    → ★いまは ★**`null` ＝ まだ書いていない**、★**`0` ＝ 賞金が出なかった**の 1 対 1 です。
   *    ⚠️ ★`0049` の制約は `0` を許します（`prize_pp is null or prize_pp >= 0`）。
   *
   * ⚠️ ★**ループの外で 1 文**にしているのは、★**1 周 10 分の予算**のためです（D-071）。
   *    ★18 頭立てで 18 回 `update` を投げると、★確定の経路が重くなります。
   *    ★`unnest` で枠番と額の組を渡し、★**1 回の往復**で済ませます。
   * ⚠️ ★`pp_ledger` には ★**1 行も足しません**（`0001:10`「実際に発行した分だけを記録します」）。
   */
  if (finished.length > 0) {
    const gates = finished.map((f) => f.gate);
    const amounts = finished.map((f) => prizeFor(tier, f.finishPosition));
    const wrote = await client.query(
      `update race_entries e set prize_pp = v.amount
         from (select * from unnest($2::int[], $3::bigint[]) as t(gate, amount)) v
        where e.race_id = $1 and e.gate = v.gate`,
      [raceId, gates, amounts],
    );
    // ★書けた行数が合わないのは、出走表と確定の食い違い。★黙って進めない（R-27）
    if (wrote.rowCount !== finished.length) {
      throw new Error(
        `awardPrizes: prize_pp を書けたのは ${wrote.rowCount} 行（確定は ${finished.length} 頭）`,
      );
    }
  }

  /**
   * ★★**② G1 の勝利数を増やす**（★2026-09-19・**PR-4**・★PR-1 の双子）。
   *
   * 【🔴 ★何が無かったか】
   *   ✔ `horses.g1_wins` は ★**`0001:138` で宣言され、`seed-world.mjs` が初期値を入れ、
   *      `my_horses` が出し、`horse-repo` が読む**のに、
   *   🔴 ★★**どこも増やしていませんでした**（★全ソースを走査して `update … g1_wins` は 0 件）。
   *
   * 【🔴 ★なぜ T-11 を塞ぐか】
   *   ★§10.5 の式は〔`3,000 + G1勝利数 × 8,000 + 総獲得賞金/20`〕。
   *   ★**G1 1 勝 ＝ 8,000 EP** で、★総獲得賞金の項（★1 勝で約 100〜900 EP）より ★**桁が大きい**。
   *   → ★増えないと ★**全馬が 3,000 EP 付近に固まり**、★棚に段差ができません。
   *   ✔ ★実測（staging・2026-09-19）: ★候補 732 頭が ★**全員 G1 0 勝**、★価格の幅は 3,000〜4,620 EP。
   *
   * ⚠️ ★**NPC 馬も増やします**（★PR-1 と同じ理由 — ★D-102 ③ の価格式が要るのは NPC の側）。
   * ⚠️ ★**G1 のときだけ**問い合わせます（★1 周 10 分の予算・D-071）。
   * ⚠️ ★**同着は両方 1 着**です（★`finish_pos = 1` が複数ありえます）。★どちらも 1 勝と数えます。
   */
  if (tier === 'G1') {
    const winners = finished.filter((f) => f.finishPosition === 1).map((f) => f.gate);
    if (winners.length === 0) {
      // ★1 着がいない G1 は異常。★黙って進めない（R-27）
      throw new Error(`awardPrizes: G1 なのに 1 着がいません（race ${raceId}）`);
    }
    const won = await client.query(
      `update horses h set g1_wins = h.g1_wins + 1
         from race_entries e
        where e.race_id = $1 and e.gate = any($2::int[]) and h.id = e.horse_id`,
      [raceId, winners],
    );
    if (won.rowCount !== winners.length) {
      throw new Error(`awardPrizes: g1_wins を増やせたのは ${won.rowCount} 頭（1 着は ${winners.length} 頭）`);
    }
  }

  // ★★③ 発行（★利用者の馬だけ。★ここは今までどおり）
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
