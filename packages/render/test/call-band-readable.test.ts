/**
 * ★実況の帯の馬名は 暗い枠の色（黒・濃い青）でも読める（★2026-10-01・オーナー「テロップの文字が被っている」）。
 *   ★18 頭立ての 2 枠（黒）の馬名が 暗い帯に溶けて、★文が途中から始まるように見えていた。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readableOnDark } from '../src/index.js';

const lum = (c: string): number => 0.299 * parseInt(c.slice(1, 3), 16) + 0.587 * parseInt(c.slice(3, 5), 16) + 0.114 * parseInt(c.slice(5, 7), 16);

describe('★実況の帯の馬名の色', () => {
  it('🔴 黒・濃い青は明るく寄せ、他の枠の色はそのまま', () => {
    expect(lum(readableOnDark('#191919'))).toBeGreaterThanOrEqual(150);
    expect(lum(readableOnDark('#1446b4'))).toBeGreaterThanOrEqual(150);
    for (const c of ['#f5f5f5', '#d62828', '#fad728', '#148c46', '#f08219', '#f596be']) expect(readableOnDark(c)).toBe(c);
  });
  it('🔴 帯の 2 行（直前・現在）とも この関数を通す', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/oblique-ui.ts'), 'utf8');
    const band = src.slice(src.indexOf('export function drawCallBand'), src.indexOf('export function drawCourseSectionTag'));
    expect(band.length).toBeGreaterThan(1000);
    expect(band.match(/readableOnDark\(pal\[/g)?.length).toBe(2);
  });
});
