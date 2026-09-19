/**
 * ★**同じ名前で別の量を輸出しない**（★`COND-COEF-SAME-NAME`・2026-09-19）
 *
 * 【🔴 ★何を守るか】
 *   ★2026-09-19 まで、★`@star/race-engine` と `@star/training` の**両方**が
 *   ★`conditionCoef` という**同じ名前**の関数を輸出していました。★中身は別物です:
 *     - ★レース（正典 §8.3）… ★**0.88〜1.10**
 *     - ★育成（正典 §7.3）… ★**0.7〜1.3**
 *   ★どちらの package も `index.ts` で `export *` しているので、
 *   ★**両方を取り込んだ側では、★読み手にどちらが入ったか分かりません。**
 *   ★`apps/cli/src/race-field.ts` は実際に両方から取り込んでいます。
 *
 * 【⚠️ ★機械は止めてくれません（★`NT-10'`: ★止める検査を名指しする）】
 *   ★TypeScript は ★**別々の package が同じ名前を輸出すること自体は許します。**
 *   ★落ちるのは「1 つの barrel が両方を `export *` したとき」だけで、
 *   ★いまその barrel はありません。→ ★**型検査はこれを止めません。この検査が止めます。**
 *
 * 【⚠️ ★この検査が見ないもの】
 *   ★見ているのは ★**実行時に値として出る名前**だけです（★`import *` に出るもの）。
 *   ★`type` / `interface` は消えるので数に入りません。★そこは見ていません。
 */
import { describe, it, expect } from 'vitest';
import * as raceEngine from '@star/race-engine';
import * as training from '@star/training';

/** ★`import *` の名前空間から、★値として出ている名前を取る */
function exportedNames(ns: Record<string, unknown>): readonly string[] {
  return Object.keys(ns).filter((k) => k !== 'default' && k !== '__esModule').sort();
}

describe('★COND-COEF-SAME-NAME: package をまたいだ同名の輸出', () => {
  it('🔴 ★`@star/race-engine` と `@star/training` に**同じ名前**は 1 つも無い', () => {
    const a = new Set(exportedNames(raceEngine as unknown as Record<string, unknown>));
    const b = exportedNames(training as unknown as Record<string, unknown>);
    const both = b.filter((name) => a.has(name));

    /**
     * 🔴 ★**対照**（★「0 件」が別の理由で出ていないか）。
     *   ★barrel が空だったり、★解決に失敗して `{}` が入っていても、
     *   ★交わりは 0 件になります。★**空でないことを先に言います。**
     *   ★2026-09-19 の実測: ★race-engine 100・★training 102（★値の輸出のみ）。
     */
    expect(a.size, '★`@star/race-engine` の輸出が空です。★交わり 0 件は無意味').toBeGreaterThan(50);
    expect(b.length, '★`@star/training` の輸出が空です。★交わり 0 件は無意味').toBeGreaterThan(50);

    /**
     * ⚠️ ★**数だけでなく名前も出します**（★落ちたときに「どれが」が要るので）。
     * ★2026-09-19 の改名の**直前**は、★これが `['conditionCoef']`（★1 件）でした
     * ★（★`git show HEAD:` の中身で実測。★「落ちたはず」ではなく**落ちました**）。
     */
    expect(both, `★両方の package が同じ名前を輸出しています: ${both.join(', ')}`).toEqual([]);
  });

  it('🔴 ★分けた 2 つは**別の量**である（★統合しないための錨）', () => {
    /**
     * 🔴 ★「線形で 0..5 を写す」という**形が同じ**なので、
     *   ★いつか「1 つにまとめられる」と言い出す人が出ます。★**幅が違います。**
     *   ★同じ入力で**違う数**が出ることを、ここに留めます。
     */
    const forRace = raceEngine.conditionCoefForRace(3, raceEngine.DEFAULT_RACE_BALANCE);
    const forTraining = training.conditionCoefForTraining(3);

    expect(forRace).toBeCloseTo(1.012, 10);
    expect(forTraining).toBeCloseTo(1.06, 10);
    expect(forRace, '★2 つが同じ数になりました。★統合されていないか確かめること').not.toBeCloseTo(
      forTraining,
      10,
    );

    // ★両端でも幅が違う（★正典 §8.3 = 0.88〜1.10 ／ §7.3 = 0.7〜1.3）
    expect(raceEngine.conditionCoefForRace(0, raceEngine.DEFAULT_RACE_BALANCE)).toBeCloseTo(0.88, 10);
    expect(raceEngine.conditionCoefForRace(5, raceEngine.DEFAULT_RACE_BALANCE)).toBeCloseTo(1.1, 10);
    expect(training.conditionCoefForTraining(0)).toBeCloseTo(0.7, 10);
    expect(training.conditionCoefForTraining(5)).toBeCloseTo(1.3, 10);
  });

  it('⚠️ ★旧い名前 `conditionCoef` は、★どちらの package からも**出ていない**', () => {
    /**
     * ⚠️ ★内訳（`breakdown`）の**欄**の名前は `conditionCoef` のままです（★正典に合わせて）。
     *   ★ここが見ているのは ★**package の輸出**であって、★欄の名前ではありません。
     */
    expect(exportedNames(raceEngine as unknown as Record<string, unknown>)).not.toContain('conditionCoef');
    expect(exportedNames(training as unknown as Record<string, unknown>)).not.toContain('conditionCoef');
  });
});
