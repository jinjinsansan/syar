/**
 * ★**正典 §7.2 の表と `MENUS` の一致**（★D-130 ⑤・2026-10-01）
 *
 * 【★見ている壊れ方】
 *   ★`packages/training/src/menus.ts` の `epCost`・`fatigue` は §7.2 の表の**写し**です（D-052）。
 *   ★片方だけ直すと「写し」が嘘になります。★D-130 で表を改訂したとき、★両者を突き合わせる検査は在りませんでした。
 *   → ★正典の表を読んで、★名前ごとに EP（★改訂後の列）と疲労を比べます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MENUS, MENU_IDS } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const canon = readFileSync(path.join(ROOT, 'STAR_SPEC_v2.0.md'), 'utf8');

/** ★§7.2 の表の行（★見出しから次の空行まで） */
function menuTableRows(): string[][] {
  const start = canon.indexOf('### 7.2 調教メニュー');
  expect(start, '★§7.2 の見出しが見つからない').toBeGreaterThanOrEqual(0);
  const lines = canon.slice(start).split(/\r?\n/);
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(1)) {
    if (line.startsWith('|')) { inTable = true; rows.push(line.split('|').slice(1, -1).map((c) => c.trim())); continue; }
    if (inTable) break;
  }
  return rows;
}

describe('★正典 §7.2 の表 ＝ MENUS（D-130 ⑤）', () => {
  it('① ★8 つの献立すべてで、EP と疲労が表と同じ', () => {
    const [header, , ...body] = menuTableRows();
    expect(header, '★表の見出し行').toBeDefined();
    const epCol = header!.findIndex((h) => h.startsWith('EP') && !h.includes('旧'));
    const fatigueCol = header!.indexOf('疲労');
    expect(epCol, '★「EP」（改訂後）の列').toBeGreaterThan(0);
    expect(fatigueCol, '★「疲労」の列').toBeGreaterThan(0);
    expect(body.length).toBe(MENU_IDS.length);
    for (const id of MENU_IDS) {
      const m = MENUS[id];
      /** ★表の名前は「休養（放牧）」のように補足が付くので、先頭で引く */
      const row = body.find((r) => r[0]!.startsWith(m.label));
      expect(row, `★§7.2 の表に「${m.label}」の行が無い`).toBeDefined();
      const ep = Number(row![epCol]!.replace(/[*,]/g, ''));
      expect(m.epCost, `${m.label} の EP`).toBe(ep);
      /** ★休養の疲労は表では「—」（★減る量は副効果の列）。数のときだけ比べる */
      const f = row![fatigueCol]!;
      if (/^[+-]?\d+$/.test(f)) expect(m.fatigue, `${m.label} の疲労`).toBe(Number(f));
    }
  });
});
