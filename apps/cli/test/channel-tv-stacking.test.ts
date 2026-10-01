/**
 * ★**本編は 小窓テレビより上に重なる**（★2026-10-01・オーナー「小窓ではレースが映らない。ずっと芝だけ。拡大すると走っている」）
 *
 * 【★見ている壊れ方】
 *   ★本編（`.u-race-strip-stage`）と テレビ（`.u-vision-tv`・`.u-tv`）を ★同じ升に重ねている。
 *   ★z-index を持たないと ★DOM で後ろのテレビが ★本編の iframe を覆う（★61dc3e4 で 1 度 そうなった）。
 *   ★数値の釘にせず ★2 つの段の上下関係（★本編の z > テレビの z）を見る。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const CSS = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/channel-tv.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** ★選択子（★完全一致）に付いた z-index（★無ければ 0 ＝ auto と同じ扱い） */
function zIndexOf(css: string, selector: string): number {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]!.split(',').map((s) => s.trim());
    if (!sels.includes(selector)) continue;
    const z = /z-index\s*:\s*(-?\d+)/.exec(m[2]!);
    if (z !== null) return Number(z[1]);
  }
  return 0;
}

const PC_STAGE = "[data-theme='uma'] .u-race-strip-vision > .u-race-strip-stage:not(.u-race-strip-stage-offscreen):not(.u-race-strip-stage-full)";
const PC_TV = "[data-theme='uma'] .u-race-strip-vision > .u-vision-tv";
const SP_STAGE = "[data-theme='uma'] .u-tvstrip-screen > .u-race-strip-stage:not(.u-race-strip-stage-offscreen):not(.u-race-strip-stage-full)";
const SP_TV = "[data-theme='uma'] .u-tv";

describe('★本編は 小窓テレビより上（★重なり順）', () => {
  it('🔴 ★PC の大型ビジョン: 本編の段の z ＞ テレビの段の z', () => {
    expect(CSS, '★本編の段の規則が見つからない').toContain(PC_STAGE);
    expect(CSS, '★テレビの段の規則が見つからない').toContain(PC_TV);
    expect(zIndexOf(CSS, PC_STAGE)).toBeGreaterThan(zIndexOf(CSS, PC_TV));
  });

  it('🔴 ★スマホのテレビ: 本編の段の z ＞ テレビの z', () => {
    expect(CSS, '★本編の段の規則が見つからない').toContain(SP_STAGE);
    expect(zIndexOf(CSS, SP_STAGE)).toBeGreaterThan(zIndexOf(CSS, SP_TV));
  });

  it('★対照: ★本編の段の z-index を外す変異は ★落ちる', () => {
    const strip = (css: string, sel: string): string => css.replace(new RegExp(`(${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*?)z-index\\s*:\\s*-?\\d+;?`), '$1');
    const pcMut = strip(CSS, PC_STAGE);
    expect(pcMut).not.toBe(CSS);
    expect(zIndexOf(pcMut, PC_STAGE)).not.toBeGreaterThan(zIndexOf(pcMut, PC_TV));
    const spMut = strip(CSS, SP_STAGE);
    expect(spMut).not.toBe(CSS);
    expect(zIndexOf(spMut, SP_STAGE)).not.toBeGreaterThan(zIndexOf(spMut, SP_TV));
  });
});
