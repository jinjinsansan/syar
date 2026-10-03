/**
 * ★**タイトルの自馬は 題字の板の右の帯に収める**（★2026-10-03・オーナー「またタイトル画面で馬が右側切れています」）。
 *   ★09-30 の題字の板（R-25）で板が広がり ★帯が馬より狭くなった → ★中央に置くだけでは 鼻先が画面外・尻が板に食い込んだ。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(__dirname, '../../../packages/render/src/race-intro.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★タイトルの自馬', () => {
  it('🔴 ★帯に入らなければ 帯の幅まで縮める（★大きくはしない）', () => {
    expect(SRC).toContain('const bandW = W - 10 - (px + pw + Math.abs(k) + 18);');
    expect(SRC).toContain('const fit = Math.min(1, bandW / Math.max(1, fr.source.width * (targetH / fr.referenceHeight)));');
    expect(SRC).toContain('const scale = (targetH / fr.referenceHeight) * fit;');
    /** ★対照: ★タイトル（`drawRaceTitleCard`）の中に ★縮めずに置く形（旧）は もう無い（★パドックの紹介は別の関数） */
    expect(SRC.indexOf('export function drawRaceTitleCard'), '★切り出せない').toBeGreaterThan(-1);
    const title = SRC.slice(SRC.indexOf('export function drawRaceTitleCard'));
    expect(title.indexOf('\nexport function', 10), '★関数の終わりが見つからない').toBeGreaterThan(-1);
    const body = title.slice(0, title.indexOf('\nexport function', 10));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('const scale = targetH / fr.referenceHeight;');
  });
});
