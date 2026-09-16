/**
 * ★**能力の発見度**（★第 2 便・2026-09-16・正典 D-108・§5.5・§12.4）
 *
 * 【★見ている壊れ方】
 *   ① ★発見度が**素質の値から作られる**（★内部値を表示の層に持ち込む・D-108）
 *   ② ★段階の途中で**評価や数値が漏れる**（★「？？？」のはずが A と出る）
 *   ③ ★経験が増えたのに段階が下がる（★単調でない）
 * 【★①の見方】★**入力の形**で見ます（★引数に素質を渡す口が無い）。★禁止語の一覧では書きません（D-098 の穴）。
 */
import { describe, it, expect } from 'vitest';
import { discoveryStageOf, discoveryLabelOf, discoveryAdvanced, DISCOVERY_STAGES, DISCOVERY_STEPS } from '../src/index.js';

describe('★能力の発見度（D-108）', () => {
  it('① ★引数は「経験の回数」だけ（★素質を渡す口が無い）', () => {
    /** ★引数 1 つ。★`potential` や `stats` を足せばここが変わる */
    expect(discoveryStageOf.length).toBe(1);
    /** ★同じ回数なら、どの馬でも同じ段階（★馬ごとの内部値に依存しない） */
    expect(discoveryStageOf(3)).toBe(discoveryStageOf(3));
  });

  it('② ★段階は 4 つ。経験が増えるほど進み、下がらない（単調）', () => {
    let prev = -1;
    for (let runs = 0; runs <= 20; runs += 1) {
      const idx = DISCOVERY_STAGES.indexOf(discoveryStageOf(runs));
      expect(idx, `${runs} 回`).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
    expect(discoveryStageOf(0)).toBe('unknown');
    expect(discoveryStageOf(DISCOVERY_STEPS[0]!)).toBe('hint');
    expect(discoveryStageOf(DISCOVERY_STEPS[1]!)).toBe('narrow');
    expect(discoveryStageOf(DISCOVERY_STEPS[2]!)).toBe('known');
    expect(discoveryStageOf(1000)).toBe('known');
  });

  it('③ ★分かる前は評価を出さない（★数値はどの段階でも出さない）', () => {
    expect(discoveryLabelOf('unknown', 'A')).toBe('？？？');
    expect(discoveryLabelOf('hint', 'A')).toBe('得意かも？');
    expect(discoveryLabelOf('narrow', 'A')).toBe('B 以上？');
    expect(discoveryLabelOf('known', 'A')).toBe('A');
    /** ★分かる前の文字に評価が混ざらない */
    for (const stage of ['unknown', 'hint', 'narrow'] as const) {
      expect(discoveryLabelOf(stage, 'A')).not.toContain('A');
    }
  });

  it('④ ★段階が上がった回だけ「判明した」と言える（LR-7: レースの後に呼ぶ）', () => {
    expect(discoveryAdvanced(0, 1), '0 → 1 で hint に上がる').toBe(true);
    expect(discoveryAdvanced(1, 2), '同じ段階の中では上がらない').toBe(false);
    expect(discoveryAdvanced(2, 3), '3 回で narrow').toBe(true);
    expect(discoveryAdvanced(6, 7), '既に known なら上がらない').toBe(false);
  });
});
