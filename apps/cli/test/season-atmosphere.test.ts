/**
 * ★**季節と天気の空気**（★色味・舞うもの・雨・砂の色・2026-09-15・計画書 R-6 / R-7 / C-2 / V-12）
 *
 * 【★見ている壊れ方】
 *   ① ★季節が月から決まらない／★50 鞍のどこかで投げる
 *   ② ★重ねる色が濃すぎる（★勝負服や脚さばきが読めなくなる・レビュー側の回答 §4-3）
 *   ③ ★舞うもの・雨の口が効いていない／★決定論でない … 対照つき
 *   ④ ★空気が ★**馬より後**に描かれる（★勝負服に掛かる）
 *   ⑤ ★板の層への色が効いていない（★地面と景色で分かれていない） … 対照つき
 *   ⑥ ★画面が同じ表から引いていない（R-30）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADED_RACES } from '@star/scheduler';
import {
  SEASON_LOOKS, ATMOSPHERE_TINT_MAX, seasonOf, particlesFor, seasonParticlesFor, rainDropsOf, drawSeasonParticles, drawRain,
  VENUE_LOOKS, drawParallaxPlate,
} from '@star/render';

function recorder() {
  const ops: string[] = [];
  const r = (v: number): string => v.toFixed(2);
  const state = { fillStyle: '' as unknown, strokeStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect:${String(state.fillStyle)}@${state.globalAlpha.toFixed(3)}:${r(x)},${r(y)},${r(w)},${r(h)}`),
    fill: () => ops.push(`fill:${String(state.fillStyle)}`),
    stroke: () => ops.push(`stroke:${String(state.strokeStyle)}`),
    ellipse: (x: number, y: number, rx: number) => ops.push(`E${r(x)},${r(y)},${r(rx)}`),
    moveTo: (x: number, y: number) => ops.push(`M${r(x)},${r(y)}`),
    lineTo: (x: number, y: number) => ops.push(`L${r(x)},${r(y)}`),
    beginPath: () => undefined, closePath: () => undefined,
    drawImage: () => ops.push('drawImage'),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'fillStyle' ? state.fillStyle : key === 'strokeStyle' ? state.strokeStyle
      : key === 'globalAlpha' ? state.globalAlpha : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'fillStyle') state.fillStyle = value;
      else if (key === 'strokeStyle') state.strokeStyle = value;
      else if (key === 'globalAlpha') state.globalAlpha = value as number;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, ops };
}

const MOTION = { viewport: { width: 1280, height: 720 }, focusS: 800, direction: 1 as const, windDir: 1 as const, windStrength: 0.5 };

describe('★季節と天気の空気', () => {
  it('★① 月 → 季節（★12〜2 冬・3〜4 春・5〜6 初夏・7〜8 夏・9〜11 秋）／50 鞍すべてで決まる', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(seasonOf)).toEqual([
      'winter', 'winter', 'spring', 'spring', 'early-summer', 'early-summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
    ]);
    expect(() => seasonOf(0)).toThrow();
    expect(() => seasonOf(13)).toThrow();
    const seen = new Set(GRADED_RACES.map((r) => seasonOf(r.month)));
    expect(seen.size, '★50 鞍に 5 季節が揃っている').toBe(5);
  });

  it('★② 重ねる色は上限以下（★季節）／砂の色は上限の 2 倍まで', () => {
    expect(ATMOSPHERE_TINT_MAX).toBeLessThanOrEqual(0.12);
    for (const look of Object.values(SEASON_LOOKS)) {
      expect(look.ground.alpha, look.label).toBeLessThanOrEqual(ATMOSPHERE_TINT_MAX);
      expect(look.scenery.alpha, look.label).toBeLessThanOrEqual(ATMOSPHERE_TINT_MAX);
    }
    for (const v of VENUE_LOOKS) {
      if (v.dirtTint !== undefined) expect(v.dirtTint.alpha, v.venueId).toBeLessThanOrEqual(ATMOSPHERE_TINT_MAX * 2);
    }
    expect(VENUE_LOOKS.filter((v) => v.dirtTint !== undefined).map((v) => v.venueId), '★砂の色を持つのは白砂だけ').toEqual(['shirasuna']);
  });

  /**
   * ★オーナー評（2026-09-15）「★冬の雪はいいですが　春の桜と　雨の落ち葉みたいな？のもおかしいです。　雨は雨だけにしてください」。
   */
  it('★③ 舞うものは冬（1・2 月）の雪だけ／雨の日（重・不良）は雪も出さない', () => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(months.map((m) => particlesFor(m)?.kind ?? null))
      .toEqual(['snow', 'snow', null, null, null, null, null, null, null, null, null, null]);
    expect(months.map((m) => seasonParticlesFor(m, 'good')?.kind ?? null))
      .toEqual(['snow', 'snow', null, null, null, null, null, null, null, null, null, null]);
    expect(seasonParticlesFor(1, 'yielding')?.kind).toBe('snow');
    for (const m of months) {
      expect(seasonParticlesFor(m, 'soft'), `★${m} 月・重`).toBeUndefined();
      expect(seasonParticlesFor(m, 'bad'), `★${m} 月・不良`).toBeUndefined();
    }
  });

  it('★③ 舞うものは表示秒の関数で動き、同じ入力なら同じ画（★決定論）', () => {
    const p = particlesFor(1)!;
    const draw = (timeSec: number): string[] => { const { ctx, ops } = recorder(); drawSeasonParticles(ctx as never, p, { ...MOTION, timeSec }); return ops; };
    const a = draw(1.25);
    expect(a.filter((o) => o.startsWith('fill:')).length).toBe(p.count);
    expect(draw(1.25)).toEqual(a);
    expect(draw(1.75)).not.toEqual(a);
  });

  it('★③ 雨は重・不良だけ（★良・稍重は 0 粒で何も描かない）', () => {
    expect(rainDropsOf('good')).toBe(0);
    expect(rainDropsOf('yielding')).toBe(0);
    expect(rainDropsOf('soft')).toBeGreaterThan(0);
    expect(rainDropsOf('bad')).toBeGreaterThan(rainDropsOf('soft'));
    const draw = (drops: number): string[] => { const { ctx, ops } = recorder(); drawRain(ctx as never, drops, { ...MOTION, timeSec: 2 }); return ops; };
    expect(draw(0)).toEqual([]);
    expect(draw(rainDropsOf('bad')).some((o) => o.startsWith('stroke:'))).toBe(true);
  });

  /** ★⑤ 板: 地面の層には地面の色、それ以外の層には景色の色だけが重なる（★対照: 渡さなければ重ならない） */
  it('★⑤ 板の層ごとに、地面と景色で別の色が重なる', () => {
    const plate = {
      plateWidth: 1000, plateHeight: 600,
      layers: [
        { image: 'sky', width: 1000, height: 100, plateY0: 0, plateY1: 300, depthOffsetM: 100 },
        { image: 'turf', width: 1000, height: 100, plateY0: 300, plateY1: 600, depthOffsetM: 0, isGround: true },
      ],
    };
    const draw = (tints: boolean): string[] => {
      const { ctx, ops } = recorder();
      drawParallaxPlate(ctx as never, plate as never, {
        viewport: { width: 1280, height: 720 }, zoom: 1, verticalAnchor: 1, scrollM: 0, packPxPerM: 10, packDepthM: 30, direction: 1,
        ...(tints ? { groundTints: [{ color: '#aa0000', alpha: 0.1 }], sceneryTint: { color: '#0000aa', alpha: 0.08 } } : {}),
      });
      return ops;
    };
    const base = draw(false);
    expect(base.some((o) => o.startsWith('fillRect:'))).toBe(false);
    const tinted = draw(true);
    const ground = tinted.filter((o) => o.startsWith('fillRect:#aa0000'));
    const scenery = tinted.filter((o) => o.startsWith('fillRect:#0000aa'));
    expect(ground.length).toBe(1);
    expect(scenery.length).toBe(1);
    /** ★地面の色は下の層（y が大きい）、景色の色は上の層 */
    const yOf = (o: string): number => Number(o.split(':')[2]!.split(',')[1]);
    expect(yOf(ground[0]!)).toBeGreaterThan(yOf(scenery[0]!));
  });

  /** ★④⑥ 画面と場面: 同じ表から組み、★馬より先に描く */
  it('★④⑥ 画面は季節・雨・砂の色を同じ表から組み、場面は空気を馬より先に描く', () => {
    const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    for (const needle of [
      'SEASON_LOOKS[seasonOf(RACE_SETUP.race.month)].ground',
      'sceneryTint: SEASON_LOOKS[seasonOf(RACE_SETUP.race.month)].scenery,',
      'particles: seasonParticlesFor(RACE_SETUP.race.month, trackCondition),',
      'rainDrops: rainDropsOf(trackCondition),',
      "surface === 'dirt' && VENUE_LOOK.dirtTint !== undefined ? [VENUE_LOOK.dirtTint] : []",
    ]) expect(page, `★画面に ${needle} が無い`).toContain(needle);
    const scene = readFileSync(path.resolve(__dirname, '../../../packages/render/src/broadcast-v2-scene.ts'), 'utf8');
    const atmo = scene.indexOf('drawSeasonParticles(ctx');
    const library = scene.indexOf('const library = opts.libraries[scene.shot.horseAsset];');
    expect(atmo, '★舞うものを描いていない').toBeGreaterThan(0);
    expect(library).toBeGreaterThan(0);
    expect(atmo, '★空気は馬（library を引く所）より先に描くこと').toBeLessThan(library);
  });
});
