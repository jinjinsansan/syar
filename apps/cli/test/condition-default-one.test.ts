/**
 * ★**調子の既定は 1 つだけ**（★**COND-DEFAULT-TWO**・D-052・2026-09-19）
 *
 * 【★何が起きていたか】
 *   ★`race-field.ts` に ★**同じ量（調子）の既定が 2 つ**ありました:
 *     ★`toEntrant`   … `overrides.condition ?? 3`
 *     ★出走表の組み立て … `trained?.condition ?? rng.int(2, 4)`
 *   ⚠️ ★**しかも値が違いました**（★固定 3 と、★2〜4 の乱数）。
 *     ★どちらの経路を通ったかで ★**測定が変わります**（★実際、★基準値 D は後者で測られていました）。
 *
 * 【✅ ★直し方 — ★「1 つに揃える」ではなく「1 つから導く」】
 *   ★どちらも ★**正典 §7.4 の式**（`packages/training/src/condition.ts`）から導きます:
 *     ★`CONDITION_BASE`（＝ 3）と ★`nextCondition(0, rng)`（＝ 疲労 0 の馬が引くもの）。
 *   → ★**正典が基準値を動かせば、両方が動きます。**
 *
 * 【🔴 ★この検査の主眼は「値が同じ」ではありません】
 *   ★**数を書かないこと**が主眼です。★`3` と `2,4` を書き戻せば、★また 2 つに戻ります。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deriveRng } from '@star/sim-engine';
import { CONDITION_BASE, nextCondition } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = readFileSync(path.join(ROOT, 'apps/cli/src/race-field.ts'), 'utf8');

describe('★COND-DEFAULT-TWO: 調子の既定は 1 か所から導く', () => {
  it('🔴 ★`race-field.ts` に、★調子の既定の数を書かない', () => {
    expect(SRC, '★`?? 3` が残っている（★正典の `CONDITION_BASE` から導くこと）')
      .not.toMatch(/condition:\s*overrides\.condition\s*\?\?\s*\d/);
    expect(SRC, '★`rng.int(2, 4)` が残っている（★`nextCondition(0, rng)` から導くこと）')
      .not.toMatch(/condition:\s*trained\?\.condition\s*\?\?\s*rng\.int\(/);
  });

  it('★対照: ★正典の式から導いている（★ただ消しただけでない）', () => {
    expect(SRC, '★`CONDITION_BASE` を使っていない').toContain('CONDITION_BASE');
    expect(SRC, '★`nextCondition` を使っていない').toContain('nextCondition(0, rng)');
  });

  it('★固定の既定は、正典の基準値そのもの（★中央を手で書かない）', () => {
    /**
     * ⚠️ ★`3` が ★**`{2,3,4}` の中央**なのは偶然ではなく、★§7.4 が `base ± 1` だからです。
     *    ★中央を別に定義すると、★`rand(-1,+1)` が変わったときに ★**中央だけ取り残されます**。
     */
    expect(CONDITION_BASE).toBe(3);
  });

  it('🔴 ★乱数の引き方が変わっていない（★V-4 が 1 ビットも動かないことの根拠）', () => {
    /**
     * ★`rng.int(2, 4)` と `nextCondition(0, rng)` は、★**どちらも 3 幅の整数を 1 回**引きます。
     *   → ★**同じ種から、同じ列**が出るはず。★出なければ、★置き換えで V-4 が動きます。
     * ⚠️ ★これが崩れたら、★**この便は「無害な整理」ではありません。**★測り直しが要ります。
     */
    const a = deriveRng(4242, 1);
    const b = deriveRng(4242, 1);
    const before: number[] = [];
    const after: number[] = [];
    for (let i = 0; i < 500; i += 1) {
      before.push(a.int(2, 4));
      after.push(nextCondition(0, b));
    }
    expect(after, '🔴 ★置き換えで乱数の列が変わりました（★V-4 が動きます）').toEqual(before);
  });

  it('★対照: 上の検査が空振りでない（★列が定数でない）', () => {
    const r = deriveRng(4242, 1);
    const xs = new Set(Array.from({ length: 200 }, () => nextCondition(0, r)));
    expect(xs, '★{2,3,4} の 3 通りが出ていない（★比べたものが定数だった）').toEqual(new Set([2, 3, 4]));
  });
});
