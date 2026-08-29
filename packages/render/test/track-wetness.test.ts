/**
 * ★**馬場状態が地面に出る**（2026-08-29）
 *
 * 【★これが生まれた実害】
 *   ⚠️ ★`world-textured.ts`（★画面が使う経路）は、★**馬場状態を一度も見ていませんでした。**
 *      ★`trackSurfacePaletteRole`（良→`dirt-0` … 不良→`dirt-3`）は**既に決まっていて、
 *      ★検査（`perspective-world.test.ts`）まであった**のに、
 *      ★それを読んでいたのは**使われていない旧経路**（`drawPerspectiveWorld`）だけでした。
 *   → ★画面では ★**良でも不良でも地面が同じ**。変わるのは蹴り上げの量だけでした。
 *   ★馬場状態は **25% の確率で良以外**になります（`TRACK_CONDITION_CDF` の良が 0.75）。
 *
 * 【★R-22 の形】
 *   ★「対応表がある」「その検査もある」＝「画面に出ている」ではありません。
 *   ★検査は**役割名を返す関数**を見ていて、★**それを誰が呼ぶか**を見ていませんでした。
 */
import { describe, it, expect } from 'vitest';
import { trackWetnessFactor } from '../src/world-textured.js';
import { trackKickupIntensity, trackSurfacePaletteRole } from '../src/perspective-draw.js';

describe('★馬場状態で走路が暗くなる', () => {
  it('★良は 1（＝いまの絵を 1 ビットも動かさない）', () => {
    expect(trackWetnessFactor('good')).toBe(1);
  });

  it('★省略・知らない値は良へ落ちる（★何もしない側・R-27）', () => {
    expect(trackWetnessFactor(undefined)).toBe(1);
    expect(trackWetnessFactor('banana' as never)).toBe(1);
  });

  it('★悪くなるほど暗い（単調）', () => {
    const good = trackWetnessFactor('good');
    const yielding = trackWetnessFactor('yielding');
    const soft = trackWetnessFactor('soft');
    const bad = trackWetnessFactor('bad');
    expect(yielding).toBeLessThan(good);
    expect(soft).toBeLessThan(yielding);
    expect(bad).toBeLessThan(soft);
    /** ★暗くしすぎない（真っ黒な走路にしない） */
    expect(bad).toBeGreaterThan(0.5);
  });

  it('★既にある 2 つの対応表と、向きが揃っている', () => {
    /**
     * ★役割名（`dirt-0` → `dirt-3`）も蹴り上げの量も「悪いほど強い／暗い」向きです。
     * ⚠️ ★向きが揃っていないと、★**地面は暗いのに砂は乾いている**ような絵になります。
     */
    expect(trackSurfacePaletteRole('dirt', 'good')).toBe('dirt-0');
    expect(trackSurfacePaletteRole('dirt', 'bad')).toBe('dirt-3');
    expect(trackKickupIntensity('dirt', 'bad'))
      .toBeGreaterThan(trackKickupIntensity('dirt', 'good'));
    expect(trackWetnessFactor('bad')).toBeLessThan(trackWetnessFactor('good'));
  });
});
