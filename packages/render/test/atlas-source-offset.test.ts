/**
 * ★**1 枚の絵から、取りたい一部だけを取って描ける**（★アトラス対応・残 R-15）
 *
 * 【★何のために入れたか】
 *   ★レース画面は、★勝負服と接地影を ★**馬番ごとに別の画布へ焼いて**います。
 *   ★そのため ★**勝負服 123MB・影 28MB** の画布を抱えます（★2026-09-02 実測）。
 *   ★これを ★**1 枚に並べた絵**（★アトラス）へまとめるには、
 *   ★描画側が ★**「画像のどこを取るか」**を受け取れなければなりません。
 *
 * 【★R-15、仕掛けを先に「使われないまま」着地させる】
 *   ⚠️ ★**この時点では、番組のどこからも `sourceX` / `sourceY` を渡していません。**
 *      ★焼き出し道具と画面側は次のコミットです。
 *      ★だからこの検査がなければ、★**この仕掛けは一度も動かないまま緑になります**（R-16 の家族）。
 *
 * 【★何を見るか】
 *   1. ★**対照**: ★渡さなければ、★従来どおり `0, 0` から取る（★1 ビットも変わらない）
 *   2. ★**本番**: ★渡せば、★その位置から取る（★影も勝負服も）
 *   3. ★**置く位置は変わらない**。★`offsetXSourcePx`（どこへ置くか）と
 *      ★`sourceX`（どこを取るか）は別物で、★取り違えると馬が横へずれます。
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawPerspectiveHorses } from '../src/perspective-draw.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };
const HORSE = { gate: 1, s: 400, w: 0 };

/** ★影・胴体・勝負服を見分けるための印（★画像の代わりに文字列を入れる） */
type Tag = 'shadow' | 'body' | 'silk';

interface Offsets {
  readonly shadowX?: number; readonly shadowY?: number;
  readonly silkX?: number; readonly silkY?: number;
}

interface Call { readonly tag: Tag; readonly sx: number; readonly sy: number; readonly dx: number; readonly dy: number }

/** ★`drawImage` の引数を拾う。★【印, 取るX, 取るY, 置くX, 置くY】 */
function drawCalls(off: Offsets): Call[] {
  const scene = resolveBroadcastV2Scene(
    course, [HORSE], VIEWPORT, false, { forceShotId: 'fourth-corner-front' },
  );
  const frame = {
    image: 'body' as never,
    source: { x: 0, y: 0, width: 300, height: 200 },
    referenceHeight: 200,
    bodyAnchorSourcePx: { x: 150, y: 120 },
    bodyLiftSourcePx: 0,
    shadow: {
      image: 'shadow' as never, width: 300, height: 200,
      sourceX: off.shadowX, sourceY: off.shadowY,
    },
    overlay: {
      image: 'silk' as never, width: 40, height: 40,
      offsetXSourcePx: 130, offsetYSourcePx: 60,
      sourceX: off.silkX, sourceY: off.silkY,
    },
  };
  const out: Call[] = [];
  const target: Record<string, unknown> = {
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    drawImage: (...a: unknown[]) => {
      if (a.length !== 9) return;
      out.push({
        tag: a[0] as Tag, sx: a[1] as number, sy: a[2] as number,
        dx: a[5] as number, dy: a[6] as number,
      });
    },
    beginPath: () => undefined, fill: () => undefined, ellipse: () => undefined,
    fillRect: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
    closePath: () => undefined, stroke: () => undefined, measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
    set: (obj, key, value) => { obj[key as string] = value; return true; },
  });
  drawPerspectiveHorses(ctx as never, course, scene.camera, [HORSE], {
    sheet: 'sheet' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
    // ★馬番ぶん用意すること（足りないと影の分岐に入らない）
    frameImagesByGate: [[frame], [frame]],
    fieldSize: 12, frameOf: () => 0, frameRoleOf: () => 'frame-1', distanceMeter: 1600,
  });
  return out;
}

describe('★アトラスの切り出し位置', () => {
  it('★対照: 渡さなければ従来どおり 0,0 から取る', () => {
    const calls = drawCalls({});
    const shadow = calls.filter((c) => c.tag === 'shadow');
    const silk = calls.filter((c) => c.tag === 'silk');
    expect(shadow.length).toBeGreaterThan(0);
    expect(silk.length).toBeGreaterThan(0);
    for (const c of [...shadow, ...silk]) {
      expect(c.sx).toBe(0);
      expect(c.sy).toBe(0);
    }
  });

  it('★渡せばその位置から取る（影も勝負服も）', () => {
    const calls = drawCalls({ shadowX: 600, shadowY: 200, silkX: 120, silkY: 40 });
    const shadow = calls.filter((c) => c.tag === 'shadow');
    const silk = calls.filter((c) => c.tag === 'silk');
    expect(shadow.length).toBeGreaterThan(0);
    expect(silk.length).toBeGreaterThan(0);
    for (const c of shadow) { expect(c.sx).toBe(600); expect(c.sy).toBe(200); }
    for (const c of silk) { expect(c.sx).toBe(120); expect(c.sy).toBe(40); }
  });

  it('★取る位置を動かしても、★**置く位置は 1px も動かない**', () => {
    const before = drawCalls({});
    const after = drawCalls({ shadowX: 600, shadowY: 200, silkX: 120, silkY: 40 });
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]!.tag).toBe(before[i]!.tag);
      expect(after[i]!.dx).toBeCloseTo(before[i]!.dx, 10);
      expect(after[i]!.dy).toBeCloseTo(before[i]!.dy, 10);
    }
  });
});
