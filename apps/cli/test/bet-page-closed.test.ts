/**
 * 🔴 ★**`/races/[id]/bet` の口は閉じている**（★2026-09-27・裁定 `REVIEW_UI_AUDIT_20260927.md` P0-A）
 *
 * 【🔴 ★何が起きていたか】
 *   ★この画面は「★デモデータ（投票はサーバー RPC に接続するまで動きません）」と書きながら、
 *   ★実際には `place_bet` が通り ★**EP を引いていました**（★嘘の向きが最悪 — ★動かないと読んだ人が試して EP を失う）。
 *   ★しかも ★`loadBetScreen(null)` で ★URL の `[id]` を無視し、★**別のレースに投票されていました**。
 *
 * 【★見るもの】
 *   ① ★どの画面からも ★`/races/<id>/bet` へのリンクが無い（★入口を閉じた）
 *   ② ★画面は残るが ★送らない（★`BET_PAGE_CLOSED` で `submit` が先に戻る・★ボタンも押せない）
 *   ③ ★「動きません」の嘘の文が ★無い（★閉じたことを事実どおりに言う）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../../web/src');
const BET = path.join(WEB, 'app/races/[id]/bet/page.tsx');
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
/** ★`href` に `/races/…/bet` を張っているか（★テンプレート・文字列の両方） */
const LINK = /href=\{?\s*[`'"]\/races\/[^`'"]*\/bet[`'"]/;

describe('🔴 ★/races/[id]/bet の口は閉じている（P0-A）', () => {
  it('★網が空振りしていない（★対照）', () => {
    expect(LINK.test('<a href={`/races/${id}/bet`}>投票する</a>')).toBe(true);
    expect(LINK.test('<a href="/races/abc/bet">')).toBe(true);
    expect(LINK.test('<a href={`/odds/${id}`}>'), '★オッズへのリンクを捕まえる').toBe(false);
  });

  it('🔴 ① ★どの画面からも入口が張られていない', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(e.name) && LINK.test(strip(readFileSync(full, 'utf8')))) hits.push(path.relative(WEB, full));
      }
    };
    walk(WEB);
    expect(hits, '🔴 ★閉じた投票の口へ ★入口が張られています（★別のレースに投票し EP を引く画面）').toEqual([]);
  });

  it('🔴 ② ★画面は送らない（★submit が先に戻る・★ボタンも押せない）', () => {
    const src = strip(readFileSync(BET, 'utf8'));
    expect(src).toContain('const BET_PAGE_CLOSED = true;');
    const submit = src.match(/const submit = async \(\): Promise<void> => \{([\s\S]*?)const r = await placeBet\(/);
    expect(submit, '★`submit` から `placeBet` までが切り出せない').not.toBeNull();
    expect(submit![1], '🔴 ★閉じているのに ★`placeBet` の前で戻っていません').toContain('if (BET_PAGE_CLOSED) return;');
    expect(src, '🔴 ★ボタンが押せます').toMatch(/disabled=\{BET_PAGE_CLOSED \|\|/);
  });

  it('🔴 ③ ★「動きません」の嘘の文が無い', () => {
    const src = readFileSync(BET, 'utf8');
    expect(strip(src)).not.toContain('投票はサーバー RPC に接続するまで動きません');
    expect(src).toContain('この口はいま使えません');
  });
});
