/**
 * 🔴 ★**`uma-theme.css` の動きの規則が、使われないまま残らないこと**（★2026-09-24・レビュー側の指摘）
 *
 * ============================================================================
 * 【★何が起きたか】
 *   ★歩き（`u-walk`）の送りを `steps(8, jump-none)` に直した日、★レビュー側から
 *   ★「★走り（`u-gallop`）は ★**同じ問題を「終点 120%」で解いている**。
 *   ★どちらも正しいが、★**2 通り在ることを知らないと次に触る人が壊す**」と指摘されました。
 *
 *   ★調べたら ★`u-gallop` は ★**使う所が 0 件**でした（★2026-09-17 に TOP の馬として試し、
 *   ★オーナーに「★絵柄が別系統」と差し戻された残り）。
 *   → ★**規則ごと消し**、★解き方を `jump-none` に一本化しました。
 *
 * 【🔴 ★なぜ機械で見張るか】
 *   ★使われない規則は ★**間違っていても誰も気づきません**。★そして
 *   ★**「別の作法」として次の人に読まれます**。★今回まさにそうなりかけました。
 *   ★このファイルには ★`u-turf` / `u-mow` / `u-streak` / 題字の耳 と、
 *   ★**廃止の跡が 4 つ**あります。★毎回「使う所を grep して確かめた」と註記に書いていますが、
 *   ★**人が覚えている限り**の作法でした。
 *
 * ⚠️ ★これは ★**「使われているか」しか見ません**。★動きが正しいかは別の検査です
 *    （★歩きは `train-walk-sprite.test.ts`）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const CSS_PATH = 'apps/web/src/components/uma/uma-theme.css';
const CSS = readFileSync(path.join(ROOT, CSS_PATH), 'utf8');

/** ★`apps/web/src` の tsx / ts / css を全部読む（★`.next*` と `node_modules` は除く） */
function sources(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.next')) continue;
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts|css)$/.test(entry)) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'apps/web/src'));
  return out.join('\n');
}
const CORPUS = sources();

describe('🔴 ★uma-theme.css の @keyframes', () => {
  it('★走査が空でない（★0 件 通過を合格にしない・R-21）', () => {
    expect(CSS.length, `🔴 ★${CSS_PATH} が読めていない`).toBeGreaterThan(2000);
    expect(CORPUS.length, '🔴 ★`apps/web/src` が読めていない').toBeGreaterThan(100000);
  });

  it('🔴 ★宣言した動きは、すべてどこかで使われている', () => {
    const names = [...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
    expect(names.length, '🔴 ★@keyframes が 1 つも見つからない（★走査が壊れている）').toBeGreaterThan(5);
    const unused = names.filter((n) => {
      const all = [...CORPUS.matchAll(new RegExp(`\\b${n}\\b`, 'g'))].length;
      const decl = [...CORPUS.matchAll(new RegExp(`@keyframes\\s+${n}\\b`, 'g'))].length;
      return all - decl === 0;
    });
    expect(
      unused,
      `🔴 ★使う所が 0 件の動きが在ります。★**規則ごと消してください**（★空の規則を残さない）。\n`
      + `   ★使われない規則は、★間違っていても誰も気づかないまま「★別の作法」として次の人に読まれます:\n`
      + `   ${unused.join(', ')}`,
    ).toEqual([]);
  });

  it('🔴 ★コマ送りの解き方が 1 つに揃っている（★`jump-none` のほう）', () => {
    /**
     * ★コマを送る `@keyframes`（★`background-position-x` を百分率で動かすもの）の終点は
     * ★**100%** であること。★`N/(N-1)×100%`（★6 コマなら 120%）は ★**もう 1 つの解き方**で、
     * ★正しいのですが、★同じファイルに 2 通り在ると次に触る人が片方の作法で他方を壊します。
     */
    const stepFrames = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{([^}]*\}[^}]*)\}/g)]
      .filter((m) => /background-position-x:\s*[\d.]+%/.test(m[2]!));
    expect(stepFrames.length, '🔴 ★コマ送りの規則が 1 つも無い（★走査が壊れている）').toBeGreaterThan(0);
    for (const m of stepFrames) {
      const ends = [...m[2]!.matchAll(/background-position-x:\s*([\d.]+)%/g)].map((e) => Number(e[1]));
      expect(
        Math.max(...ends),
        `🔴 ★\`${m[1]}\` の終点が 100% ではありません。★解き方は \`steps(N, jump-none)\` に一本化しています`
        + '（★`uma-theme.css` の `u-walk` の註記を読むこと）',
      ).toBe(100);
    }
  });
});
