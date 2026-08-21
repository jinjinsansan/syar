/**
 * ★勝負服の色替えから肌を外す判定を留める
 *
 *   ⚠️ ★**「通ること」だけを確かめても意味がありません。**
 *      実際に**白く塗られていた色**（陰の肌）が外れることと、
 *      **塗るべき色**（無彩色の勝負服）が外れないことを、両方から留めます。
 */
import { describe, it, expect } from 'vitest';
import { isSkinTone, isSkinRepaint } from '../src/silks-skin.js';

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

describe('★毛色フィルタで脱色された肌を塗り直す判定', () => {
  it('★★肌は塗り直す', () => {
    expect(isSkinRepaint(150, 130, 120)).toBe(true);   // 陰の肌
    expect(isSkinRepaint(168, 142, 126)).toBe(true);   // 頬
    expect(isSkinRepaint(205, 160, 130)).toBe(true);   // 明るい肌
    expect(isSkinRepaint(231, 180, 148)).toBe(true);
  });

  it('★★馬体（鹿毛）は塗り直さない — 巻き込むと毛色バリエーションが壊れる', () => {
    /**
     * ★素材の実測分布（`horse-jockey-side-v7-pose01.png`）:
     *   r−g 30〜90 は鹿毛の馬体。代表色を並べて、**全部外れる**ことを見る。
     */
    const coats: readonly (readonly [number, number, number])[] = [
      [87, 52, 30], [102, 57, 31], [121, 67, 34], [144, 79, 39], [156, 82, 34], [169, 87, 33],
    ];
    for (const [r, g, b] of coats) {
      expect(isSkinRepaint(r, g, b), `馬体 (${r},${g},${b}) を肌と誤判定しています`).toBe(false);
    }
  });

  it('★黒いたてがみ・濃い影は対象外', () => {
    expect(isSkinRepaint(60, 40, 25)).toBe(false);
    expect(isSkinRepaint(30, 20, 10)).toBe(false);
  });

  it('★無彩色（勝負服・鞍布）は塗り直さない', () => {
    for (const v of [255, 200, 150, 100]) expect(isSkinRepaint(v, v, v)).toBe(false);
    expect(isSkinRepaint(141, 136, 132)).toBe(false);  // ★実測の「ほぼ無彩色」帯
  });

  it('★★塗り直しの判定は、塗らない判定より狭い（安全側の向きが逆）', () => {
    /**
     * ★`isSkinTone`（塗ってはいけない）は広く、`isSkinRepaint`（塗り直す）は狭く。
     *   ⚠️ 逆にすると、**馬体を肌として塗り直して毛色が壊れます。**
     */
    const coat: readonly (readonly [number, number, number])[] = [[144, 79, 39], [169, 87, 33]];
    for (const [r, g, b] of coat) {
      expect(isSkinTone(r, g, b)).toBe(true);      // 広い側は拾う（塗らないので安全）
      expect(isSkinRepaint(r, g, b)).toBe(false);  // 狭い側は拾わない
    }
  });
});
