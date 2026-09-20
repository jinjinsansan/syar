/**
 * 🔴 ★**「0 件 通過」を合格として返せない**（★**CK-14**・2026-09-20）
 *
 * 【★なぜこの部品が要ったか】
 *   ★`CK-14` を作った本人（★私）が、★**その 10 分後に踏みました**:
 *   ```
 *   照合して一致 0 本 ／ 食い違い 0 本 ／ 版不明 20 本 → ★終了コード 0
 *   ```
 *   → ★★**「気をつける」は効きませんでした。** ★だから部品にしました。
 *
 * 【★この検査が守るもの】
 *   ★部品そのものが ★**3 つの答えを返し分ける**こと（★通す／落とす／**判定不能**）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { VERDICT, verdictOf } from '../../../tools/lib/counted-verdict.mjs';

interface V { code: number; lines: string[] }
const of = (a: Record<string, unknown>): V => verdictOf(a) as V;

describe('🔴 ★CK-14: 0 件 通過を合格にしない', () => {
  it('✅ ★数えて、★不合格 0 → ★合格', () => {
    expect(of({ checked: 10, failed: 0, label: 'x' }).code).toBe(VERDICT.PASS);
  });

  it('🔴 ★数えて、★不合格あり → ★不合格', () => {
    expect(of({ checked: 10, failed: 3, label: 'x' }).code).toBe(VERDICT.FAIL);
  });

  it('🔴🔴 ★**1 件も数えていない → ★判定不能（★合格にしない）**', () => {
    const v = of({ checked: 0, failed: 0, label: 'x' });
    expect(v.code, '★0 件 なのに合格を返した（★CK-14 の穴）').toBe(VERDICT.UNDECIDABLE);
    expect(v.lines.join(' '), '★理由を言っていない').toMatch(/合格.*ではありません/);
  });

  it('★数えられなかった内訳を出す（★なぜ 0 件 だったかが読める）', () => {
    const v = of({
      checked: 0, failed: 0, label: 'x',
      skipped: { '版不明': 20, '入力が欠けている': 0, '対象外': 5 },
    });
    const text = v.lines.join(' ');
    expect(text, '★内訳が出ていない').toMatch(/版不明 20/);
    expect(text, '★0 件のものまで並べている（★読みにくい）').not.toMatch(/入力が欠けている/);
  });

  it('🔴 ★数え方が壊れていたら**投げる**（★黙って通さない）', () => {
    expect(() => of({ checked: 3, failed: 5, label: 'x' }), '★不合格が総数を超えている')
      .toThrow(/超えています/);
    expect(() => of({ checked: -1, failed: 0, label: 'x' })).toThrow(/checked/);
    expect(() => of({ checked: 1.5, failed: 0, label: 'x' })).toThrow(/checked/);
  });

  it('⚠️ ★終了コードの意味が、★数字で書き写されていない', () => {
    expect(VERDICT).toEqual({ PASS: 0, FAIL: 1, UNDECIDABLE: 2 });
  });
});
