/**
 * ★**出品の入れ替えの計画**（★D-102・**T-11**・2026-09-19）
 *   ★裁定 `REVIEW_T11_ANSWER_VERDICT_20260919.md`
 *
 * 【★T-11 で変わったこと】
 *   ★旧: ★**素質の帯**で候補を選び、★**帯から値付け**していました。
 *   ★新: ★**価格の帯**で並べ、★価格は §10.5 の式（★呼ぶ側が `npcStudFee` で出す）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**棚に素質が戻る**（★T11-1 ①。★「どの棚にいるか」が帯を教える ＝ 逆算の復活）
 *   ② 🔴 ★**価格が動いたら下ろす**（★T11-2 ①。★毎日 総入れ替えになる）
 *   ③ 🔴 ★**帯が埋まらないとき、別の帯から埋める**（★D-102 ⑤ と同じ作法で、黙って広げない）
 *   ④ 🔴 ★**毎日同じ馬が出る**（★T11-1 ③）
 */
import { describe, it, expect } from 'vitest';
import {
  planListings, listingDrift, priceTierOf,
  PRICE_TIERS_EP, LISTINGS_PER_TIER, MIN_PRICE_EP,
} from '../src/index.js';

/** ★その帯の真ん中あたりの価格 */
const inTier = (t: number): number => PRICE_TIERS_EP[t]! + 10;
const cand = (id: string, priceEP: number): { horseId: string; priceEP: number } => ({ horseId: id, priceEP });

describe('★価格の帯（★T11-1 ①②）', () => {
  it('★帯は昇順で、下限は最低価格と同じ', () => {
    expect(PRICE_TIERS_EP[0]).toBe(MIN_PRICE_EP);
    for (let i = 1; i < PRICE_TIERS_EP.length; i += 1) {
      expect(PRICE_TIERS_EP[i]!, `帯 ${i}`).toBeGreaterThan(PRICE_TIERS_EP[i - 1]!);
    }
  });

  it('★価格 → 帯（★境目の両側・R-2）', () => {
    /** ⚠️ ★**境目の数を写さない**（★測って決め直す値なので、★写すと 2 か所になる・D-052） */
    expect(priceTierOf(PRICE_TIERS_EP[0]!)).toBe(0);
    for (let t = 1; t < PRICE_TIERS_EP.length; t += 1) {
      expect(priceTierOf(PRICE_TIERS_EP[t]! - 1), `帯 ${t} の手前`).toBe(t - 1);
      expect(priceTierOf(PRICE_TIERS_EP[t]!), `帯 ${t} の先頭`).toBe(t);
    }
    expect(priceTierOf(1_000_000)).toBe(PRICE_TIERS_EP.length - 1);
  });

  it('🔴 ★下限を割る価格は投げる（★式を通っていない値・R-27）', () => {
    expect(() => priceTierOf(2_999)).toThrow();
    expect(() => priceTierOf(Number.NaN)).toThrow();
  });

  it('🔴 ★① 計画に素質を渡す口が無い（★T11-1 ①）', () => {
    /**
     * ⚠️ ★**型で縛ります。** ★`MarketCandidate` に段・帯・素質の欄があれば、
     *    ★いつか並べ替えに使われます。★引数の数でも見ます。
     */
    expect(planListings.length, '★引数が増えている（★素質を渡していないか）').toBe(3);
  });
});

describe('★② 価格が動いても下ろさない（★T11-2 ①）', () => {
  it('🔴 ★出ている馬の価格が変わっても、下ろさない', () => {
    const active = [{ horseId: 'a', priceEP: inTier(0) }];
    /** ★同じ馬が、いまは別の帯の価格になっている */
    const pool = [cand('a', inTier(3))];
    const plan = planListings(pool, active, 0);
    expect(plan.deactivate, '★価格が変わっただけで下ろしている').toEqual([]);
  });

  it('★プールから消えた馬は下ろす（★買われた・引退した）', () => {
    const plan = planListings([], [{ horseId: 'a', priceEP: inTier(0) }], 0);
    expect(plan.deactivate).toEqual(['a']);
  });

  it('🔴 ★ずれは数として出す（★凍結は「気づかない」を作りやすい・R-16）', () => {
    const active = [{ horseId: 'a', priceEP: 3_000 }, { horseId: 'b', priceEP: 5_000 }];
    const pool = [cand('a', 3_250), cand('b', 5_000)];
    const drift = listingDrift(active, pool);
    expect(drift).toEqual([{ horseId: 'a', listedEP: 3_000, currentEP: 3_250, diffEP: 250 }]);
  });
});

describe('★帯ごとに 3 口まで（★D-102 ③「選び直しが成立しない」）', () => {
  it('★足りないぶんだけ足す', () => {
    const pool = ['a', 'b', 'c', 'd'].map((id) => cand(id, inTier(0)));
    const plan = planListings(pool, [{ horseId: 'a', priceEP: inTier(0) }], 0);
    expect(plan.add).toHaveLength(LISTINGS_PER_TIER - 1);
    expect(plan.add.map((l) => l.horseId)).not.toContain('a');
  });

  it('★満口なら足さない（★冪等）', () => {
    const active = ['a', 'b', 'c'].map((id) => ({ horseId: id, priceEP: inTier(0) }));
    const pool = ['a', 'b', 'c', 'd'].map((id) => cand(id, inTier(0)));
    expect(planListings(pool, active, 0).add).toEqual([]);
  });

  it('🔴 ★③ 帯が埋まらなくても、別の帯から埋めない', () => {
    /** ★帯 0 に 1 頭しかいない。★帯 1 には 5 頭 */
    const pool = [cand('a', inTier(0)), ...['b', 'c', 'd', 'e', 'f'].map((id) => cand(id, inTier(1)))];
    const plan = planListings(pool, [], 0);
    const byTier = new Map<number, number>();
    for (const l of plan.add) byTier.set(priceTierOf(l.priceEP), (byTier.get(priceTierOf(l.priceEP)) ?? 0) + 1);
    expect(byTier.get(0), '★帯 0 は 1 頭しかいないので 1 口').toBe(1);
    expect(byTier.get(1), '★帯 1 から余分に埋めている').toBe(LISTINGS_PER_TIER);
  });

  it('★1 頭が 2 つの帯に出ない', () => {
    const pool = ['a', 'b', 'c'].map((id) => cand(id, inTier(0)));
    const plan = planListings(pool, [], 0);
    expect(new Set(plan.add.map((l) => l.horseId)).size).toBe(plan.add.length);
  });
});

describe('★④ 毎日同じ馬にならない（★T11-1 ③）', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => cand(id, inTier(0)));

  it('🔴 ★起点が変わると顔ぶれが変わる', () => {
    const first = planListings(pool, [], 0).add.map((l) => l.horseId);
    const later = planListings(pool, [], 3).add.map((l) => l.horseId);
    expect(first).not.toEqual(later);
  });

  it('★同じ起点なら同じ結果（★再現できる・憲法 4）', () => {
    expect(planListings(pool, [], 7).add).toEqual(planListings(pool, [], 7).add);
  });

  it('🔴 ★起点が負・小数なら投げる（★黙って 0 にしない・R-27）', () => {
    expect(() => planListings(pool, [], -1)).toThrow();
    expect(() => planListings(pool, [], 1.5)).toThrow();
  });

  it('★候補が 3 頭以下なら、起点が変わっても同じ顔ぶれ（★全員出る）', () => {
    const few = ['a', 'b', 'c'].map((id) => cand(id, inTier(0)));
    const s0 = [...planListings(few, [], 0).add.map((l) => l.horseId)].sort();
    const s5 = [...planListings(few, [], 5).add.map((l) => l.horseId)].sort();
    expect(s0).toEqual(s5);
  });
});
