/**
 * ★**自馬の印は、画面の外にいるときも出る**（★2026-09-12・★オーナー指摘②）
 *
 * 【★経緯】★オーナー評「★自分馬がレース中に ★**常にわかるように**してください」。
 *
 *   ★以前は ★**画面の外なら黙って描くのをやめて**いました。★端に張り付くと
 *   ★「そこに馬がいる」と誤読される、という理由です（★心配自体は正しい）。
 *   ⚠️ ★ところが ★**代わりに何も出さなかった**ので、★自馬が映っていない間は
 *      ★居場所がまったく分かりませんでした。
 *
 *   ★実測（seed 42・カットは画面の既定）:
 *     ★自馬 3 番（先頭）… 100%    ★自馬 1 番 … ★**18.4%**（★11.2〜36.3 秒＝25.1 秒 消えたまま）
 *     ★自馬 11 番 … 40.1%
 *   → ★**後ろを走る人ほど分からない**形でした。
 *
 * 【★どう直したか】★画面の外では ★**縁へ寄せ、外向きの矢**を付けます。
 *   ★画面の中の雫型とは ★**形が違う**ので、「そこに馬がいる」とは読めません。
 *
 * 【★何を留めるか】⚠️ ★「出る／出ない」は ★**実際に描く命令**で見ます
 *   （★定数や分岐を読むだけでは、★呼ばれていないことを見逃します・★R-16 の家族）。
 */
import { describe, it, expect } from 'vitest';
import { drawOwnHorseMarker } from '../src/reference-hud.js';

const VP = { width: 1280, height: 720 };
const font = (px: number, bold?: boolean): string => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;

interface Drawn {
  readonly points: { x: number; y: number }[];
  readonly ellipses: { x: number; y: number; rx: number }[];
  readonly texts: { text: string; x: number; y: number }[];
  readonly fills: number;
}

function record(head: { x: number; y: number }, gate = 7): Drawn {
  const points: { x: number; y: number }[] = [];
  const ellipses: { x: number; y: number; rx: number }[] = [];
  const texts: { text: string; x: number; y: number }[] = [];
  let fills = 0;
  const target: Record<string, unknown> = {
    globalAlpha: 1,
    moveTo: (x: number, y: number) => { points.push({ x, y }); },
    lineTo: (x: number, y: number) => { points.push({ x, y }); },
    ellipse: (x: number, y: number, rx: number) => { ellipses.push({ x, y, rx }); points.push({ x, y }); },
    fill: () => { fills += 1; },
    fillText: (text: string, x: number, y: number) => { texts.push({ text, x, y }); },
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (o, k) => (k in o ? o[k as string] : () => undefined),
    set: (o, k, v) => { o[k as string] = v; return true; },
  });
  drawOwnHorseMarker(ctx as never, font, head, gate,
    { topLimitY: 40, viewport: VP, timeSec: 20, sinceSec: 5 });
  return { points, ellipses, texts, fills };
}

describe('★自馬の印（画面の中）', () => {
  const d = record({ x: 640, y: 400 });

  it('★雫型が描かれ、馬番が出る', () => {
    expect(d.fills).toBeGreaterThan(0);
    expect(d.texts.map((t) => t.text)).toContain('7');
  });

  it('★印は馬の頭の上に出る', () => {
    const label = d.texts[0]!;
    expect(label.x).toBeCloseTo(640, 0);
    expect(label.y).toBeLessThan(400);
  });
});

describe('★自馬の印（画面の外）— ★オーナー指摘②', () => {
  /** ★右へ大きく外れている（★道中に先頭を追うカメラで、後方の自馬がこうなる） */
  const right = record({ x: 2400, y: 400 });

  it('★**描かれる**（★以前はここで何も描かなかった）', () => {
    expect(right.fills, '★画面の外でも印を出すこと').toBeGreaterThan(0);
    expect(right.texts.map((t) => t.text)).toContain('7');
  });

  it('★印は画面の中に収まる（★縁に寄せる）', () => {
    for (const p of right.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VP.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VP.height);
    }
  });

  it('★外向きの矢が、馬のいる方を指す', () => {
    const circle = right.ellipses[0]!;
    /** ★矢の先は円の中心より外（右）にある */
    expect(Math.max(...right.points.map((p) => p.x))).toBeGreaterThan(circle.x + circle.rx);
  });

  /** ⚠️ ★実況帯（画面下 146px）と隊列バーを隠さないこと */
  it('★実況帯と上端の制限を避ける', () => {
    const low = record({ x: 2400, y: 2000 });
    expect(Math.max(...low.points.map((p) => p.y))).toBeLessThan(VP.height - 146);
    const high = record({ x: 2400, y: -2000 });
    expect(Math.min(...high.points.map((p) => p.y))).toBeGreaterThanOrEqual(40);
  });

  it('★左へ外れたときは左の縁に出る', () => {
    const left = record({ x: -1200, y: 400 });
    const circle = left.ellipses[0]!;
    expect(circle.x).toBeLessThan(VP.width / 2);
    expect(Math.min(...left.points.map((p) => p.x))).toBeLessThan(circle.x);
  });
});
