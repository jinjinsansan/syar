/**
 * 🔴 ★**自前の帯を持つ面が、★`OWN_HEADER` に在ること**（★2026-09-21・★3 度 入れ忘れました）
 *
 * ============================================================================
 * 【🔴 ★何が起きていたか — ★オーナーの苦情の正体】
 *   ★オーナー: ★**「TOP からログインを押すと、★古いデザインが出る」**
 *
 *   ✔ ★**本番の配信 HTML で実測**（★2026-09-21）:
 *   ```
 *   /home /mypage /vote /train /exchange … ★帯 1 つ（★正しい）
 *   /login /signup                       … 🔴 ★**帯が二重**
 *   /setup                               … ★帯のみ（★自前バーが無い＝まだ旧い）
 *   ```
 *   ★`/login` は ★**新しい部品（`components/uma/uma-parts`）で描かれています**。
 *   ★ところが `OWN_HEADER` に無いので、★`StoryShell` が ★**上にもう 1 つ帯を載せて**いました。
 *
 *   → ★★**「古いデザイン」ではありませんでした。★古い帯が 1 枚 余分に載っていただけ。**
 *   → ★★**世代の混在でもありませんでした**（★私は一度そう報告しました。★誤りです）。
 *
 * 【🔴 ★なぜ検査にするか】
 *   ★`story-shell.tsx` の註記は ★**「画面を足したらここも足す（★2 度入れ忘れました）」**と
 *   ★書いてありました。★★**書いてあっても、★3 度目が起きました。**
 *   → ★★**註記は人を守りません。★検査が守ります**（★`rule-must-live-outside-my-head`）。
 *
 * 【★対（★`CK-14`）】
 *   ★① ★`uma-parts` を使う面が、★**すべて `OWN_HEADER` に在る**
 *   ★② ★**`uma-parts` を使う面が 1 つも見つからないなら落ちる**（★探し方が壊れた状態を合格にしない）
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'apps/web/src/app');
const SHELL = path.join(ROOT, 'apps/web/src/components/story-shell.tsx');

/** ★`OWN_HEADER = [...]` の中の道を読む */
function ownHeader(): string[] {
  const src = readFileSync(SHELL, 'utf8');
  const i = src.indexOf('const OWN_HEADER');
  expect(i, '🔴 ★`OWN_HEADER` が見つかりません（★名前が変わった？）').toBeGreaterThan(-1);
  const block = src.slice(i, src.indexOf('];', i));
  return [...block.matchAll(/'(\/[a-z0-9-]*)'/g)].map((m) => m[1] as string);
}

/** ★`app/<名>/page.tsx` のうち、★`uma-parts` を使うもの */
function umaPages(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(APP, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const p = path.join(APP, name.name, 'page.tsx');
    if (!existsSync(p)) continue;
    if (readFileSync(p, 'utf8').includes('components/uma/uma-parts')) out.push(`/${name.name}`);
  }
  return out.sort();
}

describe('🔴 ★帯が二重にならない（★自前の帯を持つ面は OWN_HEADER へ）', () => {
  it('② ★対象を見つけられている（★0 件 通過を合格にしない・CK-14）', () => {
    const pages = umaPages();
    expect(pages.length, '🔴 ★`uma-parts` を使う面が 0 件。★探し方が壊れています')
      .toBeGreaterThan(5);
    expect(ownHeader().length, '🔴 ★`OWN_HEADER` から道を 1 つも読めていません')
      .toBeGreaterThan(5);
  });

  it('🔴 ① ★`uma-parts` を使う面が、★すべて `OWN_HEADER` に在る', () => {
    const own = new Set(ownHeader());
    const missing = umaPages().filter((p) => !own.has(p));
    expect(missing, `🔴 ★帯が二重になります（★StoryShell の帯 ＋ 自前バー）:\n  ${missing.join('\n  ')}\n`
      + '  ★`apps/web/src/components/story-shell.tsx` の `OWN_HEADER` に足してください').toEqual([]);
  });

  it('⚠️ ★`OWN_HEADER` に、★実在しない面が残っていない（★見張り続けない・R-19）', () => {
    const ghosts = ownHeader().filter((p) => {
      if (p === '/') return false;                       // ★LP は `app/page.tsx`
      return !existsSync(path.join(APP, p.replace(/^\//, ''), 'page.tsx'));
    });
    expect(ghosts, `⚠️ ★`+`OWN_HEADER に、もう無い面が残っています:\n  ${ghosts.join('\n  ')}`)
      .toEqual([]);
  });
});
