/**
 * ★**水たまり**（2026-08-30・残件 A-7・オーナー指示「水たまりなどに進めて」）
 *
 * 【★なぜ局所にしたか — ★測って分かったこと】
 *   ★一様な層（暗さ・照り）では ★**「濡れている」になりませんでした。**
 *   ★照りは正面のカットで **+1.3%**（目で分からない）。★強くすると**濡れの暗さを打ち消します**
 *   （0.55 で 良→重 が −23.1% → −6.6%）。★**暗さと照りは取り合い**です。
 *   → ★水たまりは ★**平均の明るさを動かさずに、局所の対比**を作ります。
 *
 * 【★この検査が守るもの】
 *   ① ★**良・稍重には 1 つも出ない**（★良の絵は 1 ビットも動かない）
 *   ② ★**決定論**（憲法 4）— ★同じ格子は何度呼んでも同じ。★乱数を呼ばない
 *   ③ ★走路からはみ出さない
 *   ④ ★既定で入っていて `?puddles=0` で戻せる（D-085）
 *   ⑤ ⚠️ ★**入れると実際に画が変わる**（R-16）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  puddleDensity, puddleAt, drawPuddles,
  PUDDLE_CELL_S_M, PUDDLE_CELL_W_M, PUDDLE_GLOSS_GAIN,
} from '../src/puddles.js';
import { PUDDLES_DEFAULT, puddlesFromSearch } from '../src/broadcast-v2.js';
import { skyReflectance, HORIZON_SKY_COLOR } from '../src/world-textured.js';
import { ovalCourse, posOf } from '../src/course.js';
import { cameraBasis, project } from '../src/perspective.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };
const scene = resolveBroadcastV2Scene(
  course, [{ gate: 1, s: 700, w: 2.2 }], VIEWPORT, false, { forceShotId: 'first-corner-front' },
);
const groundOf = (s: number, w: number): { x: number; y: number; depth: number } => {
  const basis = cameraBasis(scene.camera);
  const p = posOf(course, s, w);
  const q = project(scene.camera, basis, { x: p.x, y: p.y, z: 0 });
  return { x: q.x, y: q.y, depth: q.depth };
};

describe('★水たまりの多さ', () => {
  it('⚠️ ★**良・稍重には 1 つも出ない**', () => {
    expect(puddleDensity('good')).toBe(0);
    /**
     * ★水たまりは「地面が吸えなくなった水」です。★稍重は湿っているだけで溜まりません。
     * ⚠️ ★ここを 0 でない値にすると、★**稍重が不良のように見えます**（状態の差が壊れる）。
     */
    expect(puddleDensity('yielding')).toBe(0);
  });

  it('★省略・知らない値は 0 へ落ちる（★何もしない側・R-27）', () => {
    expect(puddleDensity(undefined)).toBe(0);
    expect(puddleDensity('banana' as never)).toBe(0);
  });

  it('★重より不良のほうが多い（単調）', () => {
    expect(puddleDensity('soft')).toBeGreaterThan(0);
    expect(puddleDensity('bad')).toBeGreaterThan(puddleDensity('soft'));
  });

  it('★多すぎない（★走路が水面にならないこと）', () => {
    /**
     * ⚠️ ★この線の**意図**は「★**走路が水浸しの面にならない**」ことです。
     *    ★`trackWetnessAlpha` の `bad < 0.7`（暗すぎない）と対になります（R-2）。
     */
    expect(puddleDensity('bad'), '★水たまりが多すぎて走路が水面になる').toBeLessThan(0.6);
  });
});

describe('⚠️ ★決定論（憲法 4）', () => {
  it('★同じ格子は何度呼んでも同じ（★コマ落ちでも動かない）', () => {
    for (const [cs, cw] of [[3, 0], [17, 2], [-8, 1], [104, 3]] as const) {
      const a = puddleAt(cs, cw, 0.42, course.widthM);
      const b = puddleAt(cs, cw, 0.42, course.widthM);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('⚠️ ★**乱数も時刻も呼んでいない**（★出どころを機械で見る）', () => {
    const src = readFileSync(join(process.cwd(), 'packages', 'render', 'src', 'puddles.ts'), 'utf8');
    /** ★註釈に書いてある語で落ちないよう、コードだけを見ます */
    const code = src.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('Date.now');
    /** ★対照: 見るべきものは見えている（★除きすぎて空を見ていないこと・R-21） */
    expect(code, '★コードが空＝註釈を除きすぎている').toContain('puddleDensity');
  });

  it('★格子が違えば違う場所に出る（★全部同じ形に潰れていない）', () => {
    const seen = new Set<string>();
    for (let cs = 0; cs < 60; cs += 1) {
      for (let cw = 0; cw < 4; cw += 1) {
        const p = puddleAt(cs, cw, 0.42, course.widthM);
        if (p !== null) seen.add(`${p.rs.toFixed(3)}/${p.rw.toFixed(3)}`);
      }
    }
    expect(seen.size, '★大きさが 1 種類しかない＝ばらけていない').toBeGreaterThan(10);
  });
});

describe('★水たまりの置き場所', () => {
  it('★走路からはみ出さない', () => {
    for (let cs = -40; cs < 140; cs += 1) {
      for (let cw = 0; cw < 4; cw += 1) {
        const p = puddleAt(cs, cw, 0.42, course.widthM);
        if (p === null) continue;
        expect(p.w).toBeGreaterThan(0);
        expect(p.w).toBeLessThan(course.widthM);
        /** ★格子の中に収まっている（★隣へはみ出して重ならない） */
        expect(p.s).toBeGreaterThanOrEqual(cs * PUDDLE_CELL_S_M);
        expect(p.s).toBeLessThanOrEqual((cs + 1) * PUDDLE_CELL_S_M);
      }
    }
  });

  it('★内ラチ寄りに多い（★走路は内側が低い）', () => {
    let inner = 0, outer = 0;
    for (let cs = 0; cs < 400; cs += 1) {
      if (puddleAt(cs, 0, 0.42, course.widthM) !== null) inner += 1;
      if (puddleAt(cs, 3, 0.42, course.widthM) !== null) outer += 1;
    }
    expect(inner, '★内側に 1 つも出ていない').toBeGreaterThan(0);
    expect(inner, '★内ラチ寄りに溜まっていない').toBeGreaterThan(outer);
  });

  it('★格子の大きさが走路の幅に対して意味を持つ', () => {
    /** ★幅 20m に対して 5m の格子＝4 列。★1 列だと「内側に多い」が言えません */
    expect(Math.ceil(course.widthM / PUDDLE_CELL_W_M)).toBeGreaterThanOrEqual(3);
    expect(PUDDLE_CELL_S_M).toBeGreaterThan(0);
  });
});

describe('★既定と戻し口（D-085）', () => {
  it('★既定は入っている', () => {
    expect(PUDDLES_DEFAULT).toBe(true);
    expect(puddlesFromSearch('')).toBe(true);
    expect(puddlesFromSearch('?seed=42')).toBe(true);
  });

  it('★`?puddles=0` で戻せる', () => {
    expect(puddlesFromSearch('?puddles=0')).toBe(false);
    expect(puddlesFromSearch('?puddles=off')).toBe(false);
    expect(puddlesFromSearch('?puddles=1')).toBe(true);
  });

  it('★知らない値なら既定へ落ちる（★「画面と同じ側」へ・R-31）', () => {
    expect(puddlesFromSearch('?puddles=banana')).toBe(PUDDLES_DEFAULT);
  });
});

/** ★塗った色を並べて記録する ctx（`infield-reversed.test.ts` と同じ形） */
function recordingCtx(): { readonly ctx: unknown; readonly fills: string[] } {
  const fills: string[] = [];
  const state = { fillStyle: '', globalAlpha: 1 };
  const target: Record<string, unknown> = {
    save: () => undefined, restore: () => undefined, transform: () => undefined,
    drawImage: () => undefined, beginPath: () => undefined, ellipse: () => undefined,
    fill: () => { fills.push(`${state.fillStyle}@${state.globalAlpha.toFixed(3)}`); },
    fillRect: () => undefined,
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
  return { ctx, fills };
}

describe('⚠️ ★入れると実際に画が変わる', () => {
  const paint = (condition: 'good' | 'yielding' | 'soft' | 'bad'): readonly string[] => {
    const r = recordingCtx();
    drawPuddles(r.ctx as never, course, groundOf, VIEWPORT, {
      focusS: scene.focusS, surface: 'dirt', condition, eyeHeightM: scene.camera.eye.z,
    });
    return r.fills;
  };

  it('★重・不良では実際に塗られる（★空の色が地面に乗る）', () => {
    const soft = paint('soft');
    expect(soft.length, '★1 つも塗られていない＝水たまりが画面に出ていない').toBeGreaterThan(0);
    expect(soft.filter((s) => s.startsWith(HORIZON_SKY_COLOR)).length).toBeGreaterThan(0);
    /** ★不良のほうが多い（★密度が実際に画に効いている） */
    expect(paint('bad').length).toBeGreaterThan(soft.length);
  });

  it('⚠️ ★**良・稍重では 1 つも塗らない**（★その画は 1 ビットも動かない）', () => {
    expect(paint('good')).toEqual([]);
    expect(paint('yielding')).toEqual([]);
  });

  it('⚠️ ★**縁・水面・芯の 3 枚で 1 つ**（★平らな 1 枚だと灰色の靄に見えます）', () => {
    /**
     * 【★この検査が生まれた実害】★最初は「縁 + 水面」の 2 枚でした。
     * ★実画面で見ると ★**「霧が地面に溜まっている」ように見えました。**
     * ★水に見えるのは ★**濃い縁 → 明るい水面 → きらりと光る芯**という**落差**があるからです。
     */
    const soft = paint('soft');
    const sky = soft.filter((s) => s.startsWith(HORIZON_SKY_COLOR)).length;
    const rim = soft.length - sky;
    expect(rim, '★縁が描かれていない＝白い染みに見える').toBeGreaterThan(0);
    expect(sky, '★水面と芯の 2 枚になっていない＝落差が無く、灰色の靄に見える').toBe(rim * 2);
  });

  it('★芯は水面より明るい（★落差があること）', () => {
    /** ★同じ水たまりの 3 枚を、★濃さの順で確かめます */
    const alphas = paint('bad')
      .filter((s) => s.startsWith(HORIZON_SKY_COLOR))
      .map((s) => Number(s.split('@')[1]));
    expect(alphas.length).toBeGreaterThan(1);
    /** ★芯（奇数番目）は水面（偶数番目）より濃い */
    let stronger = 0;
    for (let i = 0; i + 1 < alphas.length; i += 2) {
      if ((alphas[i + 1] ?? 0) > (alphas[i] ?? 0)) stronger += 1;
    }
    expect(stronger, '★芯が水面より明るくない＝落差が無い').toBeGreaterThan(0);
  });
});

describe('★明るさの出どころ', () => {
  it('⚠️ ★照りと**同じ 1 か所**（`skyReflectance`）から引いている', () => {
    /**
     * ★同じ「水が空を映す量」を 2 か所で持つと、
     * ★**薄い膜と水たまりで光り方が食い違います**（D-052）。
     */
    const src = readFileSync(join(process.cwd(), 'packages', 'render', 'src', 'puddles.ts'), 'utf8');
    const code = src.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('skyReflectance');
    /** ★自前でフレネルを組み直していない */
    expect(code, '★水たまりの側でフレネルを作り直している').not.toContain('0.98');
  });

  it('★奥ほど明るい（★照りと同じ向き）', () => {
    const near = skyReflectance(15, scene.camera.eye.z) * PUDDLE_GLOSS_GAIN;
    const far = skyReflectance(200, scene.camera.eye.z) * PUDDLE_GLOSS_GAIN;
    expect(far).toBeGreaterThan(near);
    /** ★白飛びしない */
    expect(far).toBeLessThan(0.7);
  });
});
