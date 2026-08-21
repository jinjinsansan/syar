/**
 * ★勝負服の色替えから肌を外す判定を留める
 *
 *   ⚠️ ★**「通ること」だけを確かめても意味がありません。**
 *      実際に**白く塗られていた色**（陰の肌）が外れることと、
 *      **塗るべき色**（無彩色の勝負服）が外れないことを、両方から留めます。
 */
import { describe, it, expect } from 'vitest';
import { isSkinTone } from '../src/silks-skin.js';

describe('★勝負服の色替えから肌を外す', () => {
  it('★★実際に白く塗られていた色を外す（陰になった肌）', () => {
    /**
     * ★この 150/130/120 が本件そのものです。彩度差 30 なので上着の条件（34 以下）を通り、
     *   明るさも 150 で条件（72 以上）を通るため、**淡い勝負服で白く潰れていました。**
     */
    expect(isSkinTone(150, 130, 120)).toBe(true);
    expect(isSkinTone(168, 142, 126)).toBe(true);   // 頬・首すじ
    expect(isSkinTone(120, 100, 88)).toBe(true);    // より濃い影
  });

  it('★明るい肌も外す（こちらは彩度でも弾かれるが二重に留める）', () => {
    expect(isSkinTone(231, 180, 148)).toBe(true);
    expect(isSkinTone(205, 160, 130)).toBe(true);
  });

  it('★★塗るべき勝負服は外さない（無彩色の灰・白）', () => {
    for (const v of [255, 220, 190, 150, 110, 80]) {
      expect(isSkinTone(v, v, v)).toBe(false);
    }
    expect(isSkinTone(238, 240, 242)).toBe(false);  // わずかに青い白
    expect(isSkinTone(146, 150, 152)).toBe(false);  // わずかに青い灰
    expect(isSkinTone(200, 198, 196)).toBe(false);  // ★ごく僅かに暖かい白でも、差が小さければ服
  });

  it('★真っ黒に近い影は対象外（塗っても白くならない）', () => {
    expect(isSkinTone(50, 40, 30)).toBe(false);
    expect(isSkinTone(30, 20, 10)).toBe(false);
  });

  it('★R>G>B の順序でないものは肌ではない', () => {
    expect(isSkinTone(120, 160, 200)).toBe(false);  // 青系
    expect(isSkinTone(90, 180, 110)).toBe(false);   // 緑系
    expect(isSkinTone(200, 120, 160)).toBe(false);  // 桃色（B > G なので服）
  });
});
