/**
 * ★**場の景色と紋・霧**（★2026-09-15・計画書 V-13 / V-15・第 5 便）
 *
 * 【★見ている壊れ方】
 *   ① ★場の見た目の表に景色の主題が無い／★2 つの場が同じ主題／★スターパークが既定でない
 *   ② ★遠景が ★地平線より下（★スタンド・木・芝）にはみ出す／★決定論でない／★既定が何か描く
 *   ③ ★紋が主題ごとに違わない／★既定が何か描く
 *   ④ ★タイトルカードに渡しても効かない／★既定（空の色・`default`）で ★命令列が変わる（★対照）
 *   ⑤ ★霧が上限を超える／★帯の外に描く／★場面が馬より後に描く
 *   ⑥ ★画面が同じ表から組んでいない（★R-30）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  VENUE_LOOKS, VENUE_SCENERY_KINDS, drawVenueScenery, drawVenueCrest, drawVenueFog, titleSceneryBand,
  VENUE_FOG_ALPHA, VENUE_FOG_ALPHA_MAX, drawRaceTitleCard,
  type VenueSceneryKind,
} from '@star/render';

function recorder() {
  const ops: string[] = [];
  const r = (v: number): string => v.toFixed(2);
  const state = { fillStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`R:${String(state.fillStyle)}@${state.globalAlpha.toFixed(3)}:${r(x)},${r(y)},${r(w)},${r(h)}`),
    fill: () => ops.push(`fill:${String(state.fillStyle)}@${state.globalAlpha.toFixed(3)}`),
    moveTo: (x: number, y: number) => ops.push(`M${r(x)},${r(y)}`),
    lineTo: (x: number, y: number) => ops.push(`L${r(x)},${r(y)}`),
    ellipse: (x: number, y: number, rx: number, ry: number) => ops.push(`E${r(x)},${r(y)},${r(rx)},${r(ry)}`),
    fillText: (t: string) => ops.push(`T:${t}`),
    measureText: () => ({ width: 10 }),
    drawImage: () => ops.push('img'),
    beginPath: () => undefined, closePath: () => undefined, stroke: () => undefined,
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'fillStyle' ? state.fillStyle : key === 'globalAlpha' ? state.globalAlpha
      : key === 'createLinearGradient' ? undefined
      : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'fillStyle') state.fillStyle = value;
      else if (key === 'globalAlpha') state.globalAlpha = value as number;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, ops };
}

const VP = { width: 1280, height: 720 };
const BAND = titleSceneryBand(VP);
const sceneryOps = (kind: VenueSceneryKind, timeSec = 2, night = false): string[] => {
  const { ctx, ops } = recorder();
  drawVenueScenery(ctx as never, kind, BAND, { timeSec, night });
  return ops;
};

/** ★命令列から y 座標を抜く（★矩形は下端、★線と楕円は中心） */
function maxYOf(ops: readonly string[]): number {
  let max = -Infinity;
  for (const o of ops) {
    if (o.startsWith('R:')) {
      /** ★`R:色@濃さ:x,y,w,h` */
      const [, y, , h] = o.slice(o.lastIndexOf(':') + 1).split(',').map(Number) as [number, number, number, number];
      max = Math.max(max, y + h);
    }
    else if (o.startsWith('M') || o.startsWith('L')) max = Math.max(max, Number(o.slice(1).split(',')[1]));
  }
  return max;
}

describe('★場の景色と紋', () => {
  it('★① 10 場すべてに主題があり、スターパークは既定・他の 9 場はすべて違う', () => {
    expect(VENUE_LOOKS.length).toBe(10);
    for (const v of VENUE_LOOKS) expect(VENUE_SCENERY_KINDS, v.venueId).toContain(v.scenery);
    expect(VENUE_LOOKS.find((v) => v.venueId === 'star-park')!.scenery).toBe('default');
    const others = VENUE_LOOKS.filter((v) => v.venueId !== 'star-park').map((v) => v.scenery);
    expect(new Set(others).size).toBe(9);
    expect(others).not.toContain('default');
    expect([...others].sort()).toEqual(VENUE_SCENERY_KINDS.filter((k) => k !== 'default').slice().sort());
  });

  it('★② 遠景は地平線より下に描かない・決定論・既定は何も描かない', () => {
    expect(sceneryOps('default')).toEqual([]);
    for (const kind of VENUE_SCENERY_KINDS.filter((k) => k !== 'default')) {
      const ops = sceneryOps(kind);
      expect(ops.length, kind).toBeGreaterThan(0);
      expect(maxYOf(ops), `${kind} が地平線 ${BAND.horizonY} より下に描いている`).toBeLessThanOrEqual(BAND.horizonY + 1.01);
      expect(sceneryOps(kind), kind).toEqual(ops);
    }
    /** ★星は夜だけ（★対照: 昼は描かない） */
    expect(sceneryOps('stars-river', 2, true).length).toBeGreaterThan(sceneryOps('stars-river', 2, false).length);
  });

  it('★③ 紋は主題ごとに違い、既定は何も描かない', () => {
    const crest = (kind: VenueSceneryKind): string[] => {
      const { ctx, ops } = recorder();
      drawVenueCrest(ctx as never, kind, 100, 100, 80, { ground: '#111111', mark: '#eeeeee' });
      return ops;
    };
    expect(crest('default')).toEqual([]);
    const seen = new Set<string>();
    for (const kind of VENUE_SCENERY_KINDS.filter((k) => k !== 'default')) {
      const ops = crest(kind);
      expect(ops.length, kind).toBeGreaterThan(2);
      seen.add(ops.join('|'));
    }
    expect(seen.size).toBe(9);
  });

  it('★④ タイトルカード: 既定（空の色・default・紋なし）は省いたときと同じ命令列／主題を渡すと増える', () => {
    const meta = { venue: '場', raceName: '賞', raceNo: '11R', distanceMeter: 1600, surfaceLabel: '芝', weatherLabel: '晴', conditionLabel: '良', turnLabel: '左' };
    const FONT = (px: number): string => `${px}px sans-serif`;
    const draw = (scenery: Parameters<typeof drawRaceTitleCard>[8]): string[] => {
      const { ctx, ops } = recorder();
      drawRaceTitleCard(ctx as never, {} as never, VP, FONT as never, meta as never, 2.4, undefined, undefined, scenery);
      return ops;
    };
    const base = draw(undefined);
    expect(draw({ kind: 'default', tints: [] })).toEqual(base);
    expect(draw({ kind: 'snow-peaks', tints: [] }).length).toBeGreaterThan(base.length);
    expect(draw({ kind: 'default', tints: [{ color: '#070d26', alpha: 0.5 }] }).length).toBe(base.length + 1);
    expect(draw({ kind: 'default', tints: [], crest: { ground: '#111', mark: '#eee' } })).toEqual(base);
    expect(draw({ kind: 'sea', tints: [], crest: { ground: '#111', mark: '#eee' } }).length)
      .toBeGreaterThan(draw({ kind: 'sea', tints: [] }).length);
  });

  it('★⑤ 霧は上限以下・帯の中だけ・場面は馬より先に描く', () => {
    expect(VENUE_FOG_ALPHA).toBeLessThanOrEqual(VENUE_FOG_ALPHA_MAX);
    expect(VENUE_FOG_ALPHA_MAX).toBeLessThanOrEqual(0.4);
    const { ctx, ops } = recorder();
    drawVenueFog(ctx as never, { width: 1280, top: 0, bottom: 324 }, { alpha: 0.9, timeSec: 3, focusS: 500, direction: 1 });
    const alphas = ops.filter((o) => o.startsWith('R:') || o.startsWith('fill:')).map((o) => Number(o.split('@')[1]!.split(':')[0]));
    expect(Math.max(...alphas)).toBeLessThanOrEqual(VENUE_FOG_ALPHA_MAX + 1e-9);
    expect(maxYOf(ops)).toBeLessThanOrEqual(324 + 1.01);
    const off = recorder();
    drawVenueFog(off.ctx as never, { width: 1280, top: 0, bottom: 324 }, { alpha: 0, timeSec: 3, focusS: 500, direction: 1 });
    expect(off.ops).toEqual([]);
    const scene = readFileSync(path.resolve(__dirname, '../../../packages/render/src/broadcast-v2-scene.ts'), 'utf8');
    const fog = scene.indexOf('drawVenueFog(ctx');
    const library = scene.indexOf('const library = opts.libraries[scene.shot.horseAsset];');
    expect(fog).toBeGreaterThan(0);
    expect(fog, '★霧は馬より先に描くこと').toBeLessThan(library);
  });

  it('★⑥ 画面は同じ表から組む', () => {
    const page = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    for (const needle of [
      'kind: VENUE_LOOK.scenery,',
      'tints: [SEASON_LOOKS[seasonOf(RACE_SETUP.race.month)].scenery, ...timeOfDayTintsOf(TIME_OF_DAY).scenery],',
      "night: TIME_OF_DAY === 'night',",
      "fogAlpha: VENUE_LOOK.scenery === 'fog' ? VENUE_FOG_ALPHA : 0,",
    ]) expect(page, `★画面に ${needle} が無い`).toContain(needle);
  });
});
