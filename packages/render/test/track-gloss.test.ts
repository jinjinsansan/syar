/**
 * ★**濡れた走路が空を映す（照り）**（2026-08-30・オーナー指示「馬場の調整」）
 *
 * 【★なぜ入れたか】
 *   ★2026-08-30 まで、濡れた馬場は「**暗くする**」だけでした（`trackWetnessAlpha`）。
 *   ★実画面の評は「★**暗くなったとは見えても、濡れているとは見えない**」— ★影が落ちたように見えます。
 *   ★濡れた面が濡れて見えるのは ★**空を映すから**で、★暗さとは**別の量**です。
 *
 * 【★この検査が守るもの】
 *   ① ★**良は 1 ビットも動かない**（濡れていない面は空を映さない）
 *   ② ★量の向きが物理どおり（濡れるほど強い／★**奥ほど強い**）
 *   ③ ★既定で入っていて、★`?gloss=0` で**戻せる**こと（D-085）
 *   ④ ⚠️ ★**入れると実際に画が変わる**こと（★正面・横の**両方**）
 *
 * ⚠️ ★④ が要ります。★①〜③ だけを見ると、★**機構が最初から効いていなくても検査は緑**です（R-16）。
 *    ★`infield-reversed.test.ts` と同じ形にしてあります。
 */
import { describe, it, expect } from 'vitest';
import {
  trackGlossAlpha, trackWetnessAlpha, TRACK_GLOSS_GAIN, HORIZON_SKY_COLOR,
  drawTexturedWorld, type TexturedWorldAssets,
} from '../src/world-textured.js';
import { TRACK_GLOSS_DEFAULT, trackGlossFromSearch } from '../src/broadcast-v2.js';
import { drawParallaxPlate, type ParallaxPlate } from '../src/parallax-plate.js';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★カメラは場面解決に決めさせます（手で組まない・R-30） */
const scene = resolveBroadcastV2Scene(
  course, [{ gate: 1, s: 700, w: 2.2 }], VIEWPORT, false, { forceShotId: 'fourth-corner-front' },
);
const EYE_Z = scene.camera.eye.z;

describe('★濡れた面が空を映す量（フレネル）', () => {
  it('★良は必ず 0（＝濡れていない面は空を映さない＝良の絵は動かない）', () => {
    for (const d of [5, 30, 120, 600]) {
      expect(trackGlossAlpha('good', d, EYE_Z)).toBe(0);
      expect(trackGlossAlpha(undefined, d, EYE_Z)).toBe(0);
      expect(trackGlossAlpha('banana' as never, d, EYE_Z)).toBe(0);
    }
  });

  it('★濡れるほど強く映る（同じ深さで単調）', () => {
    const at = (c: 'yielding' | 'soft' | 'bad'): number => trackGlossAlpha(c, 120, EYE_Z);
    expect(at('yielding')).toBeGreaterThan(0);
    expect(at('soft')).toBeGreaterThan(at('yielding'));
    expect(at('bad')).toBeGreaterThan(at('soft'));
  });

  it('⚠️ ★**奥ほど強い**（＝浅く当たるほどよく映る・ここが照りの本体）', () => {
    const at = (d: number): number => trackGlossAlpha('soft', d, EYE_Z);
    expect(at(200)).toBeGreaterThan(at(60));
    expect(at(60)).toBeGreaterThan(at(20));
    expect(at(20)).toBeGreaterThan(at(5));
    /**
     * ★**手前と奥で桁が違うこと**を押さえます。
     * ⚠️ ★ここが 1 に近いと「一様に明るくしただけ」＝★**対比が生まれず、ただ白っぽい地面**になります。
     */
    expect(at(200) / Math.max(1e-9, at(5))).toBeGreaterThan(4);
  });

  it('★カメラの足元では映らない（真上から見た面は空を映さない）', () => {
    /** ★深さ 0 では入射角の余弦が 1 ＝ Schlick の下限（水の R0 ≈ 0.02）まで落ちます */
    expect(trackGlossAlpha('bad', 0, EYE_Z)).toBeLessThan(0.02);
    /** ★カメラ高さ 0（地面すれすれ）でも壊れない（0 除算にしない） */
    expect(Number.isFinite(trackGlossAlpha('bad', 100, 0))).toBe(true);
  });

  it('⚠️ ★**照りが、濡れの暗さを打ち消さない**（★2026-08-30 に一度やりました）', () => {
    /**
     * 【★この検査が生まれた実害】
     *   ★照りの係数を **0.55** と置いて実画面で測ったところ:
     *     ★良 → 重（走路の帯）… ★照りなし **−23.4%** → ★照り 0.55 で **−6.6%**
     *   ⚠️ ★**濡れの暗さがほとんど残りませんでした。** ★そのまま出せば
     *      ★「★**何も変わっていません**」を**もう一度**言われる形です。
     *
     * ★そこで「★照りの層は、濡れの層より**十分に薄い**」を条件として固定します。
     * ⚠️ ★**係数だけを見張っても駄目**です（`TRACK_GLOSS_GAIN` を直接見ると、
     *    ★フレネルの形を変えて同じことが起きても気づけません）。★**量どうしの比**で見ます。
     */
    for (const c of ['yielding', 'soft', 'bad'] as const) {
      const wet = trackWetnessAlpha(c);
      for (const d of [10, 40, 120, 400, 5000]) {
        const ratio = trackGlossAlpha(c, d, EYE_Z) / wet;
        expect(
          ratio,
          `★照り（${c}・深さ ${d}m）が濡れの層に対して濃すぎる＝暗さを打ち消す`,
        ).toBeLessThan(0.25);
      }
    }
  });

  it('★白飛びしない（走路が白い帯にならないこと）', () => {
    /**
     * ★上限は「濡れの量 × 1（真横） × 係数」です。
     * ⚠️ ★この線の**意図**は「★**走路が白い帯にならない**」ことです。
     *    ★`trackWetnessAlpha` の `bad < 0.7` の対で、★暗い側と明るい側の両方を押さえます（R-2）。
     */
    const ceiling = trackWetnessAlpha('bad') * TRACK_GLOSS_GAIN;
    for (const d of [5, 50, 500, 5000]) {
      expect(trackGlossAlpha('bad', d, EYE_Z)).toBeLessThanOrEqual(ceiling);
    }
    expect(ceiling, '★照りが強すぎる。走路が白く飛んで模様が消える').toBeLessThan(0.35);
  });
});

describe('★照りの既定と戻し口（D-085）', () => {
  it('★既定は入っている', () => {
    expect(TRACK_GLOSS_DEFAULT).toBe(true);
    expect(trackGlossFromSearch('')).toBe(true);
    expect(trackGlossFromSearch('?seed=42')).toBe(true);
  });

  it('★`?gloss=0` で戻せる（戻し口）', () => {
    expect(trackGlossFromSearch('?gloss=0')).toBe(false);
    expect(trackGlossFromSearch('?gloss=off')).toBe(false);
    expect(trackGlossFromSearch('?gloss=1')).toBe(true);
  });

  it('★知らない値なら既定へ落ちる（★「画面と同じ側」へ・R-31）', () => {
    expect(trackGlossFromSearch('?gloss=banana')).toBe(TRACK_GLOSS_DEFAULT);
  });
});

/** ★塗った色と濃さを並べて記録する ctx（`infield-reversed.test.ts` と同じ形） */
function recordingCtx(): { readonly ctx: unknown; readonly fills: string[]; readonly rects: string[] } {
  const fills: string[] = [];
  const rects: string[] = [];
  const state = { fillStyle: '', globalAlpha: 1 };
  const target: Record<string, unknown> = {
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    drawImage: () => undefined,
    beginPath: () => undefined, ellipse: () => undefined,
    /** ★台形（走路の帯）はこちら。★照りはここに出ます */
    fill: () => { fills.push(`${state.fillStyle}@${state.globalAlpha.toFixed(4)}`); },
    /** ★全面の矩形（空・霞・板の層）はこちら */
    fillRect: () => { rects.push(`${state.fillStyle}@${state.globalAlpha.toFixed(4)}`); },
    moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
    stroke: () => undefined, measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (o, k) => {
      if (k === 'fillStyle') return state.fillStyle;
      if (k === 'globalAlpha') return state.globalAlpha;
      return k in o ? o[k as string] : (): undefined => undefined;
    },
    set: (o, k, v) => {
      if (k === 'fillStyle') state.fillStyle = String(v);
      else if (k === 'globalAlpha') state.globalAlpha = Number(v);
      else o[k as string] = v;
      return true;
    },
  });
  return { ctx, fills, rects };
}

/**
 * ★張りぼての素材。★`drawImage` は記録用 ctx で何もしないので、寸法だけ合っていれば足ります。
 * ⚠️ ★ここで見たいのは**照りの層が乗るかどうか**であって、素材の中身ではありません。
 */
const ASSETS: TexturedWorldAssets<unknown> = {
  turf: { image: {}, width: 64, height: 64, pxPerM: 8 },
  dirt: { image: {}, width: 64, height: 64, pxPerM: 8 },
  panorama: { image: {}, width: 1024, height: 256, horizonY: 128 },
};

describe('⚠️ ★入れると実際に画が変わる（正面＝テクスチャ世界）', () => {
  const paint = (
    condition: 'good' | 'soft', gloss: boolean,
  ): { readonly fills: string[]; readonly rects: string[] } => {
    const r = recordingCtx();
    drawTexturedWorld(r.ctx as never, course, scene.camera, ASSETS, {
      focusS: scene.focusS, focusW: scene.focusW, surface: 'dirt', condition,
      ...(gloss ? {} : { gloss: false }),
    });
    return { fills: r.fills, rects: r.rects };
  };

  it('★重: 照りを入れると台形の塗りが増える（＝空の色が走路に乗る）', () => {
    const on = paint('soft', true);
    const off = paint('soft', false);
    expect(off.fills.length, '★1 つも塗られていない（検査が空回りしている）').toBeGreaterThan(0);
    expect(
      on.fills.join('|'),
      '★照りを入れても切っても同じ塗り列＝照りが効いていない',
    ).not.toBe(off.fills.join('|'));
    /** ★空の色の台形は、照りを入れたときにだけ出ます（霞は `fillRect` なので混ざりません） */
    const skyFills = (v: readonly string[]): number => v.filter((s) => s.startsWith(HORIZON_SKY_COLOR)).length;
    expect(skyFills(on.fills)).toBeGreaterThan(0);
    expect(skyFills(off.fills)).toBe(0);
  });

  it('⚠️ ★**良は 1 ビットも動かない**（照りの入切で完全に同じ）', () => {
    const on = paint('good', true);
    const off = paint('good', false);
    expect(on.fills.join('|')).toBe(off.fills.join('|'));
    expect(on.rects.join('|')).toBe(off.rects.join('|'));
  });
});

describe('⚠️ ★入れると実際に画が変わる（横＝焼き込みの板）', () => {
  const plate: ParallaxPlate<unknown> = {
    plateWidth: 1920, plateHeight: 1080,
    layers: [
      { image: {}, width: 512, height: 200, plateY0: 600, plateY1: 800, depthOffsetM: 0, isGround: true },
      { image: {}, width: 512, height: 200, plateY0: 300, plateY1: 500, depthOffsetM: 60, isGround: false },
    ],
  };
  const opts = {
    viewport: VIEWPORT, zoom: 1.12, verticalAnchor: 0.48,
    scrollM: 700, packPxPerM: 40, packDepthM: 24, direction: 1 as const,
  };

  it('★重: 板の地面にも照りが乗る（正面と横で揃う）', () => {
    const withGloss = recordingCtx();
    drawParallaxPlate(withGloss.ctx as never, plate, {
      ...opts, wetAlpha: 0.42, wetColor: '#221a12',
      glossAt: (d: number) => trackGlossAlpha('soft', d, EYE_Z), glossColor: HORIZON_SKY_COLOR,
    });
    const without = recordingCtx();
    drawParallaxPlate(without.ctx as never, plate, { ...opts, wetAlpha: 0.42, wetColor: '#221a12' });
    expect(without.rects.length, '★1 つも塗られていない（検査が空回りしている）').toBeGreaterThan(0);
    expect(
      withGloss.rects.join('|'),
      '★照りを渡しても渡さなくても同じ塗り列＝横の板に照りが乗っていない',
    ).not.toBe(without.rects.join('|'));
    expect(withGloss.rects.filter((s) => s.startsWith(HORIZON_SKY_COLOR)).length).toBe(1);
  });

  it('⚠️ ★地面でない層には乗らない（空・スタンド・ラチは濡れない）', () => {
    const r = recordingCtx();
    drawParallaxPlate(r.ctx as never, plate, {
      ...opts, wetAlpha: 0.42, wetColor: '#221a12',
      glossAt: () => 0.9, glossColor: HORIZON_SKY_COLOR,
    });
    /** ★`isGround` は 1 層だけなので、★照りの矩形も 1 枚だけです */
    expect(r.rects.filter((s) => s.startsWith(HORIZON_SKY_COLOR)).length).toBe(1);
  });

  it('★良では板も 1 ビット動かない', () => {
    const on = recordingCtx();
    drawParallaxPlate(on.ctx as never, plate, {
      ...opts, wetAlpha: trackWetnessAlpha('good'),
      glossAt: (d: number) => trackGlossAlpha('good', d, EYE_Z), glossColor: HORIZON_SKY_COLOR,
    });
    const off = recordingCtx();
    drawParallaxPlate(off.ctx as never, plate, { ...opts, wetAlpha: trackWetnessAlpha('good') });
    expect(on.rects.join('|')).toBe(off.rects.join('|'));
  });
});
