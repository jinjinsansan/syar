/**
 * ★**参考映像の HUD 3 点**（設計 1-4 / 1-5 / 1-6）を留める
 *
 * 【★この検査が見ているのは「出ているか」ではなく、出ていても壊れている 4 つの形です】
 *   ① 名札の見出しを**枠の順番**で付ける → 自馬が先頭のとき 2 着馬が「先頭」になる
 *   ② 隊列バーを**順位**で等間隔に並べる → 馬群の詰まり具合が消え、隊列の縮図でなくなる
 *   ③ 自馬マーカーが**画面上端に張り付く** → 寄ったカットで隊列バーと重なる
 *   ④ 隊列バーを**前の馬から**描く → 重なったとき後ろの馬が上に来て隊列が読めない
 *   ★①〜④ はどれも「描画呼び出しがある」ことでは検出できません（R-16）。
 */
import { describe, it, expect } from 'vitest';
import {
  FORMATION_BAR_SPAN_M, drawFormationBar, drawHorseNamePlates, drawOwnHorseMarker,
  referenceNamePlateRows,
} from '../src/reference-hud.js';

const VIEWPORT = { width: 1280, height: 720 };
const FONT = (px: number, bold?: boolean): string => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;
const PAL: Record<string, string> = {
  'frame-1': '#ffffff', 'frame-2': '#20242a', 'frame-3': '#d52d35', 'frame-4': '#2359c4',
  'frame-5': '#efd329', 'frame-6': '#199655', 'frame-7': '#ef7d20', 'frame-8': '#e75c9a',
  'paper-0': '#f6f2e7', 'ink-0': '#12140f',
};
const frameRoleOf = (gate: number): string => `frame-${((gate - 1) % 8) + 1}`;

/** 描画呼び出しを順番に記録する */
function recorder() {
  const ops: { op: string; args: readonly unknown[]; fillStyle: unknown }[] = [];
  const state = { globalAlpha: 1, fillStyle: '' as unknown, strokeStyle: '' as unknown };
  const push = (op: string) => (...args: unknown[]) => { ops.push({ op, args, fillStyle: state.fillStyle }); };
  const target: Record<string, unknown> = {
    beginPath: push('beginPath'), moveTo: push('moveTo'), lineTo: push('lineTo'),
    closePath: push('closePath'), fill: push('fill'), stroke: push('stroke'),
    ellipse: push('ellipse'), fillRect: push('fillRect'), strokeRect: push('strokeRect'),
    fillText: push('fillText'), strokeText: push('strokeText'),
    measureText: (t: string) => ({ width: t.length * 8 }),
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => (key === 'globalAlpha' ? state.globalAlpha : key === 'fillStyle' ? state.fillStyle
      : key === 'strokeStyle' ? state.strokeStyle : (key in obj ? obj[key as string] : () => undefined)),
    set: (obj, key, value) => {
      if (key === 'globalAlpha') state.globalAlpha = value as number;
      else if (key === 'fillStyle') state.fillStyle = value;
      else if (key === 'strokeStyle') state.strokeStyle = value;
      else obj[key as string] = value;
      return true;
    },
  });
  return { ctx, ops };
}

/** 隊列バーの「馬番の文字」だけを、描かれた順と x で取り出す */
function barBadges(horses: readonly { gate: number; s: number }[], ownGate?: number) {
  const { ctx, ops } = recorder();
  drawFormationBar(ctx as never, PAL, FONT, horses, 12, frameRoleOf,
    { x: 40, y: 4, width: VIEWPORT.width - 80, ownGate, sinceSec: 9 });
  return ops.filter((o) => o.op === 'fillText')
    .map((o) => ({ gate: Number(o.args[0]), x: o.args[1] as number }));
}

describe('参考映像の HUD 3 点', () => {
  describe('A 隊列バー', () => {
    const spread = [
      { gate: 1, s: 1000 }, { gate: 2, s: 998 }, { gate: 3, s: 996 },
      { gate: 4, s: 970 }, { gate: 5, s: 940 },
    ];

    it('全頭ぶんのバッジが出る', () => {
      expect(barBadges(spread).map((b) => b.gate).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });

    /**
     * ★②: **順位ではなく距離**で置いていること。
     *   順位で等間隔に並べると、下の 2 つの隊列は**同じ絵**になります。
     */
    it('★横位置は順位でなく先頭からの距離（隊列の詰まり具合が出る）', () => {
      const tight = barBadges([{ gate: 1, s: 1000 }, { gate: 2, s: 999 }, { gate: 3, s: 998 }]);
      const loose = barBadges([{ gate: 1, s: 1000 }, { gate: 2, s: 980 }, { gate: 3, s: 960 }]);
      const spanOf = (b: { x: number }[]): number => Math.max(...b.map((v) => v.x)) - Math.min(...b.map((v) => v.x));
      expect(spanOf(tight)).toBeLessThan(spanOf(loose) / 4);
    });

    it('先頭は右端・大きく離れた馬は左端で止まる', () => {
      const badges = barBadges([
        { gate: 1, s: 1000 },
        { gate: 2, s: 1000 - FORMATION_BAR_SPAN_M },
        { gate: 3, s: 1000 - FORMATION_BAR_SPAN_M * 3 },   // 範囲外
      ]);
      const byGate = new Map(badges.map((b) => [b.gate, b.x]));
      expect(byGate.get(1)!).toBeGreaterThan(byGate.get(2)!);
      // 範囲外の馬は範囲ちょうどの馬と同じ位置（左端）で止まる
      expect(byGate.get(3)!).toBeCloseTo(byGate.get(2)!, 6);
    });

    /**
     * ★④: **後ろの馬から描く**こと。
     *   `fillText` の順が s の昇順になっていれば、重なったとき前の馬が上に来ます。
     */
    it('★後ろの馬から描く（重なったとき前の馬が上）', () => {
      const drawn = barBadges(spread).map((b) => b.gate);
      expect(drawn).toEqual([5, 4, 3, 2, 1]);
    });

    it('自馬には金の下線が付く（対照: 指定しなければ付かない）', () => {
      const withOwn = recorder();
      drawFormationBar(withOwn.ctx as never, PAL, FONT, spread, 12, frameRoleOf,
        { x: 40, y: 4, width: 1200, ownGate: 3, sinceSec: 9 });
      const without = recorder();
      drawFormationBar(without.ctx as never, PAL, FONT, spread, 12, frameRoleOf,
        { x: 40, y: 4, width: 1200, sinceSec: 9 });
      const rects = (r: ReturnType<typeof recorder>): number => r.ops.filter((o) => o.op === 'fillRect').length;
      expect(rects(withOwn)).toBe(rects(without) + 1);
    });

    it('馬がいなければ何も描かない', () => {
      const { ctx, ops } = recorder();
      drawFormationBar(ctx as never, PAL, FONT, [], 12, frameRoleOf, { x: 40, y: 4, width: 1200 });
      expect(ops).toHaveLength(0);
    });
  });

  describe('B 馬名プレートの行', () => {
    const ranked = [{ gate: 3 }, { gate: 11 }, { gate: 7 }, { gate: 4 }];

    it('自馬 ＋ 上位から 3 行', () => {
      const rows = referenceNamePlateRows(ranked, 4, (g) => `馬${g}`);
      expect(rows.map((r) => r.gate)).toEqual([4, 3, 11]);
      expect(rows[0]!.isOwn).toBe(true);
    });

    /**
     * ★①: **自馬が先頭のとき、他の馬を「先頭」と呼ばないこと。**
     *   枠の順番で見出しを付けると、ここが `先頭` になります（実際にそうなっていた）。
     */
    it('★自馬が先頭でも、2 着馬を「先頭」と呼ばない', () => {
      const rows = referenceNamePlateRows([{ gate: 4 }, { gate: 3 }, { gate: 11 }], 4, (g) => `馬${g}`);
      expect(rows[0]!.note).toBe('自馬・先頭');
      expect(rows[1]!.note).toBe('2番手');
      expect(rows[1]!.note).not.toBe('先頭');
      // ★対照: 自馬が先頭でなければ、先頭の馬はちゃんと「先頭」
      const other = referenceNamePlateRows(ranked, 4, (g) => `馬${g}`);
      expect(other[1]!.note).toBe('先頭');
      expect(other[0]!.note).toBe('自馬・4番手');
    });

    it('自馬が出走表に無ければ上位だけを出す', () => {
      const rows = referenceNamePlateRows(ranked, 99, (g) => `馬${g}`);
      expect(rows.map((r) => r.gate)).toEqual([3, 11, 7]);
      expect(rows.every((r) => r.isOwn !== true)).toBe(true);
    });

    /**
   * ★**置き場所は呼び出し側が決める。**
   *
   *   ⚠️ ★画面いっぱいに 3 等分したら、左端の枠が**実況の立ち絵の裏**に潜りました
   *      （オーナー評「下のナレーターのあたりが崩れている」）。
   *      この描画関数が画面の都合（コース図・立ち絵・実況帯の位置）を知る道理は無いので、
   *      **空いている範囲を受け取れること**を留めます。
   */
    it('★横の範囲を指定でき、その中に収まる', () => {
      const { ctx, ops } = recorder();
      const rows = referenceNamePlateRows(ranked, 4, (g) => `馬${g}`);
      drawHorseNamePlates(ctx as never, PAL, FONT, rows, 12, frameRoleOf,
        { viewport: VIEWPORT, sinceSec: 9, x0: 330, x1: 1256 });
      const xs = ops.filter((o) => o.op === 'fillRect').map((o) => o.args[0] as number);
      expect(xs.length).toBeGreaterThan(0);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(330);
        expect(x).toBeLessThan(1256);
      }
      // ★対照: 範囲を渡さなければ画面左端から始まる（＝立ち絵に潜っていた状態）
      const wide = recorder();
      drawHorseNamePlates(wide.ctx as never, PAL, FONT, rows, 12, frameRoleOf,
        { viewport: VIEWPORT, sinceSec: 9 });
      const wideXs = wide.ops.filter((o) => o.op === 'fillRect').map((o) => o.args[0] as number);
      expect(Math.min(...wideXs)).toBeLessThan(330);
    });

  it('名前は縁取りしてから塗る（明るい芝の上でも読める）', () => {
      const { ctx, ops } = recorder();
      drawHorseNamePlates(ctx as never, PAL, FONT, referenceNamePlateRows(ranked, 4, (g) => `馬${g}`),
        12, frameRoleOf, { viewport: VIEWPORT, sinceSec: 9 });
      const nameOps = ops.filter((o) => (o.op === 'strokeText' || o.op === 'fillText') && String(o.args[0]).startsWith('馬'));
      expect(nameOps[0]!.op).toBe('strokeText');
      expect(nameOps[1]!.op).toBe('fillText');
    });
  });

  describe('C 自馬マーカー', () => {
    const markerTip = (headY: number, topLimitY?: number): number | undefined => {
      const { ctx, ops } = recorder();
      drawOwnHorseMarker(ctx as never, FONT, { x: 600, y: headY }, 4,
        { viewport: VIEWPORT, sinceSec: 9, topLimitY });
      const move = ops.find((o) => o.op === 'moveTo');
      return move === undefined ? undefined : (move.args[1] as number);
    };

    it('馬の頭の少し上に先端が来る', () => {
      expect(markerTip(400)).toBeCloseTo(400 - 12, 6);
    });

    /**
     * ★③: 寄ったカットでは馬の上端が画面 y≈70 まで上がるので、
     *   制限が無いとピンが画面上端の隊列バーに重なります。
     */
    it('★上端の制限より上へは出ない（隊列バーと重ならない）', () => {
      const tip = markerTip(71, 40)!;
      expect(tip).toBeGreaterThanOrEqual(40 + 15 * 2.7 - 1e-6);
      // ★対照: 制限が無ければ上へ出てしまう（この検査が効いていることの確認）
      expect(markerTip(71)!).toBeLessThan(tip);
    });

    it('画面から外れた馬には描かない', () => {
      const { ctx, ops } = recorder();
      drawOwnHorseMarker(ctx as never, FONT, { x: -500, y: 400 }, 4, { viewport: VIEWPORT, sinceSec: 9 });
      expect(ops).toHaveLength(0);
    });
  });
});
