/**
 * ★**出品の入れ替えの計画**（★ゲーム本体 (a) 第 5 便-2・2026-09-16・正典 **D-102 ②③⑤**）
 *
 * 【★見ている壊れ方】
 *   ① ★帯ごとの口数を超えて出す（★「選び直し」に近づく・D-102 ③）
 *   ② ★プールから消えた馬を下ろさない（★買われた馬が並び続ける）
 *   ③ ★★が変わった馬を下ろさない（★見た目と価格がずれる）
 *   ④ ★同じ馬を二重に出す
 *   ⑤ ★足りない帯を、別の帯の馬で埋める（★★の帯の意味が壊れる）
 *   ⑥ ★呼ぶたびに違う結果になる（★乱数を持たない層なのに順序が揺れる）
 */
import { describe, it, expect } from 'vitest';
import {
  planListings, listingsFromPool, priceOfStars,
  LISTED_BANDS, LISTINGS_PER_BAND,
} from '../src/index.js';

const horse = (id: string, stars: number) => ({ horseId: id, stars });
/** ★帯ごとに `per` 頭のプール */
const pool = (per: number) => LISTED_BANDS.flatMap((b) =>
  Array.from({ length: per }, (_, i) => horse(`h-${b}-${i}`, b)));

describe('★出品の計画（D-102）', () => {
  it('① ★空から始めると、帯ごとにちょうど口数ぶん出す', () => {
    const plan = planListings(pool(5), []);
    expect(plan.deactivate).toEqual([]);
    expect(plan.add.length).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
    for (const b of LISTED_BANDS) {
      const rows = plan.add.filter((l) => l.stars === b);
      expect(rows.length, `★${b}`).toBe(LISTINGS_PER_BAND);
      for (const r of rows) expect(r.priceEP).toBe(priceOfStars(b));
    }
  });

  it('② ★プールから消えた馬を下ろす（★買われた・引退した）', () => {
    const p = pool(5);
    const first = planListings(p, []);
    const active = first.add.map((l) => ({ horseId: l.horseId, stars: l.stars }));
    /** ★1 頭がプールから消える */
    const gone = active[0]!;
    const shrunk = p.filter((h) => h.horseId !== gone.horseId);
    const plan = planListings(shrunk, active);
    expect(plan.deactivate).toEqual([gone.horseId]);
    /** ★空いた 1 口を同じ帯から埋める */
    expect(plan.add.length).toBe(1);
    expect(plan.add[0]!.stars).toBe(gone.stars);
  });

  it('③ ★★が変わった馬を下ろす（★見た目と価格をずらさない）', () => {
    const p = pool(5);
    const active = planListings(p, []).add.map((l) => ({ horseId: l.horseId, stars: l.stars }));
    const changed = active.find((a) => a.stars === 4.0)!;
    /** ★素質が下がって★が 2.0 になった */
    const p2 = p.map((h) => (h.horseId === changed.horseId ? horse(h.horseId, 2.0) : h));
    const plan = planListings(p2, active);
    expect(plan.deactivate).toContain(changed.horseId);
    /** ★下ろした馬を、同じ回に別の帯で出し直さない */
    expect(plan.add.some((l) => l.horseId === changed.horseId)).toBe(false);
  });

  it('④ ★同じ馬を二重に出さない', () => {
    const plan = planListings(pool(5), []);
    const ids = plan.add.map((l) => l.horseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('⑤ ★足りない帯を別の帯の馬で埋めない（★帯の意味を保つ）', () => {
    /** ★★3.0 の馬が 1 頭しかいない */
    const p = [...pool(5).filter((h) => h.stars !== 3.0), horse('only-3', 3.0)];
    const plan = planListings(p, []);
    const three = plan.add.filter((l) => l.stars === 3.0);
    expect(three.length).toBe(1);
    expect(three[0]!.horseId).toBe('only-3');
    /** ★他の帯は満たされている（★足りない帯の穴埋めに使われていない） */
    for (const b of LISTED_BANDS.filter((x) => x !== 3.0)) {
      expect(plan.add.filter((l) => l.stars === b).length, `★${b}`).toBe(LISTINGS_PER_BAND);
    }
  });

  it('⑥ ★同じ入力なら同じ計画（★乱数を持たない）', () => {
    const p = pool(5);
    expect(planListings(p, [])).toEqual(planListings(p, []));
    /** ★候補の取り方も渡された順（★`listingsFromPool` と同じ約束） */
    expect(listingsFromPool(p, 3.0, 2).map((l) => l.horseId)).toEqual(['h-3-0', 'h-3-1']);
  });

  it('★すでに満たされていれば何もしない（★冪等）', () => {
    const p = pool(5);
    const active = planListings(p, []).add.map((l) => ({ horseId: l.horseId, stars: l.stars }));
    const plan = planListings(p, active);
    expect(plan.add).toEqual([]);
    expect(plan.deactivate).toEqual([]);
  });
});
