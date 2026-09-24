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

/**
 * ★`OWN_HEADER = [...]` の中の道を読む。
 *
 * 🔴 ★**2026-09-24 に広げました。** ★以前は `'(\/[a-z0-9-]*)'` で、★**1 段の道しか拾えて**いませんでした。
 *    ★`/stable/roles` `/stable/breed` `/stable/name` は ★**1 つも読めておらず**、
 *    ★下の ① も ③ も ★**この 3 つを見ていませんでした**。★入れ忘れの 4 度目が通り抜けた口です。
 */
function ownHeader(): string[] {
  const src = readFileSync(SHELL, 'utf8');
  const i = src.indexOf('const OWN_HEADER');
  expect(i, '🔴 ★`OWN_HEADER` が見つかりません（★名前が変わった？）').toBeGreaterThan(-1);
  const block = src.slice(i, src.indexOf('];', i));
  return [...block.matchAll(/'(\/[a-z0-9-]*(?:\/[a-z0-9-]+)*)'/g)].map((m) => m[1] as string);
}

/**
 * ★**自前の帯を持つ面**（★`app/**​/page.tsx`）。
 *
 * 🔴 ★**2026-09-24 に広げました。** ★以前は ★①`app` の直下だけ ★②`uma-parts` を使う面だけ、でした。
 *    ★第 2 便の 3 画面は ★**入れ子（`app/stable/...`）**で、★しかも ★**自前の `Shell`**（`uma-parts` を使わない）。
 *    ★**二重に外れて**いたので、★白い旧い枠の中に収まったまま通り抜けました。
 * ★いまの見分け方: ★**全画面の高さ（`100dvh`）を自分で敷いている面**。
 *    ★`uma-parts` の面も自前の `Shell` の面も、★どちらもこれを持ちます。
 */
function ownHeaderPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string, route: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // ★動的な道（`[id]`）と組（`(group)`）は、★道がそのまま URL にならないので見ません
      if (entry.name.startsWith('[') || entry.name.startsWith('(')) continue;
      const here = path.join(dir, entry.name);
      const r = `${route}/${entry.name}`;
      const p = path.join(here, 'page.tsx');
      if (existsSync(p)) {
        const src = readFileSync(p, 'utf8');
        if (src.includes('100dvh') || src.includes('components/uma/uma-parts')) out.push(r);
      }
      walk(here, r);
    }
  };
  walk(APP, '');
  return out.sort();
}

describe('🔴 ★帯が二重にならない（★自前の帯を持つ面は OWN_HEADER へ）', () => {
  it('② ★対象を見つけられている（★0 件 通過を合格にしない・CK-14）', () => {
    const pages = ownHeaderPages();
    expect(pages.length, '🔴 ★自前の帯を持つ面が 0 件。★探し方が壊れています')
      .toBeGreaterThan(5);
    /** 🔴 ★**入れ子の面も拾えていること**（★2026-09-24 に広げた所。★狭いまま緑に戻らせない） */
    expect(pages.filter((p) => p.split('/').length > 2).length,
      '🔴 ★入れ子の面（`/stable/…`）を 1 つも拾えていません。★走査が 1 段に戻っています')
      .toBeGreaterThan(0);
    const own = ownHeader();
    expect(own.length, '🔴 ★`OWN_HEADER` から道を 1 つも読めていません').toBeGreaterThan(5);
    expect(own.filter((p) => p.split('/').length > 2).length,
      '🔴 ★`OWN_HEADER` から入れ子の道を 1 つも読めていません。★正規表現が 1 段に戻っています')
      .toBeGreaterThan(0);
  });

  it('🔴 ① ★自前の帯を持つ面が、★すべて `OWN_HEADER` に在る', () => {
    const own = new Set(ownHeader());
    const missing = ownHeaderPages().filter((p) => !own.has(p));
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
