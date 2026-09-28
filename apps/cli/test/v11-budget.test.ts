/**
 * ★**V-11 の見積もりの道具**（`apps/cli/src/v11-budget.ts`・★2026-09-28・レビュー側の決定 2 の条件）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★X（景品交換）に ★隠れた既定を持たせる（★「X をいくつに置いた判定か」が消える）
 *   ② 🔴 ★1 つの数字で判定する（★割れ目が見えない）
 *   ③ 🔴 ★margin・賞金表・出走料を ★道具の中に写す（★D-052・正典を直しても道具が古いまま）
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/cli/src/v11-budget.ts'), 'utf8');
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const run = (args: readonly string[]): string => execFileSync(process.execPath,
  [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'apps/cli/src/v11-budget.ts'), ...args],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('★V-11 の見積もりの道具', () => {
  it('🔴 ① ★X と 判定を動かす前提は ★引数で受け、★無ければ止まる（★隠れた既定なし）', () => {
    for (const name of ['--x', '--starts', '--tier', '--field']) expect(LIVE).toContain(`required('${name}'`);
    expect(() => run(['--daily', '2000', '--starts', '10', '--tier', 'maiden', '--field', '12']), '★--x 無しで走った').toThrow();
  }, 60_000);

  it('🔴 ② ★X の幅で ★「どこから割るか」を出す（★行ごとの判定 ＋ 割れ目）', () => {
    const out = run(['--x', '0:2000:500', '--daily', '200,2000', '--starts', '10', '--tier', 'maiden', '--field', '12']);
    expect(out).toContain('★X（景品交換 PP/人/実日）は ★未知のパラメータです');
    expect(out.match(/🔴 割る|✅ 保つ/g)?.length ?? 0, '★X の各行に判定が無い').toBeGreaterThanOrEqual(10);
    expect(out.match(/★正確な割れ目: X ≥/g)?.length).toBe(2);
  }, 60_000);

  it('🔴 ③ ★正典の定数は ★packages から引く（★道具に数を写さない）・★判定は ppNetHealth', () => {
    expect(LIVE).toMatch(/import \{ EP_GRANTS, MARGIN, ppNetHealth, type PointFlowDaily \} from '@star\/betting';/);
    expect(LIVE).toMatch(/ENTRY_FEE_EP, JOCKEYS, PRIZE_TABLE, STUD_FEE_BASE_EP, WEEKS_PER_DAY, WEEKS_PER_YEAR/);
    /** ★margin（0.18〜0.23）・賞金（3,000 など）・出走料 200 を ★数で書いていない */
    expect(LIVE, '★margin を写している').not.toMatch(/0\.1[89]\b|0\.2[03]\b/);
    expect(LIVE, '★賞金表を写している').not.toMatch(/\b3_?000\b|\b1_?200\b/);
  });
});
