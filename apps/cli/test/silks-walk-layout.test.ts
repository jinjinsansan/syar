/**
 * ★**パドックの歩きの 勝負服の窓は 画布に固定**（★2026-10-03・オーナーの録画「騎手の服の色がちらつく」「騎手の顔がちらつく」）。
 *
 * 【★見ている壊れ方】
 *   ★窓を そのコマの外接矩形（★脚・尾で毎コマ変わる）の割合で置くと、★歩きでは窓が騎手の上を滑り
 *   ★上着の白いまだら と ★ゴーグルが兜の色に塗られる が コマごとに変わった（★本番の見本で撮って確認）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const BAKE = readFileSync(path.join(ROOT, 'tools/bake-race-frames.mjs'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'apps/web/public/art/baked/manifest.json'), 'utf8')) as {
  sets: { role: string; nativeCanvasWidth?: number; nativeCanvasHeight: number }[];
};

describe('★パドックの歩きの勝負服', () => {
  it('🔴 ★歩きは 画布に固定した窓（★原版の経路も 焼いた経路も）', () => {
    expect(PAGE).toMatch(/const SILKS_LAYOUT_WALK: SilksLayout = \{\s*canvasFixed: true,/);
    expect(PAGE).toContain('buildFramesByType({ a: walkA, ...walkByType }, undefined, SILKS_LAYOUT_WALK, sideMode)');
    expect(PAGE).toContain('byType.set(t, buildFramesFromBaked(set, new Map(ok), SILKS_LAYOUT_WALK, undefined, shadow ?? undefined));');
    /** ★窓を置く矩形は 画布（★外接矩形でない）・★数字の大きさは外接矩形のまま */
    expect(PAGE).toContain('source = layout.canvasFixed === true && canvasRect !== undefined ? canvasRect : source;');
    expect(PAGE).toContain('const numberFont = Math.max(42, Math.round(bounds.height * 0.068));');
    expect(PAGE).toContain("const bounds = layout.canvasFixed === true ? { x: 0, y: 0, width: imgW(image), height: imgH(image) } : frameBounds;");
    /** ★対照: ★走りは これまでどおり 外接矩形の窓 */
    expect(PAGE).not.toMatch(/const SILKS_LAYOUT_CROUCH: SilksLayout = \{\s*canvasFixed/);
  });

  it('🔴 ★兜の窓は ゴーグルの帯より上だけ（★硝子は薄い灰で 塗れる判定に入る）', () => {
    const m = /const SILKS_LAYOUT_WALK: SilksLayout = \{[\s\S]*?helmet: \[([\d.]+), ([\d.]+), ([\d.]+)\]/.exec(PAGE);
    expect(m).not.toBeNull();
    expect(Number(m![3])).toBeLessThanOrEqual(0.09);
  });

  it('★焼いた歩きは 画布の幅を持つ（★無いと 外接矩形の窓に戻る）', () => {
    expect(BAKE).toContain('nativeCanvasWidth: natives[0].w,');
    for (const role of ['side-walk', 'side-walk-m']) {
      expect(MANIFEST.sets.find((s) => s.role === role)?.nativeCanvasWidth, role).toBe(1536);
    }
  });
});
