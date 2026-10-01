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

  /**
   * ★**本編の段は 位置を持つ**（★レビュー側の依頼・2026-10-01）。★z-index は ★position が static だと効かない
   *   （★ただし grid・flex の子は static でも効く — ★PC のビジョンは grid。★それでも 位置を持たせて 両方で効くようにしておく）。
   *   ★PC: ★本編の段の元の規則（`uma-theme.css` の `.u-race-strip-stage`）が `position: relative`。
   *   ★スマホ: ★テレビの升の中の規則が `position: absolute`。
   */
  const THEME = readFileSync(path.join(ROOT, 'apps/web/src/components/uma/uma-theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const positionOf = (css: string, selector: string): string | null => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1]!.split(',').map((s) => s.trim()).includes(selector)) continue;
      const p = /(?:^|;|\s)position\s*:\s*(static|relative|absolute|fixed|sticky)/.exec(m[2]!);
      if (p !== null) return p[1]!;
    }
    return null;
  };
  const STAGE_BASE = "[data-theme='uma'] .u-race-strip-stage";
  const positioned = (p: string | null): boolean => p === 'relative' || p === 'absolute' || p === 'fixed' || p === 'sticky';

  it('🔴 ★本編の段は 位置を持つ（★PC は元の規則・スマホは升の中の規則）', () => {
    expect(positioned(positionOf(THEME, STAGE_BASE)), '★本編の段の元の規則に position が無い').toBe(true);
    expect(positioned(positionOf(CSS, SP_STAGE)), '★スマホの本編の段に position が無い').toBe(true);
  });

  it('★対照: ★本編の段の position を外す変異は ★落ちる', () => {
    const baseMut = THEME.replace(/(\[data-theme='uma'\] \.u-race-strip-stage \{ )position: relative; /, '$1');
    expect(baseMut).not.toBe(THEME);
    expect(positioned(positionOf(baseMut, STAGE_BASE))).toBe(false);
    const spMut = CSS.replace(/(\.u-tvstrip-screen > \.u-race-strip-stage:not\(\.u-race-strip-stage-offscreen\):not\(\.u-race-strip-stage-full\) \{\s*)position: absolute; /, '$1');
    expect(spMut).not.toBe(CSS);
    expect(positioned(positionOf(spMut, SP_STAGE))).toBe(false);
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
