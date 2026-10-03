/**
 * ★**毛色を塗った馬の絵は 描く用の画布で返す**（★2026-10-03・オーナーの記録「ゲートの場面で 毎コマ 70〜180ms」）。
 *   ★`willReadFrequently` の画布のまま返すと ★GPU で描く画面に 毎コマ絵を送り直す。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★bakeCoat の返す画布', () => {
  it('🔴 ★willReadFrequently の画布を そのまま返さない', () => {
    expect(PAGE.indexOf('function bakeCoat('), '★切り出せない').toBeGreaterThan(-1);
    expect(PAGE.indexOf('const GATE_BILLBOARD'), '★切り出せない').toBeGreaterThan(-1);
    const body = PAGE.slice(PAGE.indexOf('function bakeCoat('), PAGE.indexOf('const GATE_BILLBOARD'));
    expect(body).toContain("const ctx = canvas.getContext('2d', { willReadFrequently: true });");
    expect(body).toContain("const octx = out.getContext('2d');");
    expect(body).toContain('octx.drawImage(canvas, 0, 0);');
    expect(body).toMatch(/return out;\s*\}/);
    /** ★対照: ★塗った画布を そのまま返す形（旧）は無い */
    expect(body).not.toMatch(/ctx\.putImageData\(data, 0, y\);\s*\}\s*return canvas;/);
  });
});
