/**
 * 🔴 ★**デフォルメの絵に、写真寄りの毛色表が掛からないこと**（★2026-09-24）
 *
 * ============================================================================
 * 【★何が起きていたか】
 *   ★`isDeformedHorseAsset` は ★**名前の完全一致**を並べており、
 *   ★個体タイプ B（`horse-jockey-side-v8b` / `horse-jockey-diag-front-v4b`）が ★**抜けて**いました。
 *   ★同じデフォルメの絵なのに ★**写真寄りの表**（`COAT_TRANSFORMS`）で焼かれていました。
 *
 *   ★実測（`tools/measure-coat-spread.mjs`・9 色・いちばん近い組の見分けやすさ）:
 *     ★`side-v6`（正しく当たっていた側）  ★24 ✅
 *     ★`side-v6-b`（抜けていた側）        ★**10**（★栗毛 ↔ 月毛）🔴  ★合格線は 20 超
 *
 * 【🔴 ★なぜ気づけなかったか】
 *   ★`coated()` は ★**表に無い毛色を「素材そのまま」にするだけ**で、★何も言いません。
 *   ★別の表を引いても ★**静かに通ります**。★焼いた絵を並べて測るまで見えませんでした。
 *
 * 【★この検査が見ているもの】
 *   ★① ★型（`b` / `c`）が付いた名前も ★**デフォルメと認める**
 *   ★② 🔴 ★**対照**: ★関係ない素材を ★**認めない**（★「全部 true」で緑にしない）
 *   ★③ ★版（`v9` など）は ★**認めない**（★新しい版が黙って当たると絵が急に変わる）
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { isDeformedHorseAsset, COAT_TRANSFORMS, DEFORMED_COAT_TRANSFORMS } from '../src/coat.js';

describe('🔴 ★デフォルメの絵の判定', () => {
  it('★① 型が付いた名前も認める（★書き忘れで写真寄りの表が掛かった）', () => {
    for (const p of [
      'horse-jockey-side-v8', 'horse-jockey-side-v8b', 'horse-jockey-side-v8c',
      'horse-jockey-diag-front-v4', 'horse-jockey-diag-front-v4b', 'horse-jockey-diag-front-v4c',
      'horse-jockey-side-walk-v1', 'horse-jockey-side-walk-v1b',
    ]) {
      expect(isDeformedHorseAsset(p), `🔴 ★${p} がデフォルメと認められていない`).toBe(true);
    }
  });

  it('🔴 ★② 対照: 関係ない素材は認めない', () => {
    for (const p of [
      'horse-jockey-diag-rear-v5', 'horse-jockey-high-diag-v4',
      'horse-jockey-winner-rear-v1', 'horse-jockey-winner-v2',
      'horse-jockey-side-v7', 'horse-jockey-diag-front-v2', '',
    ]) {
      expect(isDeformedHorseAsset(p), `🔴 ★${p} を誤ってデフォルメと認めている`).toBe(false);
    }
  });

  it('🔴 ★③ 新しい版は認めない（★黙って当たると絵が急に変わる）', () => {
    for (const p of ['horse-jockey-side-v9', 'horse-jockey-diag-front-v5', 'horse-jockey-side-walk-v2']) {
      expect(isDeformedHorseAsset(p), `🔴 ★${p} が黙ってデフォルメ扱いになっている`).toBe(false);
    }
  });

  it('🔴 ★2 つの表が同じ毛色を持つ（★片方だけ足すと、片方の絵が鹿毛のまま焼ける）', () => {
    expect(Object.keys(DEFORMED_COAT_TRANSFORMS).sort()).toEqual(Object.keys(COAT_TRANSFORMS).sort());
  });
});
