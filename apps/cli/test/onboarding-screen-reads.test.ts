/**
 * ★**画面は導入の段階を導き直さない**（★裁定 `REVIEW_ONBOARDING_STATE_VERDICT_20260922.md` §2 条件 1）。
 *
 *   ★段階はサーバー（`my_onboarding_state`・移行 `0067`）が在る行から導きます。
 *   ★画面の層（`apps/web/src`）が ★`foal_requests` / `foal_drafts` を ★直に読む口を持たないことを ★構文で見ます。
 *   ★（★表は `revoke all … from anon, authenticated` なので読めませんが、★読もうとするコードが在ること自体を止める）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('★画面は導入の段階を導き直さない（★裁定 8a32840 §2 条件 1）', () => {
  const files = walk(WEB_SRC);

  it('★走査が空でない（★対照）', () => {
    expect(files.length, '★画面のファイルを読めていない').toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith(path.join('lib', 'onboarding.ts'))), '★読む口のファイルが走査に入っていない').toBe(true);
  });

  it('🔴 ★`foal_requests` / `foal_drafts` を直に読む口が無い（★`.from(...)` でも文字列でも）', () => {
    const offenders = files.filter((f) => /\bfoal_(requests|drafts)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('★段階は ★`my_onboarding_state` の 1 つの口から読む', () => {
    const src = readFileSync(path.join(WEB_SRC, 'lib', 'onboarding.ts'), 'utf8');
    expect(src).toContain("rpc('my_onboarding_state'");
  });
});
