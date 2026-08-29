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
import { trackWetnessAlpha, trackWetnessColor } from '../src/world-textured.js';
import { airborneDustFactor, trackKickupIntensity, trackSurfacePaletteRole } from '../src/perspective-draw.js';

describe('★馬場状態で走路が暗くなる', () => {
  it('★良は 0（＝濡れの層を 1 枚も重ねない＝いまの絵を 1 ビットも動かさない）', () => {
    expect(trackWetnessAlpha('good')).toBe(0);
  });

  it('★省略・知らない値は良へ落ちる（★何もしない側・R-27）', () => {
    expect(trackWetnessAlpha(undefined)).toBe(0);
    expect(trackWetnessAlpha('banana' as never)).toBe(0);
  });

  it('★悪くなるほど濃い（単調）', () => {
    const good = trackWetnessAlpha('good');
    const yielding = trackWetnessAlpha('yielding');
    const soft = trackWetnessAlpha('soft');
    const bad = trackWetnessAlpha('bad');
    expect(yielding).toBeGreaterThan(good);
    expect(soft).toBeGreaterThan(yielding);
    expect(bad).toBeGreaterThan(soft);
    /** ★濃くしすぎない（真っ黒な走路にしない） */
    expect(bad).toBeLessThan(0.5);
  });

  it('★稍重と重が、目で分かる差になっている（★「作った」と言える量か）', () => {
    /**
     * ⚠️ ★前の作りは色の掛け算だけで、★画面には **3〜5%** しか出ませんでした
     *    （実測: 芝 100/98/97/95・ダート 100/97/95/92）。★オーナー評「作られていない」。
     * ★層を重ねる形にしたので、★1 段あたり 10 ポイント以上の差が出ます。
     */
    expect(trackWetnessAlpha('yielding')).toBeGreaterThanOrEqual(0.10);
    expect(trackWetnessAlpha('soft') - trackWetnessAlpha('yielding')).toBeGreaterThanOrEqual(0.10);
  });

  it('★濡れの色は馬場で分かれる（芝は深緑・ダートは深褐）', () => {
    expect(trackWetnessColor('turf')).not.toBe(trackWetnessColor('dirt'));
    /** ★省略時は芝側（★画面の既定と同じ側・R-27） */
    expect(trackWetnessColor(undefined)).toBe(trackWetnessColor('turf'));
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
    expect(trackWetnessAlpha('bad')).toBeGreaterThan(trackWetnessAlpha('good'));
  });
});

/**
 * ★**濡れると砂埃は減り、塊は増える**（2026-08-30）
 *
 * ⚠️ 【★直した実害】★`trackKickupIntensity` は濡れるほど**増えます**（良 0.22 → 不良 0.86）。
 *    ★あれは「蹄が蹴り上げる量」なので増えて正しいのですが、
 *    ★**舞い上がる砂埃**にそのまま掛けると ★**濡れた馬場ほど砂煙が濃く**なりました。★逆です。
 *    ★濡れた砂は舞い上がらず、★**塊で飛びます。**
 */
describe('★濡れると砂埃は減る（塊は増える）', () => {
  it('★良は 1（＝いまの絵を動かさない）', () => {
    expect(airborneDustFactor('good')).toBe(1);
  });

  it('★省略・知らない値は良へ落ちる（R-27）', () => {
    expect(airborneDustFactor(undefined)).toBe(1);
    expect(airborneDustFactor('banana' as never)).toBe(1);
  });

  it('★濡れるほど砂埃は薄く（単調に減る）', () => {
    expect(airborneDustFactor('yielding')).toBeLessThan(airborneDustFactor('good'));
    expect(airborneDustFactor('soft')).toBeLessThan(airborneDustFactor('yielding'));
    expect(airborneDustFactor('bad')).toBeLessThan(airborneDustFactor('soft'));
    /** ★0 にはしない（重でも蹄元は多少舞う） */
    expect(airborneDustFactor('bad')).toBeGreaterThan(0);
  });

  it('★砂埃と塊は逆向きに動く（★ここが揃っていると「逆」に戻る）', () => {
    /**
     * ⚠️ ★塊（`trackKickupIntensity`）は増え、★砂埃（`airborneDustFactor`）は減る。
     *    ★**両方が同じ向きなら、直す前の状態に戻っています。**
     */
    const chunkUp = trackKickupIntensity('dirt', 'soft') > trackKickupIntensity('dirt', 'good');
    const dustDown = airborneDustFactor('soft') < airborneDustFactor('good');
    expect(chunkUp, '★塊が濡れて増えていない').toBe(true);
    expect(dustDown, '★砂埃が濡れて減っていない（★濡れるほど砂煙が濃い＝逆）').toBe(true);
  });
});
