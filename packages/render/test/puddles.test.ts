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
  puddleDensity, puddleAt, drawPuddles, puddleCoverAt, splashAmountAt, splashDropAt, splashDropCount, SPLASH_MAX_DROPS,
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

describe('★跳ね返り（水たまりを踏んだとき）', () => {
  it('⚠️ ★**良・稍重では 1 粒も跳ねない**', () => {
    for (let s = 0; s < 600; s += 3) {
      expect(puddleCoverAt(s, 4, 'good', course.widthM)).toBe(0);
      expect(puddleCoverAt(s, 4, 'yielding', course.widthM)).toBe(0);
    }
  });

  it('⚠️ ★**絵に無い水で跳ねない**（★描く形と踏む形が同じ格子から出ている）', () => {
    /**
     * 【★なぜこの検査が要るか】
     *   ★同じ量を 2 か所で持つと必ず離れます（R-30）。★離れると
     *   ★**水たまりの無い所で水が跳ねます** — ★見ている人には理由が分かりません。
     *   ★この案件は砂煙と汚れで**同じ形の失敗**を一度しています。
     */
    let covered = 0;
    for (let s = 0; s < 1400; s += 1.7) {
      for (let w = 0.5; w < course.widthM; w += 1.3) {
        const cover = puddleCoverAt(s, w, 'bad', course.widthM);
        if (cover <= 0) continue;
        covered += 1;
        /** ★その点を含む水たまりが、★`puddleAt`（＝描く側）から本当に出てくること */
        const cs0 = Math.floor(s / PUDDLE_CELL_S_M);
        const cw0 = Math.floor(w / PUDDLE_CELL_W_M);
        let found = false;
        for (let ds = -1; ds <= 1 && !found; ds += 1) {
          for (let dw = -1; dw <= 1 && !found; dw += 1) {
            const p = puddleAt(cs0 + ds, cw0 + dw, puddleDensity('bad'), course.widthM);
            if (p === null) continue;
            if (Math.hypot((s - p.s) / p.rs, (w - p.w) / p.rw) < 1) found = true;
          }
        }
        expect(found, `★(${s.toFixed(1)}, ${w.toFixed(1)}) で跳ねるのに、そこに水たまりが描かれていない`).toBe(true);
      }
    }
    expect(covered, '★どこにも水が無い＝検査が空回りしている').toBeGreaterThan(20);
  });

  it('★乾いた所では跳ねない（★走路の全部が水面ではない）', () => {
    let dry = 0;
    for (let s = 0; s < 1400; s += 1.7) {
      if (puddleCoverAt(s, 18, 'bad', course.widthM) === 0) dry += 1;
    }
    expect(dry, '★外ラチ寄りまで水浸し＝多すぎる').toBeGreaterThan(100);
  });

  it('⚠️ ★決定論 — 同じ粒は何度呼んでも同じ', () => {
    for (const [gate, i, life] of [[3, 0, 0.2], [11, 4, 0.75]] as const) {
      const a = splashDropAt(gate, i, life, 1);
      const b = splashDropAt(gate, i, life, 1);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('★踏んだ量で粒が増える／踏んでいなければ 0 粒', () => {
    expect(splashDropCount(0)).toBe(0);
    expect(splashDropCount(1)).toBe(SPLASH_MAX_DROPS);
    expect(splashDropCount(1)).toBeGreaterThan(splashDropCount(0.3));
  });

  it('⚠️ ★**良・稍重ではどう踏んでも 0**（★跳ねる量の側でも押さえる）', () => {
    for (const cover of [0, 0.5, 1]) {
      expect(splashAmountAt('good', cover)).toBe(0);
      expect(splashAmountAt('yielding', cover)).toBe(0);
      expect(splashAmountAt(undefined, cover)).toBe(0);
    }
  });

  it('⚠️ ★**水たまりの外でも、重・不良なら少し跳ねる**（★これが無いとほぼ画面に出ません）', () => {
    /**
     * 【★この検査が生まれた実害】★最初は「水たまりを踏んだときだけ」でした。
     * ★実画面で ★**1 粒も出ませんでした。**
     * ★水たまりが覆うのは走路の**約 5%**（不良）。★12 頭中 0.6 頭が踏み、
     * ★蹴りの拍（8 コマ中 5）と重なるのは **0.4 頭**。★まず出ません。
     * → ★①地面が水を含んでいる（どの蹴りでも少し）／★②水たまりを踏んだ（大きく）の 2 段にしました。
     * ⚠️ ★①は「絵に無い水」ではありません — ★走路を暗くしている水そのものです。
     */
    expect(splashAmountAt('soft', 0)).toBeGreaterThan(0);
    expect(splashAmountAt('bad', 0)).toBeGreaterThan(splashAmountAt('soft', 0));
    /** ★これだけあれば、蹴っている馬には必ず粒が出ます */
    expect(splashDropCount(splashAmountAt('bad', 0))).toBeGreaterThanOrEqual(2);
  });

  it('★水たまりを踏むと大きく跳ねる（★段になっている）', () => {
    expect(splashAmountAt('bad', 1)).toBeGreaterThan(splashAmountAt('bad', 0));
    expect(splashDropCount(splashAmountAt('bad', 1)))
      .toBeGreaterThan(splashDropCount(splashAmountAt('bad', 0)));
    /** ★踏んでいないときの量より下がることはない（★水たまりが「乾かす」ことはない） */
    for (const c of [0, 0.2, 0.5, 0.9, 1]) {
      expect(splashAmountAt('bad', c)).toBeGreaterThanOrEqual(splashAmountAt('bad', 0));
    }
  });

  it('★時間で消える（★水は散って見えなくなる）', () => {
    const a = splashDropAt(5, 1, 0.1, 1).alpha;
    const b = splashDropAt(5, 1, 0.6, 1).alpha;
    const c = splashDropAt(5, 1, 1, 1).alpha;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeLessThan(0.1);
  });

  it('⚠️ ★**水は土の塊より高く・横へ飛ぶ**（★同じ飛び方だと泥にしか見えません）', () => {
    /**
     * ★塊（`perspective-draw.ts`）の値と比べます:
     *   ★塊 … `rise = sin(life*PI) * (0.35 + seed*0.45)` → ★最大 **0.80m**
     *   ★塊 … `lateral = (seed - 0.5) * 0.9` → ★最大 **±0.45m**
     */
    let maxRise = 0, maxLateral = 0;
    for (let g = 1; g <= 12; g += 1) {
      for (let i = 0; i < SPLASH_MAX_DROPS; i += 1) {
        const d = splashDropAt(g, i, 0.5, 1);
        maxRise = Math.max(maxRise, d.rise);
        maxLateral = Math.max(maxLateral, Math.abs(d.lateral));
      }
    }
    expect(maxRise, '★水が塊より高く上がっていない').toBeGreaterThan(0.80);
    expect(maxLateral, '★水が塊より横へ広がっていない').toBeGreaterThan(0.45);
  });

  it('★塊と同じ場所に重ならない（★散らし方が別）', () => {
    /** ★塊の散らし `(gate*31 + i*17) % 13 / 13` と、★水の `(gate*37 + i*23) % 17 / 17` */
    let same = 0;
    for (let g = 1; g <= 12; g += 1) {
      for (let i = 0; i < 6; i += 1) {
        const chunk = ((g * 31 + i * 17) % 13) / 13;
        const water = ((g * 37 + i * 23) % 17) / 17;
        if (Math.abs(chunk - water) < 1e-9) same += 1;
      }
    }
    expect(same, '★水と土が同じ散らしで、ぴったり重なっている').toBe(0);
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
