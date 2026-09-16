/**
 * ★**馬の購入**（★GB-4・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §4-1・D-102）
 *
 * 【★見ている壊れ方】
 *   ① ★候補の★がばらつく（★「引き直せば良い馬が出る」＝振り直しが成立する・D-102 ③）
 *   ② ★価格から中身が読める（★同じ★なのに価格が違う）
 *   ③ ★手放して戻る EP が大きく、★買って売ってを繰り返せる
 *   ④ ★PP で買える経路ができる（★S-5・L-4 の近縁・D-102 ①）
 *   ⑤ ★在庫が下限を割っても黙って候補を出す（★D-079 ⑦）
 */
import { describe, it, expect } from 'vitest';
import {
  listingsFromPool, priceOfStars, sellBackEP, marketStockAlert, canBuyWithEP,
  STAR_PRICE_EP, MIN_PRICE_EP, SELL_BACK_RATE, MARKET_STOCK_MIN,
} from '../src/index.js';

/** ★NPC の現役プールの見本（★★はエンジンの `starsOf` が出した値という想定） */
const pool = [
  { horseId: 'n1', stars: 3 }, { horseId: 'n2', stars: 3.5 }, { horseId: 'n3', stars: 3 },
  { horseId: 'n4', stars: 2.5 }, { horseId: 'n5', stars: 3 }, { horseId: 'n6', stars: 4.5 },
];

describe('★馬の購入（GB-4・D-102）', () => {
  it('① ★候補は★表示が同じ帯（★全個体で同一）', () => {
    const got = listingsFromPool(pool, 3, 3);
    expect(got.length).toBe(3);
    expect(new Set(got.map((l) => l.stars)).size, '★候補の★の種類').toBe(1);
    expect(got.every((l) => l.stars === 3)).toBe(true);
    /** ★帯に無い★を頼んでも、別の帯の馬で埋めない（★黙って広げない・D-079 ⑦） */
    expect(listingsFromPool(pool, 5, 3)).toEqual([]);
  });

  it('② ★同じ人が引き直しても、観測できる差が出ない（★価格も★も同じ）', () => {
    const a = listingsFromPool(pool, 3, 2);
    const b = listingsFromPool([...pool].reverse(), 3, 2);
    expect(new Set([...a, ...b].map((l) => l.stars)).size).toBe(1);
    expect(new Set([...a, ...b].map((l) => l.priceEP)).size, '★価格から中身を読めない').toBe(1);
  });

  it('③ ★値付けは★から決まり、最低価格を下回らない', () => {
    expect(priceOfStars(3)).toBe(Math.max(MIN_PRICE_EP, 3 * STAR_PRICE_EP));
    expect(priceOfStars(1), '★★1.0 でも最低価格').toBe(MIN_PRICE_EP);
    /** ★★が高いほど高い（単調） */
    let prev = 0;
    for (let s = 1; s <= 5; s += 0.5) {
      const p = priceOfStars(s);
      expect(p, `★${s}`).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('④ ★手放して戻る EP は買った額より十分小さい（★振り直しが成立しない）', () => {
    const price = priceOfStars(3.5);
    const back = sellBackEP(price);
    expect(back).toBe(Math.floor(price * SELL_BACK_RATE));
    expect(back, '★買い直しで増えない').toBeLessThan(price);
    /** ★買う → 手放す → 買う を 1 往復すると、必ず EP が減る */
    expect(price - back).toBeGreaterThan(price * 0.5);
  });

  it('⑤ ★買えるかは EP だけで決まる（★PP を渡す口が無い）', () => {
    const price = priceOfStars(3);
    expect(canBuyWithEP(price, price)).toBe(true);
    expect(canBuyWithEP(price - 1, price)).toBe(false);
    /** ★引数は 2 つ（★PP を足せばここが変わる） */
    expect(canBuyWithEP.length).toBe(2);
  });

  it('⑥ ★在庫の下限で警報が出る（★境界の両側・R-2）', () => {
    expect(marketStockAlert(MARKET_STOCK_MIN).ok).toBe(true);
    expect(marketStockAlert(MARKET_STOCK_MIN - 1).ok, '★下限割れ').toBe(false);
    const alert = marketStockAlert(10);
    expect(alert).toEqual({ ok: false, available: 10, min: MARKET_STOCK_MIN });
  });
});
