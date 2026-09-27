/**
 * ★**芝の背景の値は 1 か所**（★2026-09-28・レビュー側の条件）
 *
 * 【★見ている壊れ方】
 *   🔴 ★道具 `tools/audit-text-on-backdrop.mjs`（★芝の上の文字の明度差）が ★層の位置と暗幕の段を ★**写す**。
 *      ★Backdrop の値を変えた日に ★道具だけ古い値で測り、★**道具の数字が嘘になる**（★今日カメラの式で直したのと同じ二重管理）。
 *   → ★値は `apps/web/src/components/uma/backdrop-plate.ts` の 1 か所。★Backdrop と道具が ★同じものを import する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SCREEN_OVERLAY_STOPS, screenOverlayCss } from '../../web/src/components/uma/backdrop-plate.js';

const ROOT = path.resolve(__dirname, '../../..');
const TOOL = readFileSync(path.join(ROOT, 'tools/audit-text-on-backdrop.mjs'), 'utf8');
const PARTS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-parts.tsx'), 'utf8');
const live = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');

describe('★芝の背景の値は 1 か所', () => {
  it('🔴 ★道具が ★値を import している（★写していない）', () => {
    expect(TOOL).toContain("from '../apps/web/src/components/uma/backdrop-plate.ts'");
    const t = live(TOOL);
    expect(t, '★道具が暗幕の色を写している').not.toMatch(/\[\s*10\s*,\s*35\s*,\s*64\s*\]|\[\s*8\s*,\s*20\s*,\s*10\s*\]/);
    expect(t, '★道具が層の位置を写している').not.toMatch(/'turf-near'\s*,\s*71\.41/);
  });

  it('🔴 ★Backdrop が ★同じ値から暗幕を作っている', () => {
    const p = live(PARTS);
    expect(p).toContain('background: screenOverlayCss(),');
    expect(p, '★Backdrop が暗幕の色を直に書いている').not.toMatch(/rgba\(8,\s*20,\s*10,/);
    expect(p, '★Backdrop が板の割合を持ち直している').not.toMatch(/const PLATE_LAYERS = \[/);
  });

  it('★作った CSS が ★段の値をそのまま持つ（★対照）', () => {
    const css = screenOverlayCss();
    for (const s of SCREEN_OVERLAY_STOPS) expect(css).toContain(`rgba(${s.rgb.join(',')},${s.a}) ${s.pos}%`);
    expect(SCREEN_OVERLAY_STOPS.find((s) => s.pos === 100)?.a, '★R-18 回答 🟡 #7 の値').toBe(0.86);
  });
});
