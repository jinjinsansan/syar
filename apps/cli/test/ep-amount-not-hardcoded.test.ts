/**
 * 🔴 ★**画面に EP の額を直書きしない**（★2026-09-27・裁定 UI 総点検 P1-3／EP の件 条件 (d)）
 *
 * 【🔴 ★実例】
 *   ★`/setup` が ★「登録で 2,000 EP、毎日のログインで 200 EP が入ります」と ★直書きしていました。
 *   ★デイリーを 200 → 2,000 に改訂した日（★D-075・移行 `0091`）に ★**この文だけ嘘になる**ところでした。
 *   ★★額を 2 か所に持つと 片方が古びる（★D-052）。
 *
 * 【★見るもの】
 *   ★`apps/web/src` の `.ts` / `.tsx` を ★註記を除いて読み、★「数字＋EP」の直書きが 1 つも無いこと。
 *   ★額は ★SQL の `ep_grant_amount()`（★1 か所）と、★網 `ep-grant-sql.test.ts` が一致を見る TS の写し `EP_GRANTS` からだけ。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../../web/src');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
/** ★「2,000 EP」「200EP」など（★数字の直後に EP） */
const LITERAL = /[0-9][0-9,]*\s*EP/;

describe('🔴 ★画面に EP の額を直書きしない', () => {
  it('★網が空振りしていない（★対照）', () => {
    expect(LITERAL.test('登録で 2,000 EP、毎日のログインで 200 EP')).toBe(true);
    expect(LITERAL.test('登録で {SETUP_GRANT_EP.toLocaleString()} EP'), '★部品から読む形を捕まえる').toBe(false);
    expect(LITERAL.test(strip('/** 毎日 200 EP */\nconst a = 1;')), '★註記の中を数えている').toBe(false);
  });

  it('🔴 ★apps/web/src に「数字＋EP」の直書きが無い', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(tsx|ts)$/.test(e.name)) continue;
        strip(readFileSync(full, 'utf8')).split('\n').forEach((line, i) => {
          if (LITERAL.test(line)) hits.push(`${path.relative(WEB, full)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
      }
    };
    walk(WEB);
    expect(hits, '🔴 ★画面が EP の額を直書きしています（★`EP_GRANTS` か サーバーの値から読むこと）').toEqual([]);
  });

  it('★/setup は 額を EP_GRANTS の写し（SETUP_GRANT_EP / SETUP_DAILY_EP）から読む', () => {
    const src = strip(readFileSync(path.join(WEB, 'app/setup/page.tsx'), 'utf8'));
    expect(src).toContain('SETUP_GRANT_EP.toLocaleString');
    expect(src).toContain('SETUP_DAILY_EP.toLocaleString');
  });
});
