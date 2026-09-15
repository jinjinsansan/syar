/**
 * ★**コース脇の旗・その回の風・コース図の色・格のファンファーレ**（★2026-09-15・計画書 V-7 / V-9 / C-3 / R-1）
 *
 * 【★見ている壊れ方】
 *   ① ★スターパーク（既定の鞍）に旗やコース図の色が入って ★画が変わる
 *   ② ★9 場の旗・コース図の色が重なる（★場ごとに違わない）
 *   ③ ★旗の口が効いていない（★色を渡しても描かない／★風向きを変えても同じ形）… 対照つき
 *   ④ ★風が決定論でない（★同じ入力で違う風）
 *   ⑤ ★コース図の色の口が効いていない … 対照つき
 *   ⑥ ★格のファンファーレが G2 で従来から動く／★G1 と G3 の順が逆
 *   ⑦ ★画面が同じ表から引いていない（R-30）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  VENUE_LOOKS, venueLookOf, GRADE_LOOKS,
  drawTracksideFlags, windOf, drawCourseMinimap,
  ovalCourse, resolveBroadcastV2Scene,
} from '@star/render';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

function recorder() {
  const ops: string[] = [];
  const r = (v: number): string => v.toFixed(3);
  const state = { fillStyle: '' as unknown, strokeStyle: '' as unknown, globalAlpha: 1 };
  const target: Record<string, unknown> = {
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect:${String(state.fillStyle)}:${r(x)},${r(y)},${r(w)},${r(h)}`),
    fill: () => ops.push(`fill:${String(state.fillStyle)}`),
    stroke: () => ops.push(`stroke:${String(state.strokeStyle)}`),
    moveTo: (x: number, y: number) => ops.push(`M${r(x)},${r(y)}`),
    lineTo: (x: number, y: number) => ops.push(`L${r(x)},${r(y)}`),
    beginPath: () => undefined, closePath: () => undefined, drawImage: () => undefined, ellipse: () => undefined,
    fillText: (t: string) => ops.push(`text:${t}:${String(state.fillStyle)}`),
    measureText: () => ({ width: 10 }), save: () => undefined, restore: () => undefined, transform: () => undefined,
    /** ★コース図の板（`drawGlassNotchPanel`）が金の縁に使う */
    createLinearGradient: () => ({ addColorStop: () => undefined }),
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

/** ★道中の真横のカメラで旗を描いた命令列 */
function flagOps(style: { pole: string; colors: readonly string[] }, windDir: 1 | -1, windStrength: number, timeSec: number): string[] {
  const horses = Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: 1390 - i * 3, w: 2 + (i % 4) * 2.2 }));
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: 'finish-line', script: 'v8' });
  const { ctx, ops } = recorder();
  drawTracksideFlags(ctx as never, course, scene.camera, { focusS: scene.focusS, style, windDir, windStrength, timeSec });
  return ops;
}

describe('★コース脇の旗・風・コース図の色・格のファンファーレ', () => {
  it('★① スターパークは旗もコース図の色も持たない（★既定の画を変えない）', () => {
    const star = venueLookOf('star-park');
    expect(star.flags).toBeUndefined();
    expect(star.courseMap).toBeUndefined();
  });

  it('★② 9 場の旗の色とコース図の色がすべて違う', () => {
    const others = VENUE_LOOKS.filter((v) => v.venueId !== 'star-park');
    expect(others.length).toBe(9);
    expect(new Set(others.map((v) => JSON.stringify(v.flags))).size).toBe(9);
    expect(new Set(others.map((v) => JSON.stringify(v.courseMap))).size).toBe(9);
    for (const v of others) {
      expect(v.flags, v.venueId).toBeDefined();
      expect(v.flags!.colors.length, v.venueId).toBeGreaterThanOrEqual(2);
    }
  });

  it('★③ 旗は渡した色で描かれ、★風向きと表示秒で形が変わる（★対照: 色が空なら何も描かない）', () => {
    const style = venueLookOf('tenga').flags!;
    const east = flagOps(style, 1, 0.6, 1.25);
    expect(east.some((o) => style.colors.some((c) => o === `fill:${c}`)),
      '★旗が画面に入っていない（この検査は何も見ていない）').toBe(true);
    expect(east.some((o) => o.startsWith(`fillRect:${style.pole}`))).toBe(true);
    expect(flagOps(style, -1, 0.6, 1.25)).not.toEqual(east);
    expect(flagOps(style, 1, 0.6, 1.75), '★揺れは表示秒の関数').not.toEqual(east);
    expect(flagOps(style, 1, 0.6, 1.25), '★同じ入力なら同じ画').toEqual(east);
    expect(flagOps({ pole: style.pole, colors: [] }, 1, 0.6, 1.25)).toEqual([]);
  });

  it('★④ 風は決定論で、向きは両方・強さは 0.25〜0.85 に散る', () => {
    expect(windOf(42)).toEqual(windOf(42));
    const winds = Array.from({ length: 200 }, (_, i) => windOf(i));
    expect(new Set(winds.map((w) => w.windDir))).toEqual(new Set([1, -1]));
    for (const w of winds) {
      expect(w.windStrength).toBeGreaterThanOrEqual(0.25);
      expect(w.windStrength).toBeLessThanOrEqual(0.85 + 1e-9);
    }
    expect(new Set(winds.map((w) => w.windStrength)).size).toBeGreaterThan(4);
  });

  it('★⑤ コース図: 色を渡すと走路と決勝線がその色に（★対照: 渡さなければ従来の色）', () => {
    const draw = (colors?: { trackColor: string; goalColor: string }): string[] => {
      const { ctx, ops } = recorder();
      drawCourseMinimap(ctx as never, course, {}, (px: number) => `${px}px sans-serif`, [], 800,
        { x: 0, y: 0, width: 400, height: 300 }, () => '#fff', { distanceLabel: '芝 1600m', ...(colors ?? {}) });
      return ops;
    };
    const base = draw();
    expect(base).toContain('fill:#4d6b40');
    const tenga = venueLookOf('tenga').courseMap!;
    const colored = draw({ trackColor: tenga.track, goalColor: tenga.goal });
    expect(colored).toContain(`fill:${tenga.track}`);
    expect(colored).not.toContain('fill:#4d6b40');
    expect(colored).toContain(`stroke:${tenga.goal}`);
  });

  it('★⑥ 格のファンファーレ: G2 は従来（倍率 1・絞り 1.2 秒）／G1 は強く長く・G3 は控えめ', () => {
    expect(GRADE_LOOKS.G2.fanfareGain).toBe(1);
    expect(GRADE_LOOKS.G2.fanfareFadeSec).toBe(1.2);
    expect(GRADE_LOOKS.G1.fanfareGain).toBeGreaterThan(GRADE_LOOKS.G2.fanfareGain);
    expect(GRADE_LOOKS.G3.fanfareGain).toBeLessThan(GRADE_LOOKS.G2.fanfareGain);
    expect(GRADE_LOOKS.G1.fanfareFadeSec).toBeGreaterThan(GRADE_LOOKS.G2.fanfareFadeSec);
    expect(GRADE_LOOKS.G3.fanfareFadeSec).toBeLessThan(GRADE_LOOKS.G2.fanfareFadeSec);
    /** ★`level` の上限（`race-audio.ts` の 1.5）に掛けても割れない強さ */
    expect(0.75 * GRADE_LOOKS.G1.fanfareGain).toBeLessThanOrEqual(1.5);
  });

  it('★⑦ 画面（/race）は同じ表から旗・風・コース図の色・ファンファーレを引いている', () => {
    const src = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    for (const needle of [
      'tracksideFlags: VENUE_LOOK.flags === undefined ? undefined',
      '{ style: VENUE_LOOK.flags, ...windOf(seed), timeSec: d }',
      "audioRef.current?.level('fanfare', GRADE_LOOK.fanfareGain, 0.05);",
      "audio?.fade('fanfare', GRADE_LOOK.fanfareFadeSec);",
      'courseMapColors: VENUE_LOOK.courseMap,',
    ]) expect(src, `★画面に ${needle} が無い`).toContain(needle);
  });
});
