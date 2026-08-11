/**
 * ★配る物（`dist/worker.cjs`）と原本が同じ結果を出すか（D-043）。
 *
 *   ★バンドルが無い環境では**飛ばさずに落とします**。
 *     「バンドルが無いから検査しなかった」は「検査した」ではありません（R-21）。
 *     `npm run build:worker` を先に流してください。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSelfcheck } from '../src/selfcheck.js';

describe('D-043 配る物の自己検査', () => {
  it('原本の自己検査が通る', () => {
    const r = runSelfcheck();
    expect(r.report.join('\n')).toContain('★selfcheck: PASS');
    expect(r.ok).toBe(true);
  });

  it('★バンドルの出力が原本と1文字も違わない', () => {
    const bundle = 'dist/worker.cjs';
    expect(
      existsSync(bundle),
      '★dist/worker.cjs がありません。`npm run build:worker` を先に流してください（飛ばしません）',
    ).toBe(true);
    const out = execFileSync('node', [bundle, '--selfcheck'], { encoding: 'utf8' });
    expect(out.trimEnd()).toBe(runSelfcheck().report.join('\n'));
  });
});
