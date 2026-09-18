/**
 * ★**出品の入れ替えの計画**（★ゲーム本体 (a) 第 5 便-2・2026-09-16・正典 **D-102 ②③⑤**）
 *
 * 【★2026-09-18・T-10（D-114 ②）で「★」が消えました】
 *   ★帯は ★**内部の 24 段の整数**になり、★`MarketListing` は ★**段を持ちません**。
 *   → ★「段が変わった馬を下ろす」は ★**価格で見ます**（★価格は段の関数なので同じ判定）。
 *
 * 【★見ている壊れ方】
 *   ① ★帯ごとの口数を超えて出す（★「選び直し」に近づく・D-102 ③）
 *   ② ★プールから消えた馬を下ろさない（★買われた馬が並び続ける）
 *   ③ ★帯が変わった馬を下ろさない（★中身と価格がずれる）
 *   ④ ★同じ馬を二重に出す
 *   ⑤ ★足りない帯を、別の帯の馬で埋める（★帯の意味が壊れる）
 *   ⑥ ★呼ぶたびに違う結果になる（★乱数を持たない層なのに順序が揺れる）
 *   ⑦ 🔴 ★**出品の行に段が載る**（★D-114 ②。★`horse_market_listing` 経由で外に出る）
 */
import { describe, it, expect } from 'vitest';
import {
  planListings, listingsFromPool,
  LISTED_BANDS, LISTINGS_PER_BAND,
} from '../src/index.js';

const horse = (id: string, band: number) => ({ horseId: id, band });
/** ★帯ごとに `per` 頭のプール */
const pool = (per: number) => LISTED_BANDS.flatMap((b) =>
  Array.from({ length: per }, (_, i) => horse(`h-${b}-${i}`, b)));

/**
 * ★**段 → 価格**の見本（★呼ぶ側が渡すもの。★本番は `priceOfStars(starScaleOfBand(band))`）。
 * ⚠️ ★段ごとに違う値であることだけが要ります（★「帯が変わった＝価格が変わった」を成り立たせるため）。
 */
const priceOfBand = (band: number): number => 3000 + band * 100;

describe('★出品の計画（D-102）', () => {
  it('① ★空から始めると、帯ごとにちょうど口数ぶん出す', () => {
    const plan = planListings(pool(5), [], priceOfBand);
    expect(plan.deactivate).toEqual([]);
    expect(plan.add.length).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
    for (const b of LISTED_BANDS) {
      const rows = plan.add.filter((l) => l.priceEP === priceOfBand(b));
      expect(rows.length, `段 ${b}`).toBe(LISTINGS_PER_BAND);
    }
  });

  it('🔴 ⑦ ★出品の行に段が載らない（★D-114 ②・`horse_market_listing` へ漏らさない）', () => {
    const plan = planListings(pool(5), [], priceOfBand);
    for (const l of plan.add) {
      expect(Object.keys(l).sort(), '★出品が持つ列').toEqual(['horseId', 'priceEP']);
    }
  });

  it('② ★プールから消えた馬を下ろす（★買われた・引退した）', () => {
    const p = pool(5);
    const first = planListings(p, [], priceOfBand);
    const active = first.add.map((l) => ({ horseId: l.horseId, priceEP: l.priceEP }));
    /** ★1 頭がプールから消える */
    const gone = active[0]!;
    const shrunk = p.filter((h) => h.horseId !== gone.horseId);
    const plan = planListings(shrunk, active, priceOfBand);
    expect(plan.deactivate).toEqual([gone.horseId]);
    /** ★空いた 1 口を同じ帯から埋める */
    expect(plan.add.length).toBe(1);
    expect(plan.add[0]!.priceEP).toBe(gone.priceEP);
  });

  it('③ ★帯が変わった馬を下ろす（★中身と価格をずらさない）', () => {
    const p = pool(5);
    const top = LISTED_BANDS[LISTED_BANDS.length - 1]!;
    const bottom = LISTED_BANDS[0]!;
    const active = planListings(p, [], priceOfBand).add.map((l) => ({ horseId: l.horseId, priceEP: l.priceEP }));
    const changed = active.find((a) => a.priceEP === priceOfBand(top))!;
    /** ★素質が下がって最下位の帯になった */
    const p2 = p.map((h) => (h.horseId === changed.horseId ? horse(h.horseId, bottom) : h));
    const plan = planListings(p2, active, priceOfBand);
    expect(plan.deactivate).toContain(changed.horseId);
    /** ★下ろした馬を、同じ回に別の帯で出し直さない */
    expect(plan.add.some((l) => l.horseId === changed.horseId)).toBe(false);
  });

  it('④ ★同じ馬を二重に出さない', () => {
    const plan = planListings(pool(5), [], priceOfBand);
    const ids = plan.add.map((l) => l.horseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('⑤ ★足りない帯を別の帯の馬で埋めない（★帯の意味を保つ）', () => {
    const scarce = LISTED_BANDS[2]!;
    /** ★その帯の馬が 1 頭しかいない */
    const p = [...pool(5).filter((h) => h.band !== scarce), horse('only-one', scarce)];
    const plan = planListings(p, [], priceOfBand);
    const got = plan.add.filter((l) => l.priceEP === priceOfBand(scarce));
    expect(got.length).toBe(1);
    expect(got[0]!.horseId).toBe('only-one');
    /** ★他の帯は満たされている（★足りない帯の穴埋めに使われていない） */
    for (const b of LISTED_BANDS.filter((x) => x !== scarce)) {
      expect(plan.add.filter((l) => l.priceEP === priceOfBand(b)).length, `段 ${b}`).toBe(LISTINGS_PER_BAND);
    }
  });

  it('⑥ ★同じ入力なら同じ計画（★乱数を持たない）', () => {
    const p = pool(5);
    expect(planListings(p, [], priceOfBand)).toEqual(planListings(p, [], priceOfBand));
    /** ★候補の取り方も渡された順（★`listingsFromPool` と同じ約束） */
    const b = LISTED_BANDS[2]!;
    expect(listingsFromPool(p, b, 2, priceOfBand(b)).map((l) => l.horseId)).toEqual([`h-${b}-0`, `h-${b}-1`]);
  });

  it('★すでに満たされていれば何もしない（★冪等）', () => {
    const p = pool(5);
    const active = planListings(p, [], priceOfBand).add.map((l) => ({ horseId: l.horseId, priceEP: l.priceEP }));
    const plan = planListings(p, active, priceOfBand);
    expect(plan.add).toEqual([]);
    expect(plan.deactivate).toEqual([]);
  });
});
