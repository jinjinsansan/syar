/**
 * ★**毛色は馬 ID から**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §9・2026-09-23）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**同じ馬の毛色が、枠や日によって変わる**（★見分けるための仕組みが見分けを壊す）
 *   ② 🔴 ★**毛色が散らない**（★全員同じ毛色に寄る＝「同じ馬が並んでいる」に戻る）
 *   ③ ★**実在の割合から外れる**（★2026-08-28 のオーナー要望 ①）
 *   ④ ★**決定論が壊れる**（★`Math.random()` / `Date.now()` が混ざる・憲法 §1-4）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { coatOfHorseId, COAT_WEIGHTS, COAT_TRANSFORMS } from '@star/render';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'packages/render/src/coat.ts'), 'utf8');
/** ★註記の中の語は拾わない（★註記に「Math.random は使わない」と書いてある） */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** ★本番の馬 ID と同じ形（★uuid）を、決まった手順で作る（★検査も決定論） */
const idAt = (n: number): string => {
  const hex = n.toString(16).padStart(12, '0');
  return `0f000000-0000-4000-8000-${hex}`;
};

describe('★毛色は馬 ID から（★裁定 §9）', () => {
  it('① 🔴 ★同じ馬は、いつ引いても同じ毛色（★枠は渡さない）', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = idAt(i);
      expect(coatOfHorseId(id)).toBe(coatOfHorseId(id));
    }
    // ★引数は馬 ID だけ（★枠を受け取る形になっていない）
    expect(SRC).toMatch(/export function coatOfHorseId\(horseId: string\): CoatName/);
  });

  it('② 🔴 ★毛色が散る（★7 種のうち 5 種以上が出る・1 万頭）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) seen.add(coatOfHorseId(idAt(i)));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it('③ ★実在の割合に近い（★1 万頭で、いちばん多い毛色が 40〜56%）', () => {
    const count = new Map<string, number>();
    const N = 10_000;
    for (let i = 0; i < N; i += 1) {
      const c = coatOfHorseId(idAt(i));
      count.set(c, (count.get(c) ?? 0) + 1);
    }
    const bay = (count.get('bay') ?? 0) / N * 100;
    expect(bay).toBeGreaterThan(40);
    expect(bay).toBeLessThan(56);
    // ★重みの順と、実際に出た順が同じ（★1 位から 3 位まで）
    const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    expect(ranked.slice(0, 3)).toEqual(COAT_WEIGHTS.slice(0, 3).map(([c]) => c));
  });

  it('④ ★決定論（★乱数も時刻も使っていない）', () => {
    expect(LIVE).not.toMatch(/Math\.random/);
    expect(LIVE).not.toMatch(/Date\.now/);
  });

  it('★返す名前は、色の表に在るものだけ', () => {
    const known = Object.keys(COAT_TRANSFORMS);
    for (let i = 0; i < 500; i += 1) expect(known).toContain(coatOfHorseId(idAt(i)));
    // ★白毛は入れない（★2026-08-28 の註記）
    expect(known).not.toContain('white');
  });

  it('🔴 ★対照: ★枠番から引く古い規則では、同じ馬の毛色が枠で変わる', () => {
    /** ★`race/page.tsx` の古い規則（★この検査の中だけで再現する） */
    const OLD = ['bay', 'chestnut', 'dark-bay', 'bay', 'grey', 'dark-bay'];
    const oldCoatOf = (gate: number): string => OLD[(gate - 1) % OLD.length]!;
    expect(oldCoatOf(1)).not.toBe(oldCoatOf(2));
    // ★新しい規則は枠を見ないので、同じ馬なら枠が変わっても同じ
    const id = idAt(7);
    expect(coatOfHorseId(id)).toBe(coatOfHorseId(id));
  });
});
