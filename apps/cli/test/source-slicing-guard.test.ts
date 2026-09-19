/**
 * ★**本文を切り出す検査に、番人が付いているか**（★**CK-3**・2026-09-19・★CK-1 の家族）
 *
 * 【🔴 ★同じ形で、今日 2 回 落ちました】
 *   ① `entry-params-single-source.test.ts` … ★`indexOf('const RACEABLE_WHERE') .. indexOf('RACEABLE_POOL_LIMIT')`。
 *      ★私が ★**`RACEABLE_POOL_LIMIT` を上の註記に書いた**瞬間、★**終わりが始まりより前**に来て走査が空になった。
 *   ② `story-daily-wiring.test.ts` … ★`indexOf('await recordUnlockDistribution(')`。
 *      ★DL-2 で `runDailyStep(...)` に包んだら ★**`await 〜(` が消えて** −1 になった。
 *   → ★★どちらも ★**検査の意図は満たされたまま、切り出しの字面だけで落ちました。**
 *
 * 【🔴 ★そして、落ちるのはまだ良いほうです】
 *   ★切り出しが空になったとき:
 *     ★**肯定**の表明（`toMatch`）… ★**落ちる**（★うるさいが、気づける）
 *     🔴 ★**否定**の表明（`not.toMatch`）… ★★**素通しで緑**（★空文字には何も当たらない）
 *   ✔ ★実際に `auth-wiring.test.ts` が ★**番人なしの否定の表明**でした（★2026-09-19 に番人を足した）。
 *
 * 【★この検査が守ること】
 *   ★本文を `indexOf` で切り出しているなら、★**切り出せたことを先に確かめる**（R-21）。
 *   ★番人 ＝ `toBeGreaterThan(-1)` / `toBeGreaterThan(0)` / `length … toBeGreaterThan` / `not.toBeNull`。
 *
 * ⚠️ ★**走査は `git ls-files` から**（★TM-1。★`.tmp-*` の 1.68 GB を拾わないため）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/** ★註記を外す（★註記の中に書いた「過去の失敗の例」を拾わない・CK-1） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly guarded: boolean;
}

function findSites(): Site[] {
  const files = execFileSync('git', ['ls-files', '*.test.ts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.length > 0);
  const out: Site[] = [];
  for (const f of files) {
    const raw = readFileSync(path.join(ROOT, f), 'utf8');
    const stripped = stripComments(raw);
    const lines = stripped.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i]!;
      if (!l.includes('.slice(') || !l.includes('indexOf(')) continue;
      /** ★前後 12 行に番人があるか（★同じ `it` の中に置かれるはず） */
      const ctx = lines.slice(Math.max(0, i - 12), i + 12).join('\n');
      const guarded = /toBeGreaterThan\(\s*-?[01]\s*\)/.test(ctx)
        || /length[^\n]*toBeGreaterThan/.test(ctx)
        || ctx.includes('not.toBeNull');
      out.push({ file: f, line: i + 1, text: l.trim().slice(0, 80), guarded });
    }
  }
  return out;
}

const SITES = findSites();

describe('CK-3 本文を切り出す検査の分類簿', () => {
  it('★走査が空でない（★R-21。★`git ls-files` が効いていること）', () => {
    expect(SITES.length, '★1 件も見つからない＝走査が壊れている').toBeGreaterThan(0);
  });

  it('🔴 ★切り出している箇所は、すべて「切り出せたこと」を確かめている', () => {
    const ng = SITES.filter((s) => !s.guarded);
    expect(
      ng.map((s) => `${s.file}:${s.line}  ${s.text}`).join('\n'),
      '★番人の無い切り出しがあります（★空になっても気づけません）',
    ).toBe('');
  });

  it('★註記の中の例を拾っていない（★対照・CK-1）', () => {
    /**
     * ✔ ★`ui3-public-views.test.ts` と `turf-bands.test.ts` は、★**過去の失敗を註記に書いて**います。
     *   ★註記を外していなければ、★それを「番人の無い切り出し」として数えてしまいます。
     */
    for (const f of ['apps/cli/test/ui3-public-views.test.ts', 'apps/web/test/turf-bands.test.ts']) {
      const raw = readFileSync(path.join(ROOT, f), 'utf8');
      // ★生の本文には在る
      expect(/\.slice\([^\n]*indexOf\(/.test(raw), `${f}: 註記に例が無い（★この対照が古い）`).toBe(true);
      // ★註記を外すと消える ＝ 実コードではない
      expect(/\.slice\([^\n]*indexOf\(/.test(stripComments(raw)), `${f}: 実コードに在る`).toBe(false);
    }
  });

  it('★番人ありの箇所も 1 つ以上ある（★「全部 註記でした」で緑にしない）', () => {
    expect(SITES.filter((s) => s.guarded).length).toBeGreaterThan(0);
  });
});
