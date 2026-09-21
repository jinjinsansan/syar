/**
 * 🔴 ★**「作業ツリーが汚れていないか」の判定を、★CI に触らずに回す**（★簿 `CI-DIRTY-TREE-UNSEEN`）
 *
 * ============================================================================
 * 【★なぜ検査にするか】
 *   ⚠️ ★2026-09-20、★`migrate.mjs` の `--plan` の門を ★**staging でしか試さず**、
 *     ★「`--yes-production` は要りません」と書いて ★**動かないものを渡しました**。
 *   → ★★**差が出ない環境で確かめて、★差が出る環境の話を書いた。**
 *   ★同じことが CI でも起きます: ★★**CI の中でしか試せない判定は、
 *     ★CI が落ちた日にしか直せません。**
 *   → ★判定を ★**純関数**に出して、★組み合わせをここで回します。
 *
 * 【🔴 ★いちばん大事な 1 件は ③ です】
 *   ★`git status --porcelain` が空なのは ★**2 通り**あります:
 *     ★① 本当にきれい（★合格）  ★② ★**git が答えていない**（★判定不能）
 *   ★★②を①と読むと、★**検査が死んだ状態が満点**になります（★`CK-14`）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { cleanTreeVerdict } from '../../../tools/lib/clean-tree.mjs';

interface Verdict {
  ok: boolean;
  undecidable: boolean;
  dirty: string[];
  reason: string;
}
const judge = cleanTreeVerdict as (
  porcelain: string, trackedCount: number, allowed?: readonly string[],
) => Verdict;

describe('🔴 ★作業ツリーの汚れ: 判定', () => {
  it('① ★きれいなら通る', () => {
    const v = judge('', 1234);
    expect(v.ok, `★きれいなのに落とした: ${v.reason}`).toBe(true);
    expect(v.undecidable).toBe(false);
    expect(v.dirty).toEqual([]);
  });

  it('🔴 ② ★汚れていたら落ちる（★道を名指しする）', () => {
    const v = judge(' M apps/web/tsconfig.json\n M apps/web/next-env.d.ts\n', 1234);
    expect(v.ok, '🔴 ★汚れているのに通した').toBe(false);
    expect(v.undecidable).toBe(false);
    expect(v.dirty).toHaveLength(2);
    expect(v.reason, '★件数を言っていない').toContain('2 件');
  });

  it('🔴 ③ ★git が答えないときは「きれい」ではなく **判定不能**（★CK-14）', () => {
    /**
     * 🔴 ★ここが核です。★出力は ★**②と同じ「空」**ですが、
     *   ★`trackedCount` が 0 ＝ ★**git が 1 件も見ていない**。
     *   ★★これを「きれい」と読むと、★検査が死んだ状態が満点になります。
     */
    const v = judge('', 0);
    expect(v.ok, '🔴 ★git が答えていないのに合格にした').toBe(false);
    expect(v.undecidable, '🔴 ★判定不能になっていない（★不合格でもなく合格でもない、が要る）').toBe(true);
  });

  it('★追跡数が整数でなければ判定不能（★数えられない＝分からない）', () => {
    expect(judge('', Number.NaN).undecidable).toBe(true);
    expect(judge('', -1).undecidable).toBe(true);
  });

  it('★許した道は見逃す（★ただし既定は「許さない」）', () => {
    const porcelain = '?? out/gen/foo.png\n M apps/web/tsconfig.json\n';
    expect(judge(porcelain, 10).dirty, '★既定で見逃した').toHaveLength(2);
    const v = judge(porcelain, 10, ['out/']);
    expect(v.dirty, '★許した道を落とした').toHaveLength(1);
    expect(v.dirty[0]).toContain('tsconfig.json');
  });

  it('★名前の変更は「変更後の道」で見る', () => {
    const v = judge('R  old/a.ts -> out/b.ts\n', 10, ['out/']);
    expect(v.ok, '★変更後の道で許していない').toBe(true);
  });
});
