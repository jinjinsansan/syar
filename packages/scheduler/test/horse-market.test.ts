/**
 * ★**馬の購入**（★GB-4・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §4-1・D-102）
 *
 * 【★見ている壊れ方】
 *   ① ★候補の帯がばらつく（★「引き直せば良い馬が出る」＝振り直しが成立する・D-102 ③）
 *   ② ★価格から中身が読める（★同じ帯なのに価格が違う）
 *   ③ ★手放して戻る EP が大きく、★買って売ってを繰り返せる
 *   ④ ★PP で買える経路ができる（★S-5・L-4 の近縁・D-102 ①）
 *   ⑤ ★在庫が下限を割っても黙って候補を出す（★D-079 ⑦）
 *
 * ⚠️ ★2026-09-18・T-10（D-114 ②）で ★**帯は内部の 24 段の整数**になり、
 *    ★`priceOfStars` は ★**段ではなく目盛（1.0〜5.0）**を受け取ります（`starScaleOfBand`）。
 * 🔴 ★**T-11 で値付けそのものが消えます**（★価格は §10.5 の式（戦績）から）。
 */
import { describe, it, expect } from 'vitest';
import {
  listingsFromPool, priceOfStars, sellBackEP, marketStockAlert, canBuyWithEP,
  STAR_PRICE_EP, MIN_PRICE_EP, SELL_BACK_RATE, MARKET_STOCK_MIN,
} from '../src/index.js';

/** ★NPC の現役プールの見本（★帯はエンジンの `bandOfPotential` が出した整数という想定） */
const pool = [
  { horseId: 'n1', band: 12 }, { horseId: 'n2', band: 14 }, { horseId: 'n3', band: 12 },
  { horseId: 'n4', band: 9 }, { horseId: 'n5', band: 12 }, { horseId: 'n6', band: 20 },
];
/** ★その帯の価格（★呼ぶ側が渡すもの） */
const PRICE_12 = 6174;

describe('★馬の購入（GB-4・D-102）', () => {
  it('① ★候補は同じ帯（★全個体で同一）', () => {
    const got = listingsFromPool(pool, 12, 3, PRICE_12);
    expect(got.length).toBe(3);
    expect(new Set(got.map((l) => l.priceEP)).size, '★候補の価格の種類').toBe(1);
    expect(got.map((l) => l.horseId)).toEqual(['n1', 'n3', 'n5']);
    /** ★帯に無い段を頼んでも、別の帯の馬で埋めない（★黙って広げない・D-079 ⑦） */
    expect(listingsFromPool(pool, 23, 3, 9999)).toEqual([]);
  });

  it('② ★同じ人が引き直しても、観測できる差が出ない（★価格が同じ）', () => {
    const a = listingsFromPool(pool, 12, 2, PRICE_12);
    const b = listingsFromPool([...pool].reverse(), 12, 2, PRICE_12);
    expect(new Set([...a, ...b].map((l) => l.priceEP)).size, '★価格から中身を読めない').toBe(1);
    /** 🔴 ★出品の行に段が載らない（D-114 ②） */
    for (const l of [...a, ...b]) expect(Object.keys(l).sort()).toEqual(['horseId', 'priceEP']);
  });

  it('③ ★値付けは目盛から決まり、最低価格を下回らない', () => {
    expect(priceOfStars(3)).toBe(Math.max(MIN_PRICE_EP, 3 * STAR_PRICE_EP));
    expect(priceOfStars(1), '★目盛 1.0 でも最低価格').toBe(MIN_PRICE_EP);
    /** ★★が高いほど高い（単調） */
    let prev = 0;
    for (let s = 1; s <= 5; s += 0.5) {
      const p = priceOfStars(s);
      expect(p, `目盛 ${s}`).toBeGreaterThanOrEqual(prev);
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
