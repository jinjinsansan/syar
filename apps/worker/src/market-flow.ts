/**
 * ★**出品を作る**（★正典 §6・**D-102**・移行 `0025`／★2026-09-19・**T-11**）
 *
 * 【★2026-09-19・T-11 で変わったこと】
 *   ★旧: ★**素質の帯**（`bandOfPotential`）で候補を選び、★**帯から値付け**していました。
 *   ★新（**D-102 ③**・2026-09-18 改訂）:
 *     ★**候補** … ★**走った実績のある馬**（★`is_initial_horse_candidate` の補集合＝`finish_pos is not null` が 1 つ以上）
 *     ★**価格** … ★**§10.5 の式** `npcStudFee(G1勝利数, 総獲得賞金)`
 *     ★**品揃え** … ★**価格の帯** 5 段 × 3 口（★**素質の帯では並べません**・T11-1 ①）
 *
 * 【★なぜワーカーが書くか】（★`0025` の註記と同じ理由）
 *   ★式は ★**`@star/scheduler` の `npcStudFee`** が持ちます。★同じ式を SQL にも書くと
 *   ★**画面と DB で値が食い違う日**が来ます（★D-052・二重帳簿）。
 *   → ★**サーバー（ここ）が出品の行に価格を書き**、★RPC（`buy_horse`）は**その行の値で**払わせます。
 *   ⚠️ ★利用者は価格を申告できません（★憲法 3・`0025` が `revoke insert` 済み）。
 *
 * 【★この層がしないこと】
 *   ⚠️ ★**馬を作りません**（★D-102 ②「売る馬は NPC 世界から取る」）。
 *   ⚠️ ★**乱数も時刻も使いません**（★憲法 4）。★並べ替えの起点は `world_state.game_week` から取ります。
 *   ⚠️ ★**在庫が下限を割っても、黙って帯を広げません**（★D-102 ⑤・D-079 ⑦）。★警報を出すだけです。
 *   ⚠️ ★**引退馬を入れません**（★**T11-3**）— ★§10.5 は引退した NPC 名馬を**種牡馬市場**へ流すと定めており、
 *      ★2 つの経路で同じ馬を売ると ★**在庫が二重に数えられ**、★D-102 ⑤ の下限監視が壊れます。
 *
 * 【★冪等】★同じ状態・同じ `game_week` で何度呼んでも同じ行になります。
 */

import type pg from 'pg';
import {
  marketStockAlert, planListings, listingDrift, npcStudFee, sellBackEP,
  PRICE_TIERS_EP, LISTINGS_PER_TIER, priceTierOf,
} from '@star/scheduler';

/**
 * ★**候補の述語**（★**MK-1**・2026-09-19）。
 *
 * ★D-102 ③「走った実績のある馬」＝ `is_initial_horse_candidate` の補集合。
 * 🔴 ⚠️ ★**出品を選ぶ側と、在庫を数える側で、必ず同じものを使います。**
 *    ★違うと ★**下限監視が、守るべきものと違うものを見ます**（★実際に 10 倍ずれていました）。
 * ⚠️ ★別名 `h` を前提にしています（★呼ぶ側で `from horses h` と書くこと）。
 */
const CANDIDATE_WHERE = `h.owner_id is null and h.npc_stable_id is not null and h.retired_at_week is null
        and exists (select 1 from race_entries e where e.horse_id = h.id and e.finish_pos is not null)`;

/** ★1 回に見る NPC プールの上限（★全件走査を避ける。★帯を埋めるには十分な数） */
export const MARKET_POOL_LIMIT = 5000;

export interface MarketRefreshResult {
  /** ★買える NPC の現役馬の数（★在庫） */
  readonly available: number;
  /** ★そのうち「走った実績のある馬」（★D-102 ③ の候補） */
  readonly candidates: number;
  /** ★下ろした出品の数 */
  readonly deactivated: number;
  /** ★足した出品の数 */
  readonly added: number;
  /** ★在庫が下限を割っているか（★割っていれば警報を出している） */
  readonly stockOk: boolean;
  /**
   * ★**埋まらなかった帯**（★**T11-1 ②**）。
   * 🔴 ★**黙って別の帯から埋めません**（★D-102 ⑤ と同じ作法）。★数として出します。
   */
  readonly shortfall: readonly { readonly tier: number; readonly fromEP: number; readonly missing: number }[];
  /**
   * ★**凍結した額と、いまの式の額のずれ**（★**T11-2 ①**）。
   * ⚠️ ★凍結は「気づかない」を作りやすいので（R-16）、★最大のずれを出します。
   */
  readonly maxDriftEP: number;
}

interface PoolRow {
  id: string;
  g1_wins: number | string;
  earnings: string | number;
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
  /**
   * ── ① 候補（★D-102 ③「走った実績のある馬」）──
   * ⚠️ ★**`is_initial_horse_candidate` の補集合**です（`0031`/`0037` と同じ述語）。
   *    ★付与（初期馬）と購入が ★**ちょうど補集合**になります。
   * ⚠️ ★`prize_pp` が null の行（★`0049` より前・★埋め戻していない）は ★**0 として数えません** —
   *    ★`sum` が null を飛ばすので、★「まだ書いていない」が「0 稼いだ」に化けません。
   *    ★数え方は SQL の関数 `horse_total_prize_pp`（★`0071`）の 1 か所。★種付料（`player-breeding.ts`）も同じ関数を呼ぶ
   *    （★裁定 `REVIEW_BREED_OWN_MARE_VERDICT_20260922.md` §3）。
   */
  const poolRes = await client.query<PoolRow>(
    `select h.id, h.g1_wins,
            horse_total_prize_pp(h.id) as earnings
       from horses h
      where ${CANDIDATE_WHERE}
      order by h.id
      limit $1`,
    [MARKET_POOL_LIMIT],
  );
  const pool = poolRes.rows.map((r) => ({
    horseId: r.id,
    priceEP: npcStudFee(Number(r.g1_wins), Number(r.earnings)),
  }));

  /**
   * ★在庫は**プール全体の数**で見る（★上限で切った数ではない）。
   *
   * 🔴 ★**2026-09-19・MK-1 で直しました。**
   *   ★旧: ★**3 条件だけ**（★`exists(raced)` が抜けていた）。
   *   ✔ ★staging の実測: ★**監視は 7,333 頭、実際に買える候補は 732 頭**（★**10.0 倍**）。
   *   🔴 ★下限は 200 頭なので、★**候補が 200 を割っても、監視は 7,333 と言い続けました**。
   *   → ★★**D-102 ⑤ の下限監視が、守るべきものと違うものを見ていました。**
   * → ★**候補と同じ述語を 1 か所から**引きます（★PO-2 で `RACEABLE_WHERE` にしたのと同じ直し）。
   */
  const countRes = await client.query<{ n: string }>(
    `select count(*)::text as n from horses h where ${CANDIDATE_WHERE}`,
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

  // ── ② いま出ている出品（★凍結された価格）────────────────────
  const activeRes = await client.query<{ horse_id: string; price_ep: string | number }>(
    `select horse_id, price_ep from horse_market_listing where active order by horse_id`,
  );
  const active = activeRes.rows.map((r) => ({ horseId: r.horse_id, priceEP: Number(r.price_ep) }));

  /**
   * ── ③ 並べ替えの起点（★**T11-1 ③**「毎日同じ 3 頭にならない」）──
   * ⚠️ ★**時計を持ちません**（★憲法 4）。★ワーカーが毎周書いた `world_state.game_week` を読むだけです。
   * ⚠️ ★行が無ければ ★**0** で進めます（★止める理由ではない。★並びが固定になるだけ）。
   */
  const weekRes = await client.query<{ game_week: string | number }>(
    'select game_week from world_state where id',
  );
  const rotation = Number(weekRes.rows[0]?.game_week ?? 0);

  // ── ④ 計画（★純関数・DB を知らない）───────────────────────
  const plan = planListings(pool, active, rotation);
  const drift = listingDrift(active, pool);
  const maxDriftEP = drift.reduce((m, d) => Math.max(m, Math.abs(d.diffEP)), 0);

  // ── ⑤ 反映（★1 トランザクション）──────────────────────────
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
         * ★**手放したときに戻る額も、ここで書きます**（★`0026`・D-102 ③・**T11-4**）。
         *   ★割合（`SELL_BACK_RATE`）を SQL に書かないためです（★D-052・二重帳簿にしない）。
         * ⚠️ ★`sell_horse` は ★**この行の値**で戻します。★**いまの式の値では戻しません** —
         *    ★勝たせて売ると ★**EP が増える経路**になり、★憲法 2 の前提が崩れます。
         */
        await client.query(
          `insert into horse_market_listing (horse_id, price_ep, sell_back_ep)
           select * from unnest($1::uuid[], $2::int[], $3::int[])
           on conflict do nothing`,
          [
            plan.add.map((l) => l.horseId),
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

  /**
   * ── ⑥ 埋まらなかった帯を数える（★**T11-1 ②**）──
   * 🔴 ★**黙って別の帯から埋めません。** ★数として出し、★警報を出します。
   *    ★在庫の下限監視（D-102 ⑤）と同じ作法です。
   */
  const afterRes = await client.query<{ price_ep: string | number }>(
    'select price_ep from horse_market_listing where active',
  );
  const byTier = new Map<number, number>();
  for (const r of afterRes.rows) {
    const t = priceTierOf(Number(r.price_ep));
    byTier.set(t, (byTier.get(t) ?? 0) + 1);
  }
  const shortfall: { tier: number; fromEP: number; missing: number }[] = [];
  for (let t = 0; t < PRICE_TIERS_EP.length; t += 1) {
    const missing = LISTINGS_PER_TIER - (byTier.get(t) ?? 0);
    if (missing > 0) shortfall.push({ tier: t, fromEP: PRICE_TIERS_EP[t]!, missing });
  }
  if (shortfall.length > 0) {
    onAlert(
      '★価格の帯が埋まりませんでした（★帯を広げず、そのまま出しています・T11-1 ②）: '
      + shortfall.map((s) => `帯${s.tier}（${s.fromEP.toLocaleString('ja-JP')} EP〜）あと ${s.missing} 口`).join(' / '),
    );
  }

  return {
    available,
    candidates: pool.length,
    deactivated: plan.deactivate.length,
    added: plan.add.length,
    stockOk: stock.ok,
    shortfall,
    maxDriftEP,
  };
}

/** ★出しておく口数の目安（★ログ用。★価格の帯の数 × 帯ごとの口数） */
export const MARKET_TARGET_LISTINGS = PRICE_TIERS_EP.length * LISTINGS_PER_TIER;
