/**
 * ★毛色を**馬体の画素だけ**に掛けることを留める
 *
 * ⚠️ ★元の不具合は「芦毛の `saturate(0.12)` が**騎手ごと脱色**し、肌だけグレーになる」でした。
 *    ★開発側は最初「芦毛を割り当てから外す」で片付けようとしました。**問題のすり替え**です。
 *    オーナー指摘: 「消すのが目的になっていませんか？ **騎手の肌を治すだけなのに**」
 *    → 毛色は減らさず、**掛ける範囲を馬体に限る**のが正しい直し方。
 */
import { describe, it, expect } from 'vitest';
import { applyCoat, isHorseCoat, COAT_TRANSFORMS } from '../src/coat.js';

/** ★素材の実測値（`horse-jockey-side-v7-pose01.png` の分布から） */
const COAT_PIXELS: readonly (readonly [number, number, number])[] = [
  [87, 52, 30], [102, 57, 31], [121, 67, 34], [144, 79, 39], [156, 82, 34], [169, 87, 33],
];
const SKIN_PIXELS: readonly (readonly [number, number, number])[] = [
  [150, 130, 120], [168, 142, 126], [205, 160, 130], [231, 180, 148], [121, 107, 95],
];
const NEUTRAL_PIXELS: readonly (readonly [number, number, number])[] = [
  [255, 255, 255], [236, 236, 236], [141, 136, 132], [48, 48, 48], [16, 16, 16],
];

describe('★毛色を馬体だけに掛ける', () => {
  it('★★馬体は変換の対象になる', () => {
    for (const [r, g, b] of COAT_PIXELS) {
      expect(isHorseCoat(r, g, b), `馬体 (${r},${g},${b}) が対象から漏れています`).toBe(true);
    }
  });

  it('★★騎手の肌は変換しない — これが元の不具合そのもの', () => {
    for (const [r, g, b] of SKIN_PIXELS) {
      expect(isHorseCoat(r, g, b), `肌 (${r},${g},${b}) を馬体と誤判定しています`).toBe(false);
    }
  });

  it('★★無彩色（勝負服・馬具・白斑・たてがみ）は変換しない', () => {
    for (const [r, g, b] of NEUTRAL_PIXELS) {
      expect(isHorseCoat(r, g, b), `無彩色 (${r},${g},${b}) を馬体と誤判定しています`).toBe(false);
    }
  });

  it('★★芦毛を掛けても、肌は肌のまま残る（元の症状が再発しないこと）', () => {
    /**
     * ★ここが本件の核心です。芦毛は彩度を 0.12 まで落とすので、
     *   **もし肌に掛かれば必ず灰色になります。** 掛からないことを直接見ます。
     */
    const grey = COAT_TRANSFORMS.grey;
    for (const [r, g, b] of SKIN_PIXELS) {
      expect(isHorseCoat(r, g, b)).toBe(false);
      // 仮に掛けたらどうなるかも見ておく（掛けてはいけない理由の証拠）
      const [R, G, B] = applyCoat(r, g, b, grey);
      const spreadBefore = Math.max(r, g, b) - Math.min(r, g, b);
      const spreadAfter = Math.max(R, G, B) - Math.min(R, G, B);
      expect(spreadAfter, '芦毛は肌の色味をほぼ消してしまう（だから掛けない）')
        .toBeLessThan(spreadBefore * 0.4);
    }
  });

  it('★芦毛を馬体に掛けると、実際に灰色になる（毛色として機能している）', () => {
    const grey = COAT_TRANSFORMS.grey;
    for (const [r, g, b] of COAT_PIXELS) {
      const [R, G, B] = applyCoat(r, g, b, grey);
      const spread = Math.max(R, G, B) - Math.min(R, G, B);
      expect(spread, `馬体 (${r},${g},${b}) が灰色になっていません`).toBeLessThan(24);
      expect(R + G + B, '芦毛は明るくなるはず').toBeGreaterThan(r + g + b);
    }
  });

  it('★他の毛色は色味を保つ（芦毛だけが特別に彩度を落とす）', () => {
    for (const name of ['chestnut', 'dark-bay', 'blue-black'] as const) {
      const t = COAT_TRANSFORMS[name];
      const [R, G, B] = applyCoat(144, 79, 39, t);
      const spread = Math.max(R, G, B) - Math.min(R, G, B);
      expect(spread, `${name} が無彩色になっています`).toBeGreaterThan(30);
    }
  });

  it('★変換は 0〜255 に収まる', () => {
    for (const name of ['chestnut', 'dark-bay', 'blue-black', 'grey'] as const) {
      for (const [r, g, b] of [...COAT_PIXELS, [255, 250, 240] as const, [2, 1, 0] as const]) {
        const out = applyCoat(r, g, b, COAT_TRANSFORMS[name]);
        for (const v of out) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('★鹿毛は変換なし（素材そのまま）', () => {
    expect(COAT_TRANSFORMS.bay).toBeUndefined();
  });
});
