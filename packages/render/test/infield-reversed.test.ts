/**
 * ★**内側の帯を芝にする**（Q-3 の B 案・2026-08-29 から既定）
 *
 * 【★正典 D-085】★**既定を変えるときは戻せる口を同時に置き、戻せること自体を検査で固定する。**
 *
 * 【★この検査が守るもの】
 *   ① ★既定が**芝**であること（★`INFIELD_REVERSED_DEFAULT`）
 *   ② ★`?infield=dirt` で**戻せる**こと
 *   ③ ⚠️ ★**戻すと実際に画が変わる**こと
 *
 * ⚠️ ★③ が要ります。★①② だけを見ると、★**機構が最初から効いていなくても検査は緑**です（R-16）。
 *    ★(b′) の `lane-aligned-focus.test.ts` と同じ形にしてあります。
 */
import { describe, it, expect } from 'vitest';
import {
  INFIELD_REVERSED_DEFAULT, infieldReversedFromSearch,
} from '../src/broadcast-v2.js';
import { drawInfield } from '../src/infield.js';
import { ovalCourse, posOf } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

describe('★内側の帯（Q-3 の B 案）', () => {
  it('★既定は芝（B 案が入っている）', () => {
    expect(INFIELD_REVERSED_DEFAULT).toBe(true);
    expect(infieldReversedFromSearch('')).toBe(true);
    expect(infieldReversedFromSearch('?seed=42')).toBe(true);
  });

  it('★`?infield=dirt` で従来へ戻せる（戻し口）', () => {
    expect(infieldReversedFromSearch('?infield=dirt')).toBe(false);
    expect(infieldReversedFromSearch('?infield=off')).toBe(false);
    /** ★明示的に入れることもできる */
    expect(infieldReversedFromSearch('?infield=turf')).toBe(true);
  });

  it('★知らない値なら既定へ落ちる（★狭い側でなく「画面と同じ側」へ・R-31）', () => {
    expect(infieldReversedFromSearch('?infield=banana')).toBe(INFIELD_REVERSED_DEFAULT);
  });

  it('★戻すと実際に画が変わる（機構が効いている）', () => {
    /**
     * ★塗られた色を並べて比べます。★内側の帯の色が変われば列が変わります。
     */
    const paint = (reversed: boolean): string[] => {
      const fills: string[] = [];
      const state = { fillStyle: '' };
      const target: Record<string, unknown> = {
        save: () => undefined, restore: () => undefined, transform: () => undefined,
        drawImage: () => undefined,
        beginPath: () => undefined, ellipse: () => undefined,
        fill: () => { fills.push(String(state.fillStyle)); },
        fillRect: () => { fills.push(String(state.fillStyle)); },
        moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
        stroke: () => undefined, measureText: () => ({ width: 10 }),
      };
      const ctx = new Proxy(target, {
        get: (o, k) => {
          if (k === 'fillStyle') return state.fillStyle;
          if (k === 'globalAlpha') return 1;
          return k in o ? o[k as string] : (): undefined => undefined;
        },
        set: (o, k, v) => {
          if (k === 'fillStyle') state.fillStyle = String(v);
          else o[k as string] = v;
          return true;
        },
      });
      /**
       * ★**帯を描く本体**（`drawInfield`）を直接呼びます。
       *   ⚠️ ★`drawTexturedWorld` は素材一式（空・パノラマ・タイル）を要求するので、
       *      ★張りぼてを組むと**世界の作り方のほうを検査してしまいます**。
       *   ★カメラは `resolveBroadcastV2Scene` に決めさせます（手で組まない・R-30）。
       */
      const scene = resolveBroadcastV2Scene(
        course, [{ gate: 1, s: 700, w: 2.2 }], VIEWPORT, false, { forceShotId: 'fourth-corner-wide' },
      );
      const basis = cameraBasis(scene.camera);
      const groundOf = (sM: number, wM: number): { x: number; y: number; depth: number } => {
        const pt = posOf(course, sM, wM);
        const q = project(scene.camera, basis, { x: pt.x, y: pt.y, z: 0 });
        return { x: q.x, y: q.y, depth: q.depth };
      };
      drawInfield(ctx as never, course, groundOf, VIEWPORT, {
        focusS: scene.focusS,
        ...(reversed ? { reversed: true } : {}),
      });
      return fills;
    };
    const asTurf = paint(true);
    const asDirt = paint(false);
    expect(asTurf.length, '★1 つも塗られていない（検査が空回りしている）').toBeGreaterThan(0);
    expect(
      asTurf.join('|'),
      '★反転してもしなくても同じ色列＝内側の帯の反転が効いていない',
    ).not.toBe(asDirt.join('|'));
  });
});
