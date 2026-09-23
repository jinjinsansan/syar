/**
 * ★**勝負服は持ち主の色で**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §2・2026-09-23）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**書く側だけ在って、読む側が無い**（★D-119 の族）。★選ばせた色が画面に一度も出ない
 *   ② 🔴 ★**色の出どころが 2 つになる**（★画面が自分の色表を持つ）
 *   ③ ★**NPC の馬まで持ち主の色で描く**（★規則を 1 本にする・裁定 §2 条件 1）
 *   ④ ★**知らない鍵で画面が止まる**（★DB に古い値が残っていても出す）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SILK_COLORS, SLEEVES, sleeveHex, ownerSilksOf, silksForHorse } from '@star/render';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const TRAIN = strip(readFileSync(path.join(ROOT, 'apps/web/src/app/train/page.tsx'), 'utf8'));
const SETUP = strip(readFileSync(path.join(ROOT, 'apps/web/src/lib/setup.ts'), 'utf8'));
const REPO = strip(readFileSync(path.join(ROOT, 'apps/web/src/lib/stable-repo.ts'), 'utf8'));

describe('★勝負服は持ち主の色で（★裁定 §2）', () => {
  it('★16 色ある・鍵も色も重複しない', () => {
    expect(SILK_COLORS).toHaveLength(16);
    expect(new Set(SILK_COLORS.map((c) => c.key)).size).toBe(16);
    expect(new Set(SILK_COLORS.map((c) => c.hex)).size).toBe(16);
    expect(SLEEVES.map((s) => s.key)).toEqual(['same', 'white', 'black']);
  });

  it('★袖は 3 択どおり', () => {
    expect(sleeveHex('same', '#1a6fd4')).toBe('#1a6fd4');
    expect(sleeveHex('white', '#1a6fd4')).toBe('#ffffff');
    expect(sleeveHex('black', '#1a6fd4')).toBe('#111318');
  });

  it('① ★選んだ色がそのまま返る', () => {
    const s = ownerSilksOf({ silkColor: 'magenta', silkSleeve: 'black' });
    expect(s.bodyHex).toBe('#b3306e');
    expect(s.sleeveHex).toBe('#111318');
    expect(s.label).toBe('紅紫');
    expect(s.known).toBe(true);
  });

  it('④ ★知らない鍵・未設定でも止まらない（★既定に倒し、倒したことを言う）', () => {
    for (const bad of [null, undefined, '', 'nanika']) {
      const s = ownerSilksOf({ silkColor: bad, silkSleeve: null });
      expect(s.bodyHex).toBe('#1a6fd4');
      expect(s.known).toBe(false);
    }
  });

  it('③ 🔴 ★NPC の馬は持ち主の色で描かない（★null ＝ 今までどおり枠から）', () => {
    expect(silksForHorse({ ownerId: null, silkColor: 'green', silkSleeve: 'same' })).toBe(null);
    expect(silksForHorse({ ownerId: undefined, silkColor: 'green', silkSleeve: 'same' })).toBe(null);
    const mine = silksForHorse({ ownerId: 'u1', silkColor: 'green', silkSleeve: 'same' });
    expect(mine?.bodyHex).toBe('#12a05a');
  });

  it('★枠番を受け取る形になっていない（★枠の色は別の役割）', () => {
    const src = readFileSync(path.join(ROOT, 'packages/render/src/silks.ts'), 'utf8');
    expect(strip(src)).not.toMatch(/gate/i);
  });

  it('② 🔴 ★画面は自分の色表を持たない（★出どころは packages の 1 か所）', () => {
    // ★`setup.ts` は再輸出だけ（★16 色の定義が戻っていない）
    expect(SETUP).not.toMatch(/vermilion/);
    expect(SETUP).toMatch(/from '@star\/render'/);
    // 🔴 ★育成の画面に勝負服は出さない（★2026-09-24・オーナー指摘「育成に騎手はいない」）
    expect(TRAIN).not.toMatch(/#1a6fd4/);
    expect(TRAIN).not.toMatch(/silks/);
  });

  it('① 🔴 ★読む側が在る（★users から silk_color を読んでいる）', () => {
    expect(REPO).toMatch(/silk_color/);
    expect(REPO).toMatch(/ownerSilksOf/);
  });
});
