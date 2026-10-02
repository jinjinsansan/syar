/**
 * ★**レースの絵は 読み込みの間に展開まで済ませる**（★2026-10-02・パドックの最初のコマ 325ms）。
 *
 * 【★見ている壊れ方】
 *   ★`onload` で すぐ返すと ★最初に描くコマで ブラウザがその場で展開して止まる
 *   （★本番の見本を画面の裏で流し ★展開を先にする差し込みで 325ms のコマ落ちが消えた・`out/gen/measure-cut-stall.mjs --decode`）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const PAGE = readFileSync(path.join(ROOT, 'apps/web/src/app/race/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('★レースの絵の読み込み', () => {
  it('🔴 ★loadRaw は decode() の後に返す（★失敗しても読み込みは成功）', () => {
    const start = PAGE.indexOf('const loadRaw = ');
    expect(start, '★loadRaw が見つからない').toBeGreaterThan(0);
    const body = PAGE.slice(start, PAGE.indexOf('const loadImg = ', start));
    expect(body).toContain('im.onload = () => { void im.decode().catch(() => undefined).then(() => res(im)); };');
    /** ★対照: ★すぐ返す旧い形は ★落ちる */
    const old = body.replace('im.onload = () => { void im.decode().catch(() => undefined).then(() => res(im)); };', 'im.onload = () => res(im);');
    expect(old).not.toContain('im.decode()');
  });
});
