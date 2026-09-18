/**
 * ★**既知の赤の登録簿が、ちゃんと落とすか**（★RD-2・2026-09-19）
 *   ★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §4
 *
 * 【★なぜ道具に検査を付けるか】
 *   ★`verify-known-red.mjs` は ★**いま「✅ 赤 0 件」と出ます**。
 *   ⚠️ ★**それだけでは「見張れている」の証拠になりません** — ★何も見ていなくても同じ表示です
 *      （★「✅ が別の理由で出ていないか」）。
 *   → ★**4 つの落ち方を、それぞれ実際に起こして**確かめます。
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — ★道具側の部品（`.mjs`）。★型宣言を置くほどの面ではない
import { diffAgainstRegistry, KNOWN_RED } from '../../../tools/lib/known-red.mjs';

interface Diff {
  readonly unregistered: readonly string[];
  readonly staleGreen: readonly string[];
  readonly expired: readonly string[];
  readonly missingFields: readonly string[];
}
interface Row { readonly test: string; readonly why?: string; readonly owner?: string; readonly until?: string }

const diff = (failing: readonly string[], today: string, reg?: readonly Row[]): Diff =>
  (diffAgainstRegistry as (a: readonly string[], b: string, c?: readonly Row[]) => Diff)(failing, today, reg);

const OK: Row = { test: 'a.test.ts > x > y', why: '理由', owner: 'dev', until: '2099-01-01' };

describe('★4 つの落ち方を、それぞれ起こして確かめる', () => {
  it('🔴 ① ★登録簿に無い赤を拾う', () => {
    const d = diff(['b.test.ts > p > q'], '2026-09-19', [OK]);
    expect(d.unregistered).toEqual(['b.test.ts > p > q']);
  });

  it('★登録簿にあれば通す（★完全一致）', () => {
    expect(diff([OK.test], '2026-09-19', [OK]).unregistered).toEqual([]);
    /** ⚠️ ★部分一致では通さない（★名前の一部が同じ別の検査を「既知」にしない） */
    expect(diff(['a.test.ts > x > y の続き'], '2026-09-19', [OK]).unregistered).toHaveLength(1);
  });

  it('🔴 ② ★緑に戻ったのに登録が残っていたら落とす（★悲観的な登録簿は本当の赤を隠す）', () => {
    expect(diff([], '2026-09-19', [OK]).staleGreen).toEqual([OK.test]);
  });

  it('🔴 ③ ★期限が切れた登録を落とす', () => {
    const old: Row = { ...OK, until: '2026-09-18' };
    expect(diff([old.test], '2026-09-19', [old]).expired).toHaveLength(1);
    expect(diff([OK.test], '2026-09-19', [OK]).expired).toEqual([]);
  });

  it('🔴 ④ ★理由・担当・期限が欠けた登録を落とす', () => {
    for (const bad of [{ test: 't' }, { test: 't', why: 'w' }, { test: 't', why: 'w', owner: 'dev' }]) {
      expect(diff(['t'], '2026-09-19', [bad as Row]).missingFields, JSON.stringify(bad)).toHaveLength(1);
    }
    expect(diff([OK.test], '2026-09-19', [OK]).missingFields).toEqual([]);
  });
});

describe('★実物の登録簿', () => {
  it('🔴 ★載っているなら 4 つの欄が揃っていて、期限が切れていない', () => {
    const names = (KNOWN_RED as readonly Row[]).map((r) => r.test);
    /** ⚠️ ★`1970-01-01` と比べるので、★載っていれば必ず未来でなければならない */
    const d = diff(names, '1970-01-01', KNOWN_RED as readonly Row[]);
    expect(d.missingFields, '★why / owner / until が欠けた登録がある').toEqual([]);
    expect(d.expired, '★期限切れの登録がある').toEqual([]);
  });
});
