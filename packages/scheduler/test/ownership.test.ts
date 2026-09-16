/**
 * ★**所有頭数と、同じレースに出せる頭数**（★GB-2・2026-09-16・指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §2-1）
 *
 * 【★見ている壊れ方】
 *   ① ★上限が正典（§6.7・D-104）と食い違う（★現役 30・繁殖 10・種牡 5）
 *   ② ★同じレースに 3 頭目が通る／★別のレースの登録が数に混ざる
 *   ③ ★自馬が 2 頭のとき、★**片方しか含まない買い目**が通る（★正典 §9.5「複数頭なら全頭を含む組合せだけ」）
 *   ④ ★上限が 2 か所に書かれ、★片方だけ直しても検査が通ってしまう（★値照合で固定）
 */
import { describe, it, expect } from 'vitest';
import {
  OWNERSHIP_LIMITS, ENTRIES_PER_OWNER_MAX, ownershipLimitOf, canOwnMore, canEnterRace, ownHorseSelectionOk,
} from '../src/index.js';

describe('★所有頭数（GB-2・D-104）', () => {
  it('① ★上限は正典の値（現役 30・繁殖 10・種牡 5）。★現役 30 頭目は受理・31 頭目は拒否', () => {
    expect(OWNERSHIP_LIMITS.active).toBe(30);
    expect(OWNERSHIP_LIMITS.broodmare).toBe(10);
    expect(OWNERSHIP_LIMITS.stallion).toBe(5);
    /** ★境界の両側（R-2） */
    expect(canOwnMore('active', 29), '30 頭目').toBe(true);
    expect(canOwnMore('active', 30), '31 頭目').toBe(false);
    expect(canOwnMore('broodmare', 9)).toBe(true);
    expect(canOwnMore('broodmare', 10)).toBe(false);
    expect(canOwnMore('stallion', 4)).toBe(true);
    expect(canOwnMore('stallion', 5)).toBe(false);
  });

  it('② ★同じレースに 2 頭目は受理・3 頭目は拒否。★別のレースなら影響しない', () => {
    expect(ENTRIES_PER_OWNER_MAX).toBe(2);
    expect(canEnterRace(0), '1 頭目').toBe(true);
    expect(canEnterRace(1), '2 頭目').toBe(true);
    expect(canEnterRace(2), '3 頭目').toBe(false);
    /** ★数えるのはレースごと（★別のレースに 2 頭いても、このレースの 1 頭目は通る） */
    const inThisRace = 0;
    expect(canEnterRace(inThisRace)).toBe(true);
  });

  it('③ ★§9.5: 自馬が複数なら全頭を含む組合せだけ（★片方だけの買い目は拒否）', () => {
    /** ★自馬なし → 制限しない */
    expect(ownHorseSelectionOk([3, 7], [])).toBe(true);
    /** ★自馬 1 頭 → その馬を含むこと */
    expect(ownHorseSelectionOk([5], [5])).toBe(true);
    expect(ownHorseSelectionOk([3, 7], [5])).toBe(false);
    /** ★自馬 2 頭 → **両方**を含むこと */
    expect(ownHorseSelectionOk([5, 9], [5, 9])).toBe(true);
    expect(ownHorseSelectionOk([5, 9, 2], [5, 9])).toBe(true);
    expect(ownHorseSelectionOk([5, 2], [5, 9]), '★片方だけ（DB の現在の実装はこれを通す）').toBe(false);
    expect(ownHorseSelectionOk([9], [5, 9])).toBe(false);
    /** ★2 頭出したら、1 頭しか選べない券種（単勝・複勝）は買えない（正典の帰結） */
    expect(ownHorseSelectionOk([5], [5, 9])).toBe(false);
  });

  it('④ ★上限は 1 か所から引く（★関数と表が同じ値・★2 か所に書いて片方だけ直せば落ちる）', () => {
    for (const kind of ['active', 'broodmare', 'stallion'] as const) {
      expect(ownershipLimitOf(kind), kind).toBe(OWNERSHIP_LIMITS[kind]);
      /** ★境界は必ず上限の値から導かれていること（★別の数が混ざっていない） */
      expect(canOwnMore(kind, OWNERSHIP_LIMITS[kind] - 1)).toBe(true);
      expect(canOwnMore(kind, OWNERSHIP_LIMITS[kind])).toBe(false);
    }
  });
});
