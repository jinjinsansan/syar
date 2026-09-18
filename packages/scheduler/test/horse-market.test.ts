/**
 * ★**馬の購入**（★D-102・★2026-09-19・**T-11**）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**価格が素質から決まる**（★価格から中身が読め、★振り直しが成立する・D-102 ③）
 *   ② 🔴 ★**手放して戻る EP が大きい**（★買って売ってを繰り返せる）
 *   ③ 🔴 ★**戻る額をいまの式から出す**（★**T11-4**。★勝たせて売ると **EP が増える経路**になる）
 *   ④ 🔴 ★**PP で買える経路ができる**（★S-5・L-4 の近縁・D-102 ①）
 *   ⑤ 🔴 ★**在庫が下限を割っても黙って候補を出す**（★D-079 ⑦）
 *
 * 【★T-11 で変わったこと】
 *   ★価格は ★**§10.5 の式**（`npcStudFee`）＝ ★**G1 勝利数と総獲得賞金**だけから決まります。
 *   → ★`priceOfStars` / `STAR_PRICE_EP` / `listingsFromPool` / `LISTED_BANDS` は ★**消えました**。
 */
import { describe, it, expect } from 'vitest';
import {
  npcStudFee, sellBackEP, marketStockAlert, canBuyWithEP,
  MIN_PRICE_EP, SELL_BACK_RATE, MARKET_STOCK_MIN,
} from '../src/index.js';

describe('★馬の購入（D-102・T-11）', () => {
  it('🔴 ① ★価格は戦績だけから決まる（★素質を渡す口が無い）', () => {
    /**
     * ⚠️ ★**引数は 2 つ**（★G1 勝利数・総獲得賞金）。★どちらも ★**走った結果**で、
     *    ★誰にでも見えています（★D-114「強さの手がかりはオッズと戦績だけ」）。
     * 🔴 ★ここに素質を足すと、★**価格からの逆算**が成立します（★D-102 ③ が塞いだ口）。
     */
    expect(npcStudFee.length).toBe(2);
    /** ★同じ戦績なら、★中身が違っても同じ価格 */
    expect(npcStudFee(1, 50_000)).toBe(npcStudFee(1, 50_000));
  });

  it('★最低価格を下回らない（★式の基礎額がそのまま下限）', () => {
    expect(npcStudFee(0, 0)).toBe(MIN_PRICE_EP);
    /** ★戦績が良いほど高い（★単調） */
    let prev = 0;
    for (const [w, e] of [[0, 0], [0, 20_000], [0, 100_000], [1, 0], [1, 100_000], [3, 300_000]] as const) {
      const p = npcStudFee(w, e);
      expect(p, `G1 ${w} / ${e} PP`).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('🔴 ② ★手放して戻る EP は買った額より十分小さい（★振り直しが成立しない）', () => {
    const price = npcStudFee(0, 100_000);
    const back = sellBackEP(price);
    expect(back).toBe(Math.floor(price * SELL_BACK_RATE));
    expect(back, '★買い直しで増えない').toBeLessThan(price);
    /** ★買う → 手放す → 買う を 1 往復すると、必ず EP が減る */
    expect(price - back).toBeGreaterThan(price * 0.5);
  });

  it('🔴 ③ ★戻る額は「買った額」から出す（★**T11-4**）', () => {
    /**
     * 🔴 ★**いまの式の値に掛けてはいけません。**
     *    ★安く買って勝たせて売ると、★戻る額が買った額を超ええます
     *    → ★★**EP が増える経路**になり、★「EP は購入できない」という二種ポイント制（憲法 2）の
     *      ★前提が崩れ、★§3.4 の収支が別のものになります。
     * ⚠️ ★`sellBackEP` の引数は ★**払った額**です。★実装は `horse_market_listing.sell_back_ep` に
     *    ★出品の時点で書かれ、★`sell_horse` はその行の値で戻します（`0026`）。
     */
    const bought = npcStudFee(0, 0);          // ★3,000 EP で買った
    const nowWorth = npcStudFee(2, 500_000);  // ★その後 G1 を 2 勝した
    expect(nowWorth, '★前提: 勝つと価値は上がる').toBeGreaterThan(bought);
    expect(sellBackEP(bought), '★戻るのは買った額の 2 割').toBe(Math.floor(bought * SELL_BACK_RATE));
    expect(sellBackEP(bought), '🔴 ★いまの式から戻すと EP が増える').toBeLessThan(bought);
  });

  it('🔴 ④ ★買えるかは EP だけで決まる（★PP を渡す口が無い）', () => {
    const price = npcStudFee(0, 0);
    expect(canBuyWithEP(price, price)).toBe(true);
    expect(canBuyWithEP(price - 1, price)).toBe(false);
    /** ★引数は 2 つ（★PP を足せばここが変わる） */
    expect(canBuyWithEP.length).toBe(2);
  });

  it('🔴 ⑤ ★在庫の下限で警報が出る（★境界の両側・R-2）', () => {
    expect(marketStockAlert(MARKET_STOCK_MIN).ok).toBe(true);
    expect(marketStockAlert(MARKET_STOCK_MIN - 1).ok, '★下限割れ').toBe(false);
    const alert = marketStockAlert(10);
    expect(alert).toEqual({ ok: false, available: 10, min: MARKET_STOCK_MIN });
  });
});
