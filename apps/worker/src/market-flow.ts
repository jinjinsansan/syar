/**
 * ★**出品を作る**（★ゲーム本体 (a) 第 5 便-2・2026-09-16・正典 §6・**D-102**・移行 `0025`）
 *
 * 【★なぜワーカーが書くか】（★`0025` の註記と同じ理由）
 *   ★★と価格は ★**`@star/sim-engine` の `starsOf` と `@star/scheduler` の `priceOfStars`** が出します。
 *   ★同じ式を SQL にも書くと ★**画面と DB で★が食い違う日**が来ます（★D-052・二重帳簿）。
 *   → ★**サーバー（ここ）が出品の行に★と価格を書き**、★RPC（`buy_horse`）は**その行の値で**払わせます。
 *   ⚠️ ★利用者は価格を申告できません（★憲法 3・`0025` が `revoke insert` 済み）。
 *
 * 【★この層がしないこと】
 *   ⚠️ ★**馬を作りません**（★D-102 ②「売る馬は NPC 世界から取る」）。
 *   ⚠️ ★**乱数も時刻も使いません**（★憲法 4）。★並びは `order by id` で決まります。
 *   ⚠️ ★**在庫が下限を割っても、黙って帯を広げません**（★D-102 ⑤・D-079 ⑦）。★警報を出すだけです。
 *
 * 【★冪等】★同じ状態で何度呼んでも同じ行になります（★足りないぶんだけ足す）。
 */

import type pg from 'pg';
import { starsOfPotential, type AbilityKey } from '@star/sim-engine';
import { marketStockAlert, planListings, sellBackEP, LISTED_BANDS, LISTINGS_PER_BAND } from '@star/scheduler';

/** ★1 回に見る NPC プールの上限（★全件走査を避ける。★帯を埋めるには十分な数） */
export const MARKET_POOL_LIMIT = 5000;

export interface MarketRefreshResult {
  /** ★買える NPC の現役馬の数（★在庫） */
  readonly available: number;
  /** ★下ろした出品の数 */
  readonly deactivated: number;
  /** ★足した出品の数 */
  readonly added: number;
  /** ★在庫が下限を割っているか（★割っていれば警報を出している） */
  readonly stockOk: boolean;
}

interface PoolRow {
  id: string;
  potential: Record<string, number>;
}

const ABILITY_KEYS: readonly AbilityKey[] = ['sp', 'st', 'pw', 'gt', 'iq'];

/** ★jsonb の素質を数にする（★numeric が文字列で返る経路に備える・`loadTrainingStates` と同じ作法） */
function potentialOf(row: PoolRow): Record<AbilityKey, number> {
  const out = {} as Record<AbilityKey, number>;
  for (const k of ABILITY_KEYS) {
    const v = Number(row.potential[k]);
    if (!Number.isFinite(v)) throw new Error(`market-flow: 馬 ${row.id} の素質 ${k} を数値として読めません`);
    out[k] = v;
  }
  return out;
}

/**
 * ★出品を今の在庫に合わせる（★冪等）。
 *
 * ★`onAlert` … ★在庫が下限を割ったときに呼ばれます（★黙らせない・D-079 ⑦）。
 */
export async function refreshMarketListings(
  client: pg.Client | pg.PoolClient,
  onAlert: (msg: string) => void,
): Promise<MarketRefreshResult> {
  // ── ① いま買える NPC の現役馬（★所有が無く・NPC 厩舎にいて・引退していない）──
  const poolRes = await client.query<PoolRow>(
    `select id, potential from horses
      where owner_id is null and npc_stable_id is not null and retired_at_week is null
      order by id
      limit $1`,
    [MARKET_POOL_LIMIT],
  );
  const pool = poolRes.rows.map((r) => ({ horseId: r.id, stars: starsOfPotential(potentialOf(r)) }));

  // ★在庫は**プール全体の数**で見る（★上限で切った数ではない）
  const countRes = await client.query<{ n: string }>(
    `select count(*)::text as n from horses
      where owner_id is null and npc_stable_id is not null and retired_at_week is null`,
  );
  const available = Number(countRes.rows[0]!.n);
  const stock = marketStockAlert(available);
  if (!stock.ok) {
    // ★★黙って帯を広げない・候補を作らない（D-102 ⑤）。★警報だけ出して、出品はそのまま続ける
    onAlert(
      `★馬の購入の在庫が下限を割りました（買える NPC の現役馬 ${stock.available} 頭 / 下限 ${stock.min} 頭）。` +
      `★帯を広げず、NPC の生産の側を見てください（D-102 ⑤）`,
    );
  }

  // ── ② いま出ている出品 ────────────────────────────────
  const activeRes = await client.query<{ horse_id: string; stars: string | number }>(
    `select horse_id, stars from horse_market_listing where active order by horse_id`,
  );
  const active = activeRes.rows.map((r) => ({ horseId: r.horse_id, stars: Number(r.stars) }));

  // ── ③ 計画（★純関数・DB を知らない）───────────────────────
  const plan = planListings(pool, active);

  // ── ④ 反映（★1 トランザクション）──────────────────────────
  if (plan.deactivate.length > 0 || plan.add.length > 0) {
    await client.query('begin');
    try {
      if (plan.deactivate.length > 0) {
        await client.query(
          `update horse_market_listing set active = false
            where active and horse_id = any($1::uuid[])`,
          [plan.deactivate],
        );
      }
      if (plan.add.length > 0) {
        /**
         * ★**手放したときに戻る額も、ここで書きます**（★`0026`・D-102 ③）。
         *   ★割合（`SELL_BACK_RATE`）を SQL に書かないためです（★D-052・二重帳簿にしない）。
         * ⚠️ ★`sell_horse` は ★**この行の値**で戻します。★値が無い行は手放せません。
         */
        await client.query(
          `insert into horse_market_listing (horse_id, stars, price_ep, sell_back_ep)
           select * from unnest($1::uuid[], $2::numeric[], $3::int[], $4::int[])
           on conflict do nothing`,
          [
            plan.add.map((l) => l.horseId),
            plan.add.map((l) => l.stars),
            plan.add.map((l) => l.priceEP),
            plan.add.map((l) => sellBackEP(l.priceEP)),
          ],
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }

  return {
    available,
    deactivated: plan.deactivate.length,
    added: plan.add.length,
    stockOk: stock.ok,
  };
}

/** ★出しておく口数の目安（★ログ用。★帯の数 × 帯ごとの口数） */
export const MARKET_TARGET_LISTINGS = LISTED_BANDS.length * LISTINGS_PER_BAND;
