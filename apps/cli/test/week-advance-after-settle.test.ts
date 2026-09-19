/**
 * ★**週送りは、確定より「後」に走る**（★**DS-5 ④** の前提・2026-09-19）
 *   ★裁定: レビュー側の指摘（★「その正しさが、SQL に書かれていない前提に乗っています」）
 *
 * 【★なぜこの並びを固定するか】
 *   ★`scratchRetiredEntries` は ★**`retired_at_week <= 発走時刻の週`** で取消を切ります（`scratch.ts`）。
 *   ★境界（★`retired_at_week == 発走の週`）が誤爆しないのは、★**この並びのおかげだけ**です:
 *
 *     ★週 W が締まるのは W+1 の周。★`retired_at_week = W` が DB に現れるのは
 *     ★**W のレースが全部 終わった後**。→ ★**W のレースが `retired_at_week = W` を見ることはない。**
 *
 *   🔴 ★**並びが入れ替わると、`<=` が静かに誤爆します** —
 *     ★レースの最中／後に引退した馬まで取消になり、★**走った馬の結果を消し、
 *     ★その馬を含む馬券を返します**（§9.1）。★DS-5 ④ が防ごうとした当のものです。
 *
 * 【⚠️ ★入れ替える理由は実際に在ります】
 *   ★`main.ts` の註記自身が「★前に置くと、7,000 頭の週送りが終わるまで確定が待たされる」と
 *   ★書いています。★**逆向きの圧力（D-038）を知っている人なら動かしえます。**
 *   → ★★**だから、速さの理由で置いた並びを、★正しさの理由でも固定します。**
 *
 * 【⚠️ ★`cycle-runner.test.ts` の D-038 の検査とは別ものです】
 *   ★あちらは ★**1 周の中**の並び（`retire-check` → `settle` → `cancel` → 生成）。
 *   ★こちらは ★**周と週送りの間**の並び。★**片方だけだと、守られている気になります。**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MAIN = path.join(ROOT, 'apps/worker/src/main.ts');

/**
 * ★目印は ★**1 か所しか無いこと**を先に確かめます（★R-21・CK-7）。
 *   ★2 か所あると、どちらを見たのか分からないまま緑になります。
 */
const onlyIndexOf = (src: string, marker: string): number => {
  const first = src.indexOf(marker);
  expect(first, `★目印「${marker}」が main.ts にありません`).toBeGreaterThanOrEqual(0);
  expect(
    src.indexOf(marker, first + 1),
    `★目印「${marker}」が 2 か所以上あります（★どちらを見たのか分かりません）`,
  ).toBe(-1);
  return first;
};

describe('★DS-5 ④ の前提: 週送りは確定より後', () => {
  const src = readFileSync(MAIN, 'utf8');

  it('🔴 ★`runCycle`（確定を含む）が、★`advanceTrainingWeeks`（週送り）より **前** にある', () => {
    const cycle = onlyIndexOf(src, 'await runCycle(');
    const week = onlyIndexOf(src, 'await advanceTrainingWeeks(');
    expect(
      cycle,
      '🔴 ★週送りが確定より前に来ました。★`scratch.ts` の `retired_at_week <= 発走の週` が'
        + '★**レース中／後に引退した馬まで取消**にします（★DS-5 ④ が防いだもの）。'
        + '★並びを戻すか、★`<` に変えるか、★別の切り方にしてください。',
    ).toBeLessThan(week);
  });

  it('★対照: 上の検査が空振りでない（★2 つの目印が別の場所にある）', () => {
    /**
     * ⚠️ ★両方が `-1` でも `-1 < -1` は偽なので上は落ちますが、
     *    ★**「同じ場所を 2 回 見ていないこと」**は別に言う必要があります。
     */
    expect(onlyIndexOf(src, 'await runCycle(')).not.toBe(onlyIndexOf(src, 'await advanceTrainingWeeks('));
  });

  it('🔴 ★`scratch.ts` に、★この並びへの依存が書いてある（★書いていないと、次の人が動かす）', () => {
    const scratch = readFileSync(path.join(ROOT, 'apps/worker/src/scratch.ts'), 'utf8');
    expect(scratch, '★週送りとの順序への依存が書かれていない').toContain('週送り');
    expect(scratch, '★どこに依存しているかが書かれていない').toContain('advanceTrainingWeeks');
  });
});
